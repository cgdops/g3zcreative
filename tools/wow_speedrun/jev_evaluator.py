"""
Jev Semantic Evaluator for WoW Speedrun Quests.
Uses TypeSafe System One models (Jev) to evaluate qualitative Wowhead notes,
extracting calibrated Noul (trap probability) and Score (friction/danger) metrics.
"""

import os
import json
from pathlib import Path
from dotenv import load_dotenv

# Ensure environment variables are loaded
load_dotenv(Path(__file__).resolve().parents[2] / ".env")

try:
    from typesafe_sdk import TypeSafeClient, Noul, Score
except ImportError:
    TypeSafeClient = None
    Noul = None
    Score = None

CACHE_FILE = Path(__file__).resolve().parent / "cache" / "jev_evaluations.json"


class JevQuestEvaluator:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("TYPESAFE_API_KEY")
        if not self.api_key:
            raise ValueError("TYPESAFE_API_KEY environment variable is missing in .env")
        
        if TypeSafeClient is None:
            raise ImportError("typesafe_sdk package is not installed. Run 'pip install typesafe-sdk'")
        
        self.client = TypeSafeClient(api_key=self.api_key)
        self.cache = self._load_cache()

    def _load_cache(self) -> dict:
        if CACHE_FILE.exists():
            try:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception:
                return {}
        return {}

    def _save_cache(self) -> None:
        CACHE_FILE.parent.mkdir(parents=True, exist_ok=True)
        with open(CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(self.cache, f, indent=2)

    def evaluate_quest(self, quest: dict, player_class: str = "Hunter", force_refresh: bool = False) -> dict:
        cache_key = f"{quest['id']}_{player_class.lower()}"
        
        if not force_refresh and cache_key in self.cache:
            return self.cache[cache_key]

        state = {
            "quest_name": quest["name"],
            "zone": quest["zone"],
            "level_context": f"Req Level {quest['req_level']}, Quest Level {quest['quest_level']}",
            "objective": quest["objective_summary"],
            "player_class": player_class,
            "wowhead_community_notes": quest["wowhead_notes"],
        }

        questions = {
            "is_trap": Noul(
                instructions=(
                    "Evaluate if this quest is an efficiency trap for solo speedrun leveling. "
                    "A trap quest has low item drop rate RNG (<40%), requires sparse wandering mobs, "
                    "involves a slow unskippable escort NPC, or causes excessive travel distance for poor reward."
                )
            ),
            "friction": Score(
                instructions="Rate the combat danger, mob density, and mortality risk for a solo player at level.",
                criteria=["trivial", "low_risk", "moderate_friction", "death_trap"],
            ),
        }

        response = self.client.system_one(state=state, questions=questions)

        trap_prob = float(response.nouls["is_trap"].noul)
        # Score returns a continuous float value along the criteria scale [0.0 to 3.0]
        friction_val = float(response.scores["friction"].score)

        evaluation = {
            "quest_id": quest["id"],
            "quest_name": quest["name"],
            "player_class": player_class,
            "trap_probability": round(trap_prob, 3),
            "friction_score": round(friction_val, 3),
            "is_trap_flagged": trap_prob >= 0.55,
        }

        self.cache[cache_key] = evaluation
        self._save_cache()
        return evaluation

    def evaluate_all(self, quests: list[dict], player_class: str = "Hunter", force_refresh: bool = False) -> dict[str, dict]:
        evaluations = {}
        for q in quests:
            evaluations[q["id"]] = self.evaluate_quest(q, player_class=player_class, force_refresh=force_refresh)
        return evaluations
