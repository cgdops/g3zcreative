"""
Jev Semantic Evaluator for WoW Classic Gold Farming Spots.
Uses TypeSafe System One (Jev) to evaluate practical farmability,
Horde route safety, and combat friction for high-yield candidates.
"""

import os
import json
from pathlib import Path
from typing import Dict, Any
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

try:
    from typesafe_sdk import TypeSafeClient, Noul, Score
except ImportError:
    TypeSafeClient = None
    Noul = None
    Score = None

CACHE_FILE = Path(__file__).resolve().parent / "cache" / "jev_farm_evaluations.json"

class JevFarmEvaluator:
    def __init__(self, api_key: str | None = None):
        self.api_key = api_key or os.getenv("TYPESAFE_API_KEY")
        if not self.api_key:
            raise ValueError("TYPESAFE_API_KEY environment variable is missing in .env")
        if TypeSafeClient is None:
            raise ImportError("typesafe_sdk package is not installed.")

        self.client = TypeSafeClient(api_key=self.api_key)
        self.cache = self._load_cache()

    def _load_cache(self) -> Dict[str, Any]:
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

    def evaluate_mob(self, npc: Dict[str, Any], valuation: Dict[str, Any], force_refresh: bool = False) -> Dict[str, Any]:
        mob_id = str(npc["id"])
        if not force_refresh and mob_id in self.cache:
            return self.cache[mob_id]

        top_drop_names = [d["name"] for d in valuation.get("top_drops", [])[:3]]
        state = {
            "npc_name": npc["name"],
            "npc_level": f"{npc.get('minlevel', '?')}-{npc.get('maxlevel', '?')}",
            "zone": npc.get("zone_name", "Unknown Zone"),
            "faction_context": "Solo Horde Player",
            "ev_gold_per_kill": valuation.get("total_ev_gold", 0.0),
            "notable_drops": top_drop_names,
        }

        questions = {
            "is_trap": Noul(
                instructions=(
                    "Evaluate if this mob is an efficiency trap for a solo Horde player trying to farm gold. "
                    "A mob is a trap if it is in deep Alliance-only territory (e.g. Westfall, Elwynn, Duskwood), "
                    "is heavily contested, flees into dense social packs causing death, or has lethal CC abilities."
                )
            ),
            "farmability": Score(
                instructions="Rate the farming efficiency, safety, and camp quality for a solo Horde player.",
                criteria=[
                    "hostile_alliance_territory_or_gank_hub",
                    "high_friction_suboptimal",
                    "viable_farming_spot",
                    "prime_horde_gold_hotspot"
                ],
            ),
        }

        try:
            response = self.client.system_one(state=state, questions=questions)
            trap_prob = float(response.nouls["is_trap"].noul)
            farmability_score = float(response.scores["farmability"].score)
        except Exception as e:
            print(f"Jev API call error for mob {npc['name']}: {e}")
            trap_prob = 0.5
            farmability_score = 1.5

        evaluation = {
            "npc_id": npc["id"],
            "npc_name": npc["name"],
            "zone": npc.get("zone_name"),
            "trap_probability": round(trap_prob, 3),
            "farmability_score": round(farmability_score, 3),
            "is_trap_flagged": trap_prob >= 0.50,
        }

        self.cache[mob_id] = evaluation
        self._save_cache()
        return evaluation
