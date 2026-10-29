#!/usr/bin/env python3
"""
WoW Classic 1-20 Speedrun Route Optimizer (Mulgore -> Barrens).
Combines TypeSafe's System One (Jev) semantic judgments with deterministic graph search.
"""

import sys
import json
import argparse
from pathlib import Path

# Add project root and local directory to path
BASE_DIR = Path(__file__).resolve().parent
DATA_FILE = BASE_DIR / "data" / "mulgore_barrens_quests.json"
HTML_REPORT_FILE = BASE_DIR / "wow_speedrun_report.html"

from jev_evaluator import JevQuestEvaluator
from graph_solver import SpeedrunGraphSolver


def generate_html_report(
    target_level: int,
    player_class: str,
    trap_threshold: float,
    evaluations: dict,
    naive_steps: list,
    naive_summary: dict,
    opt_steps: list,
    opt_summary: dict,
    quests: list,
    output_path: Path,
):
    time_saved_mins = naive_summary["total_time_minutes"] - opt_summary["total_time_minutes"]
    speedup_pct = (time_saved_mins / max(naive_summary["total_time_minutes"], 1)) * 100.0

    # Build timeline HTML
    timeline_rows = []
    for s in opt_steps:
        badge_color = {
            "PICKUP": "#3b82f6",
            "OBJECTIVE": "#eab308",
            "TURNIN": "#22c55e",
            "HEARTH_BIND": "#a855f7",
            "GRIND": "#f97316",
        }.get(s.action_type, "#6b7280")

        jev_badge = ""
        if s.jev_data:
            trap_val = s.jev_data.get("trap_probability", 0)
            fric_val = s.jev_data.get("friction_score", 0)
            jev_badge = f"""
            <span class="badge" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3);">
              Jev Trap: {trap_val:.2f} | Fric: {fric_val:.1f}
            </span>
            """

        timeline_rows.append(f"""
        <tr class="timeline-row">
          <td class="text-muted">#{s.step_num}</td>
          <td><span class="badge-action" style="background: {badge_color}22; color: {badge_color}; border: 1px solid {badge_color}55;">{s.action_type}</span></td>
          <td><strong>{s.quest_name or s.location_desc}</strong> {jev_badge}</td>
          <td><span class="zone-tag">{s.zone}</span></td>
          <td class="text-mono">({s.coords[0]:.1f}, {s.coords[1]:.1f})</td>
          <td class="text-accent">+{s.xp_gained:,} XP</td>
          <td><strong>Lvl {s.char_level}</strong></td>
          <td class="text-mono">{s.cumulative_time_minutes:.1f}m</td>
        </tr>
        """)

    # Build Jev evaluation audit rows
    audit_rows = []
    quests_by_id = {q["id"]: q for q in quests}
    sorted_evals = sorted(evaluations.values(), key=lambda x: x["trap_probability"], reverse=True)

    for ev in sorted_evals:
        qid = ev["quest_id"]
        q_data = quests_by_id.get(qid, {})
        is_pruned = ev["trap_probability"] >= trap_threshold
        status_badge = (
            '<span class="badge-status status-pruned">PRUNED (TRAP)</span>'
            if is_pruned
            else '<span class="badge-status status-approved">APPROVED ROUTE</span>'
        )

        audit_rows.append(f"""
        <tr>
          <td><strong>{ev['quest_name']}</strong><br><small class="text-muted">{q_data.get('zone', '')} · Req Lvl {q_data.get('req_level', 1)}</small></td>
          <td><span class="trap-score" style="color: {'#ef4444' if is_pruned else '#22c55e'}; font-weight: 700;">{ev['trap_probability']:.2f}</span></td>
          <td>{ev['friction_score']:.2f}</td>
          <td>{status_badge}</td>
          <td class="notes-col"><small>{q_data.get('wowhead_notes', '')}</small></td>
        </tr>
        """)

    html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>WoW Classic 1-20 Speedrun Optimizer · TypeSafe Jev</title>
  <style>
    :root {{
      --bg: #0b0f19;
      --card-bg: #111827;
      --border: #1f2937;
      --text: #f3f4f6;
      --text-muted: #9ca3af;
      --accent: #f59e0b;
      --accent-blue: #38bdf8;
      --success: #22c55e;
      --danger: #ef4444;
      --font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    }}
    * {{ box-sizing: border-box; margin: 0; padding: 0; }}
    body {{
      background: var(--bg);
      color: var(--text);
      font-family: var(--font-family);
      line-height: 1.5;
      padding: 32px 24px;
    }}
    .container {{ max-width: 1280px; margin: 0 auto; }}
    header {{
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 28px;
      padding-bottom: 20px;
      border-bottom: 1px solid var(--border);
    }}
    h1 {{ font-size: 28px; font-weight: 800; color: #fff; letter-spacing: -0.5px; }}
    .subtitle {{ color: var(--text-muted); font-size: 14px; margin-top: 4px; }}
    .badge {{
      display: inline-block;
      font-size: 11px;
      padding: 3px 8px;
      border-radius: 4px;
      font-weight: 600;
    }}
    .badge-action {{
      display: inline-block;
      font-size: 11px;
      padding: 2px 7px;
      border-radius: 4px;
      font-weight: 700;
      letter-spacing: 0.5px;
    }}
    .zone-tag {{
      background: #1e293b;
      color: #94a3b8;
      font-size: 12px;
      padding: 2px 6px;
      border-radius: 4px;
    }}
    .kpi-grid {{
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 16px;
      margin-bottom: 32px;
    }}
    .kpi-card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 20px;
    }}
    .kpi-title {{ font-size: 12px; font-weight: 600; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; }}
    .kpi-value {{ font-size: 32px; font-weight: 800; color: #fff; margin-top: 6px; }}
    .kpi-delta {{ font-size: 13px; font-weight: 600; margin-top: 4px; }}
    .kpi-delta.pos {{ color: var(--success); }}
    .grid-2 {{
      display: grid;
      grid-template-columns: 1fr;
      gap: 24px;
      margin-bottom: 32px;
    }}
    .card {{
      background: var(--card-bg);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 24px;
    }}
    .card-header {{
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 18px;
    }}
    h2 {{ font-size: 18px; font-weight: 700; color: #fff; }}
    table {{
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }}
    th {{
      text-align: left;
      padding: 10px 12px;
      color: var(--text-muted);
      border-bottom: 1px solid var(--border);
      font-weight: 600;
      text-transform: uppercase;
      font-size: 11px;
    }}
    td {{
      padding: 12px;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      vertical-align: middle;
    }}
    .text-muted {{ color: var(--text-muted); }}
    .text-mono {{ font-family: monospace; font-size: 12px; color: #cbd5e1; }}
    .text-accent {{ color: var(--accent); font-weight: 600; }}
    .badge-status {{
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
    }}
    .status-pruned {{
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
    }}
    .status-approved {{
      background: rgba(34, 197, 94, 0.15);
      color: #4ade80;
      border: 1px solid rgba(34, 197, 94, 0.3);
    }}
    .notes-col {{ max-width: 440px; color: #cbd5e1; }}
    .callout {{
      background: rgba(245, 158, 11, 0.1);
      border-left: 4px solid var(--accent);
      padding: 14px 18px;
      border-radius: 0 8px 8px 0;
      margin-bottom: 24px;
      font-size: 13px;
    }}
  </style>
</head>
<body>
  <div class="container">
    <header>
      <div>
        <h1>WoW Classic 1-20 Speedrun Optimizer</h1>
        <div class="subtitle">Mulgore Start &rarr; The Barrens Transition &middot; Class: <strong>Tauren {player_class}</strong> &middot; Target: <strong>Level {target_level}</strong></div>
      </div>
      <div>
        <span class="badge" style="background: rgba(56, 189, 248, 0.2); color: #38bdf8; border: 1px solid #38bdf844; padding: 6px 12px; font-size: 12px;">
          TypeSafe System One (Jev) Enabled
        </span>
      </div>
    </header>

    <div class="callout">
      <strong>Cybernetic Speedrun Design:</strong> Code controls the deterministic graph (coordinates, Euclidean run physics at 7 yd/s, XP formulas, and DAG prereqs). <strong>Jev (TypeSafe System One)</strong> evaluates qualitative player notes to calculate exact trap probabilities (<span class="text-mono">Noul</span>) and combat friction (<span class="text-mono">Score</span>), automatically pruning time sinks.
    </div>

    <!-- KPIs -->
    <div class="kpi-grid">
      <div class="kpi-card">
        <div class="kpi-title">Optimized Time to 20</div>
        <div class="kpi-value" style="color: #4ade80;">{opt_summary['total_time_hours']} hrs</div>
        <div class="kpi-delta pos">&darr; {time_saved_mins:.1f} mins saved vs naive ({speedup_pct:.1f}% faster)</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Optimized XP / Hour</div>
        <div class="kpi-value">{opt_summary['xp_per_hour']:,.0f}</div>
        <div class="kpi-delta pos">&uarr; +{opt_summary['xp_per_hour'] - naive_summary['xp_per_hour']:,.0f} XP/hr advantage</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Quests Pruned by Jev</div>
        <div class="kpi-value" style="color: #f87171;">{len([e for e in evaluations.values() if e['trap_probability'] >= trap_threshold])}</div>
        <div class="kpi-delta text-muted">Eliminated low-drop RNG &amp; escorts</div>
      </div>
      <div class="kpi-card">
        <div class="kpi-title">Total XP Earned</div>
        <div class="kpi-value">{opt_summary['total_xp']:,}</div>
        <div class="kpi-delta text-muted">{opt_summary['completed_quests_count']} quests + mob kills</div>
      </div>
    </div>

    <!-- Jev Semantic Audit Table -->
    <div class="card" style="margin-bottom: 32px;">
      <div class="card-header">
        <h2>Jev Semantic Intelligence Audit (Noul &amp; Score)</h2>
        <span class="text-muted" style="font-size: 12px;">Pruning Threshold: <strong>P(trap) &ge; {trap_threshold}</strong></span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Quest &amp; Hub</th>
            <th>Trap Prob (Noul)</th>
            <th>Friction (Score)</th>
            <th>Decision</th>
            <th>Community Context (Wowhead)</th>
          </tr>
        </thead>
        <tbody>
          {"".join(audit_rows)}
        </tbody>
      </table>
    </div>

    <!-- Step-by-Step Route Timeline -->
    <div class="card">
      <div class="card-header">
        <h2>Optimized Level 1-20 Step-by-Step Itinerary</h2>
        <span class="text-muted" style="font-size: 12px;">Generated via Clustered Lookahead TSP</span>
      </div>
      <table>
        <thead>
          <tr>
            <th>Step</th>
            <th>Action</th>
            <th>Location / Target</th>
            <th>Zone</th>
            <th>Coords</th>
            <th>XP Gain</th>
            <th>Level</th>
            <th>Time</th>
          </tr>
        </thead>
        <tbody>
          {"".join(timeline_rows)}
        </tbody>
      </table>
    </div>
  </div>
</body>
</html>
"""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w", encoding="utf-8") as f:
        f.write(html_content)


def main():
    parser = argparse.ArgumentParser(description="WoW Classic 1-20 Speedrun Route Optimizer using TypeSafe Jev")
    parser.add_argument("--target-level", type=int, default=20, help="Target level to optimize for (default: 20)")
    parser.add_argument("--player-class", type=str, default="Hunter", help="Player class (Hunter, Druid, Warrior, Shaman)")
    parser.add_argument("--trap-threshold", type=float, default=0.55, help="Noul trap probability cutoff to prune quests (default: 0.55)")
    parser.add_argument("--force-refresh", action="store_true", help="Force refresh Jev API evaluations (bypass cache)")
    args = parser.parse_args()

    print("=" * 72)
    print("  WoW Classic 1-20 Speedrun Route Optimizer (Mulgore -> The Barrens)")
    print("  Powered by TypeSafe System One (Jev) + Deterministic Graph Solver")
    print("=" * 72)

    # 1. Load quest database
    if not DATA_FILE.exists():
        print(f"Error: Quest data file not found at {DATA_FILE}")
        sys.exit(1)

    with open(DATA_FILE, "r", encoding="utf-8") as f:
        quests = json.load(f)

    print(f"\n[1/4] Loaded {len(quests)} quests from Mulgore & Barrens database.")

    # 2. Evaluate quests with Jev
    print(f"[2/4] Querying Jev (TypeSafe System One) for semantic evaluations (Class: {args.player_class})...")
    evaluator = JevQuestEvaluator()
    evaluations = evaluator.evaluate_all(quests, player_class=args.player_class, force_refresh=args.force_refresh)

    traps_found = [e for e in evaluations.values() if e["trap_probability"] >= args.trap_threshold]
    print(f"      Jev evaluated {len(evaluations)} quests.")
    print(f"      Identified {len(traps_found)} efficiency traps (P(trap) >= {args.trap_threshold}):")
    for t in traps_found:
        print(f"        - {t['quest_name']}: Trap Prob = {t['trap_probability']:.2f}, Friction = {t['friction_score']:.2f}")

    # 3. Solve Naive vs Optimized
    print("\n[3/4] Executing Graph Solver algorithms...")
    solver = SpeedrunGraphSolver(quests, jev_evaluations=evaluations)

    print("      - Calculating Naive Completionist Route (no Jev pruning)...")
    naive_steps, naive_state, naive_summary = solver.solve_route(
        target_level=args.target_level,
        use_jev=False,
    )

    print("      - Calculating Jev-Optimized Speedrun Route (with Noul pruning + Score friction)...")
    opt_steps, opt_state, opt_summary = solver.solve_route(
        target_level=args.target_level,
        use_jev=True,
        trap_threshold=args.trap_threshold,
    )

    # 4. Print Comparison Metrics
    time_saved_mins = naive_summary["total_time_minutes"] - opt_summary["total_time_minutes"]
    speedup_pct = (time_saved_mins / max(naive_summary["total_time_minutes"], 1)) * 100.0

    print("\n" + "=" * 72)
    print("  SPEEDRUN BENCHMARK RESULTS")
    print("=" * 72)
    print(f"  Target Level:             {args.target_level}")
    print(f"  Player Class:             Tauren {args.player_class}")
    print(f"  Naive Route Duration:     {naive_summary['total_time_hours']:.2f} hours ({naive_summary['total_time_minutes']:.1f} mins)")
    print(f"  Jev-Optimized Duration:   {opt_summary['total_time_hours']:.2f} hours ({opt_summary['total_time_minutes']:.1f} mins)")
    print(f"  Time Saved:               {time_saved_mins:.1f} minutes ({speedup_pct:.1f}% faster)")
    print(f"  Naive XP/Hour:            {naive_summary['xp_per_hour']:,.0f} XP/hr")
    print(f"  Optimized XP/Hour:        {opt_summary['xp_per_hour']:,.0f} XP/hr  (+{opt_summary['xp_per_hour'] - naive_summary['xp_per_hour']:,.0f} XP/hr)")
    print("=" * 72)

    # 5. Generate Rich HTML Report
    generate_html_report(
        target_level=args.target_level,
        player_class=args.player_class,
        trap_threshold=args.trap_threshold,
        evaluations=evaluations,
        naive_steps=naive_steps,
        naive_summary=naive_summary,
        opt_steps=opt_steps,
        opt_summary=opt_summary,
        quests=quests,
        output_path=HTML_REPORT_FILE,
    )
    print(f"\n[4/4] Generated interactive HTML report:")
    print(f"      {HTML_REPORT_FILE.as_uri()}")
    print("\nDone! Route generated successfully.")


if __name__ == "__main__":
    main()
