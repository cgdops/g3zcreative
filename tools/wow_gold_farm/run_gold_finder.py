"""
Orchestrator for Wowhead Classic Era NPC Gold Farming Optimization.
Combines deterministic drop valuation math with Jev semantic judgment.
"""

import sys
import os
import json
from pathlib import Path

# Add project root to path
sys.path.append(str(Path(__file__).resolve().parent))

from loot_valuator import calculate_expected_copper_per_kill
from jev_farm_evaluator import JevFarmEvaluator

DATA_FILE = Path(__file__).resolve().parent / "data" / "classic_era_mobs.json"

def run_pipeline():
    print("=" * 80)
    print("WOW CLASSIC ERA HORDE GOLD FARMING OPTIMIZER: MATH + JEV EVALUATION")
    print("=" * 80)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        all_mobs = json.load(f)

    jev = JevFarmEvaluator()

    # Group mobs by bracket
    brackets = {}
    for mob in all_mobs:
        b = mob["bracket"]
        brackets.setdefault(b, []).append(mob)

    final_report = []

    for bracket_name, mobs in brackets.items():
        print(f"\n>>> Bracket: {bracket_name} ({len(mobs)} candidates evaluated)")
        candidates_scored = []

        for mob in mobs:
            valuation = calculate_expected_copper_per_kill(mob, mob["drops"])
            mob["zone_name"] = mob["zone"]
            jev_eval = jev.evaluate_mob(mob, valuation)

            candidates_scored.append({
                "mob": mob,
                "val": valuation,
                "jev": jev_eval
            })

            top_loot_names = ", ".join([f"{d['name']} ({d['drop_rate_pct']}%)" for d in valuation["top_drops"][:2]])
            print(f"  * {mob['name']} ({mob['zone']}): EV = {valuation['total_ev_gold']:.3f}g/kill | "
                  f"Key Drops: [{top_loot_names}] | "
                  f"Jev Trap: {jev_eval['trap_probability']:.2f} | Farmability: {jev_eval['farmability_score']:.2f}")

        # Choose the optimal mob: highest farmability that is not a flagged trap (or highest EV if scores match)
        candidates_scored.sort(
            key=lambda x: (
                0 if x["jev"]["is_trap_flagged"] else 1,
                x["jev"]["farmability_score"],
                x["val"]["total_ev_copper"]
            ),
            reverse=True
        )

        champ = candidates_scored[0]
        c_mob = champ["mob"]
        c_val = champ["val"]
        c_jev = champ["jev"]

        key_drop_summary = ", ".join([f"{d['name']} ({d['drop_rate_pct']}%)" for d in c_val["top_drops"][:2]])

        final_report.append({
            "bracket": bracket_name,
            "champion": c_mob["name"],
            "zone": c_mob["zone"],
            "levels": f"{c_mob['minlevel']}-{c_mob['maxlevel']}",
            "ev_gold": c_val["total_ev_gold"],
            "key_drops": key_drop_summary,
            "trap_prob": c_jev["trap_probability"],
            "farm_score": c_jev["farmability_score"],
            "notes": c_mob.get("notes", "")
        })

    print("\n" + "=" * 90)
    print("FINAL OPTIMIZED HORDE GOLD FARMING CHAMPIONS (BY LEVEL)")
    print("=" * 90)
    print(f"{'Bracket':<14} | {'Champion Mob':<24} | {'Zone':<18} | {'EV Gold/Kill':<12} | {'Farm Score':<10}")
    print("-" * 90)
    for r in final_report:
        print(f"{r['bracket']:<14} | {r['champion']:<24} | {r['zone']:<18} | {r['ev_gold']:<12.3f} | {r['farm_score']:<10.2f}")

    return final_report

if __name__ == "__main__":
    run_pipeline()
