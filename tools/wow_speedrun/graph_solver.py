"""
Deterministic Graph & Speedrun Route Solver for WoW Classic (Mulgore -> Barrens).
Handles XP formulas, DAG prerequisites, spatial travel times, hearthstone cooldowns,
and incorporates Jev's semantic trap pruning and friction weighting.
"""

import math
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple, Set

# Classic WoW XP required to advance from current level to next (Level 1 to 20)
LEVEL_XP_REQUIREMENTS = {
    1: 400,
    2: 900,
    3: 1400,
    4: 2100,
    5: 2800,
    6: 3600,
    7: 4500,
    8: 5400,
    9: 6500,
    10: 7600,
    11: 8700,
    12: 9800,
    13: 11000,
    14: 12300,
    15: 13600,
    16: 15000,
    17: 16400,
    18: 17900,
    19: 19500,
    20: 21200,
}

# Yards per coordinate percentage unit per zone
ZONE_SCALE_YARDS = {
    "Mulgore": 38.0,
    "The Barrens": 65.0,
}

# Run speed in yards per second (100% normal run speed)
RUN_SPEED_YPS = 7.0

# Hearthstone cooldown in minutes
HEARTHSTONE_COOLDOWN_MINUTES = 60.0


@dataclass
class RouteStep:
    step_num: int
    action_type: str  # "PICKUP", "TRAVEL", "OBJECTIVE", "TURNIN", "HEARTH", "FLIGHT"
    quest_id: Optional[str]
    quest_name: Optional[str]
    zone: str
    location_desc: str
    coords: Tuple[float, float]
    duration_minutes: float
    xp_gained: int
    char_level: int
    total_xp: int
    cumulative_time_minutes: float
    notes: str
    jev_data: Optional[dict] = None


@dataclass
class PlayerState:
    level: int = 1
    current_xp: int = 0
    total_xp: int = 0
    coords: Tuple[float, float] = (44.2, 77.0)  # Camp Narache start
    zone: str = "Mulgore"
    hub: str = "Camp Narache"
    hearth_hub: str = "Camp Narache"
    hearth_coords: Tuple[float, float] = (44.2, 77.0)
    hearth_cd_timer: float = 0.0  # minutes until usable
    elapsed_minutes: float = 0.0
    active_quests: Set[str] = field(default_factory=set)
    completed_quests: Set[str] = field(default_factory=set)


