# G3Z Playbooks — AI Search Engagements

Repeatable procedures behind the five questions on `services/ai-seo.html`. Each was written
by running it on G3Z Creative first.

| Playbook | Answers | Covers |
|---|---|---|
| [01 — Pre-Sale AI Baseline Audit](01-ai-baseline-audit.md) | Q1, Q2 | Prompt set design, the runner, what to give away free, cost |
| [02 — Schema & Entity Graph](02-schema-entity-graph.md) | Q3 | `@graph` construction, the seven rules, validation |
| [03 — Extractable Content](03-extractable-content.md) | Q4 | Retrieval mechanism, the rules, the extraction test |
| [04 — Fallback Value Map](04-fallback-value-map.md) | Q5 | Dual-justification constraint, zero-click honesty |

## Tooling

- `scratch/ai-baseline/run_baseline.py` — reusable runner (any client, any prompt set)
- `scratch/ai-baseline/analyze.py` — citation rate, share of voice, flicker detection
- `scratch/ai-baseline/prompts-g3z.json` — prompt set template
- `playbooks/schema/g3z-homepage-graph.jsonld` — corrected entity graph template

Measured API cost: **$0.0040 per prompt-run** (DataForSEO ChatGPT LLM Scraper, live/advanced).