class SpeedrunGraphSolver:
    def __init__(self, quests: List[dict], jev_evaluations: Optional[Dict[str, dict]] = None):
        self.raw_quests = {q["id"]: q for q in quests}
        self.jev_evaluations = jev_evaluations or {}

    def calculate_distance_yards(self, zone1: str, c1: Tuple[float, float], zone2: str, c2: Tuple[float, float]) -> float:
        if zone1 != zone2:
            # Inter-zone travel penalty (mountain passes / transitions)
            return 3200.0  # Approx ~7.6 minutes run or flight path
        scale = ZONE_SCALE_YARDS.get(zone1, 45.0)
        dx = (c1[0] - c2[0]) * scale
        dy = (c1[1] - c2[1]) * scale
        return math.sqrt(dx * dx + dy * dy)

    def calculate_travel_minutes(self, zone1: str, c1: Tuple[float, float], zone2: str, c2: Tuple[float, float]) -> float:
        if zone1 != zone2:
            # Flight path Thunder Bluff <-> Crossroads is 2.2 minutes
            return 2.5
        yards = self.calculate_distance_yards(zone1, c1, zone2, c2)
        return (yards / RUN_SPEED_YPS) / 60.0

    def calculate_quest_xp(self, quest: dict, char_level: int) -> int:
        base_xp = quest["base_xp"]
        q_lvl = quest["quest_level"]
        
        # Classic WoW XP scaling decay for out-leveled quests
        level_diff = char_level - q_lvl
        if level_diff <= 5:
            multiplier = 1.0
        elif level_diff == 6:
            multiplier = 0.8
        elif level_diff == 7:
            multiplier = 0.6
        elif level_diff == 8:
            multiplier = 0.4
        elif level_diff == 9:
            multiplier = 0.2
        else:
            multiplier = 0.1
        
        scaled_quest_xp = int(base_xp * multiplier)
        mob_kills = quest.get("mob_kills_needed", 0)
        avg_mob_xp = quest.get("avg_mob_xp", 0)
        mob_xp = mob_kills * avg_mob_xp

        return scaled_quest_xp + mob_xp

    def is_quest_eligible(self, quest: dict, state: PlayerState, use_jev_pruning: bool = True, trap_threshold: float = 0.55) -> bool:
        qid = quest["id"]
        if qid in state.completed_quests or qid in state.active_quests:
            return False
        
        if state.level < quest["req_level"]:
            return False

        # Verify all prerequisites are completed
        for prereq in quest.get("prereqs", []):
            if prereq not in state.completed_quests:
                return False

        # Jev Semantic Pruning
        if use_jev_pruning and qid in self.jev_evaluations:
            jev_data = self.jev_evaluations[qid]
            if jev_data.get("trap_probability", 0.0) >= trap_threshold:
                return False

        return True

    def solve_route(
        self,
        target_level: int = 20,
        use_jev: bool = True,
        trap_threshold: float = 0.55,
    ) -> Tuple[List[RouteStep], PlayerState, Dict[str, any]]:
        state = PlayerState()
        steps: List[RouteStep] = []
        step_counter = 1

        pruned_count = 0
        total_jev_flags = 0

        while state.level < target_level:
            # 1. Identify all eligible quests right now
            eligible = [
                q for q in self.raw_quests.values()
                if self.is_quest_eligible(q, state, use_jev_pruning=use_jev, trap_threshold=trap_threshold)
            ]

            if not eligible and not state.active_quests:
                # If no quests remain in this pool, simulate grinding high XP/hr mobs to reach next milestone
                xp_needed = LEVEL_XP_REQUIREMENTS.get(state.level, 10000) - state.current_xp
                grind_duration = (xp_needed / 120.0) / 60.0  # ~7.2k XP/hr mob grinding
                state.current_xp += xp_needed
                state.total_xp += xp_needed
                state.elapsed_minutes += grind_duration
                state.level += 1
                state.current_xp = 0
                
                steps.append(RouteStep(
                    step_num=step_counter,
                    action_type="GRIND",
                    quest_id=None,
                    quest_name="Mob Grinding (Grind Gap)",
                    zone=state.zone,
                    location_desc=f"Grinding local mobs in {state.zone} to level up",
                    coords=state.coords,
                    duration_minutes=round(grind_duration, 1),
                    xp_gained=xp_needed,
                    char_level=state.level,
                    total_xp=state.total_xp,
                    cumulative_time_minutes=round(state.elapsed_minutes, 1),
                    notes=f"Leveled up to {state.level} via optimal mob grinding to bridge quest bracket.",
                ))
                step_counter += 1
                continue

            # 2. Score eligible quests by XP Rate (XP per estimated minute)
            best_candidate = None
            best_score = -1.0
            best_circuit_details = None

            # Cluster quests by nearby hub / zone to minimize travel
            for quest in eligible:
                q_coords = tuple(quest["objective_coords"])
                pickup_coords = tuple(quest["pickup_coords"])
                turnin_coords = tuple(quest["turnin_coords"])

                # Travel time from current pos to pickup
                t_pickup = self.calculate_travel_minutes(state.zone, state.coords, quest["zone"], pickup_coords)
                # Objective travel & completion
                t_obj_travel = self.calculate_travel_minutes(quest["zone"], pickup_coords, quest["zone"], q_coords)
                
                # Base completion time
                base_duration = 1.0 + (quest["mob_kills_needed"] * 0.22)
                
                # Jev Friction adjustments
                friction_penalty = 0.0
                jev_info = self.jev_evaluations.get(quest["id"])
                if jev_info:
                    # Friction score adds risk/safety downtime (0 to 3.0 -> 0 to 4.5 mins)
                    friction_penalty = jev_info.get("friction_score", 0.0) * 1.5

                # Turnin travel
                t_turnin = self.calculate_travel_minutes(quest["zone"], q_coords, quest["zone"], turnin_coords)
                
                total_time = t_pickup + t_obj_travel + base_duration + friction_penalty + t_turnin
                xp = self.calculate_quest_xp(quest, state.level)

                # Prioritize same-zone quests strongly to prevent ping-ponging
                zone_bonus = 1.8 if quest["zone"] == state.zone else 0.8
                xp_rate = (xp / max(total_time, 0.5)) * zone_bonus

                if xp_rate > best_score:
                    best_score = xp_rate
                    best_candidate = quest
                    best_circuit_details = {
                        "t_pickup": t_pickup,
                        "t_obj_travel": t_obj_travel,
                        "base_duration": base_duration,
                        "friction_penalty": friction_penalty,
                        "t_turnin": t_turnin,
                        "total_time": total_time,
                        "xp": xp,
                    }

            if not best_candidate:
                break

            q = best_candidate
            details = best_circuit_details
            jev_data = self.jev_evaluations.get(q["id"])

            # Execute Pickup Step
            if state.coords != tuple(q["pickup_coords"]) or state.zone != q["zone"]:
                state.elapsed_minutes += details["t_pickup"]
                state.coords = tuple(q["pickup_coords"])
                state.zone = q["zone"]
                state.hub = q["hub"]

            # Update Hearthstone bind if entering a major hub
            if q["hub"] in ["Bloodhoof Village", "The Crossroads"] and state.hearth_hub != q["hub"]:
                state.hearth_hub = q["hub"]
                state.hearth_coords = tuple(q["pickup_coords"])
                steps.append(RouteStep(
                    step_num=step_counter,
                    action_type="HEARTH_BIND",
                    quest_id=None,
                    quest_name="Set Hearthstone",
                    zone=state.zone,
                    location_desc=f"Innkeeper in {q['hub']}",
                    coords=state.coords,
                    duration_minutes=0.2,
                    xp_gained=0,
                    char_level=state.level,
                    total_xp=state.total_xp,
                    cumulative_time_minutes=round(state.elapsed_minutes, 1),
                    notes=f"Bind Hearthstone at {q['hub']} for rapid turnaround.",
                ))
                step_counter += 1

            # Pickup action
            steps.append(RouteStep(
                step_num=step_counter,
                action_type="PICKUP",
                quest_id=q["id"],
                quest_name=q["name"],
                zone=state.zone,
                location_desc=f"{q['pickup_npc']} ({q['hub']})",
                coords=state.coords,
                duration_minutes=0.3,
                xp_gained=0,
                char_level=state.level,
                total_xp=state.total_xp,
                cumulative_time_minutes=round(state.elapsed_minutes, 1),
                notes=f"Accept: {q['objective_summary']}",
                jev_data=jev_data,
            ))
            step_counter += 1
            state.active_quests.add(q["id"])

            # Objective Execution Step
            obj_time = details["t_obj_travel"] + details["base_duration"] + details["friction_penalty"]
            state.elapsed_minutes += obj_time
            state.coords = tuple(q["objective_coords"])

            steps.append(RouteStep(
                step_num=step_counter,
                action_type="OBJECTIVE",
                quest_id=q["id"],
                quest_name=q["name"],
                zone=state.zone,
                location_desc=f"Objective area near {q['objective_coords']}",
                coords=state.coords,
                duration_minutes=round(obj_time, 1),
                xp_gained=int(q.get("mob_kills_needed", 0) * q.get("avg_mob_xp", 0)),
                char_level=state.level,
                total_xp=state.total_xp,
                cumulative_time_minutes=round(state.elapsed_minutes, 1),
                notes=f"Complete: {q['objective_summary']} (Jev Friction: {jev_data.get('friction_score', 0) if jev_data else 0:.1f})",
                jev_data=jev_data,
            ))
            step_counter += 1

            # Turn-in Step
            state.elapsed_minutes += details["t_turnin"]
            state.coords = tuple(q["turnin_coords"])
            state.active_quests.remove(q["id"])
            state.completed_quests.add(q["id"])

            xp_gained = details["xp"]
            state.current_xp += xp_gained
            state.total_xp += xp_gained

            # Check level up
            req_xp = LEVEL_XP_REQUIREMENTS.get(state.level, 25000)
            while state.current_xp >= req_xp and state.level < 60:
                state.current_xp -= req_xp
                state.level += 1
                req_xp = LEVEL_XP_REQUIREMENTS.get(state.level, 25000)

            steps.append(RouteStep(
                step_num=step_counter,
                action_type="TURNIN",
                quest_id=q["id"],
                quest_name=q["name"],
                zone=state.zone,
                location_desc=f"{q['turnin_npc']} ({q['hub']})",
                coords=state.coords,
                duration_minutes=0.3,
                xp_gained=xp_gained,
                char_level=state.level,
                total_xp=state.total_xp,
                cumulative_time_minutes=round(state.elapsed_minutes, 1),
                notes=f"Turn-in {q['name']}. Current Level: {state.level}",
                jev_data=jev_data,
            ))
            step_counter += 1

        summary = {
            "final_level": state.level,
            "total_time_minutes": round(state.elapsed_minutes, 1),
            "total_time_hours": round(state.elapsed_minutes / 60.0, 2),
            "total_xp": state.total_xp,
            "completed_quests_count": len(state.completed_quests),
            "xp_per_hour": round((state.total_xp / max(state.elapsed_minutes / 60.0, 0.1)), 0),
        }

        return steps, state, summary
