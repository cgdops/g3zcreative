# Playbook 01 — The Pre-Sale AI Baseline Audit

**Answers client questions 1 and 2.** Run this before a proposal, for every prospect.

## What it is

A fixed set of buyer prompts, run repeatedly against ChatGPT with web search on, recorded as
a citation rate and a share-of-voice table. It is the only honest way to answer "where do I
stand today," and it is the artifact that makes question 1 unanswerable by a competitor who
is selling rebranded SEO.

## The economics — how much to give away

| | Free (pre-sale) | Paid ($1,500 AI Visibility Audit) |
|---|---|---|
| Prompts | 8–10 | 25–40 |
| Runs per prompt | 3 | 5 |
| API calls | 24–30 | 125–200 |
| **Raw API cost** | **~$0.10–0.12** | **~$0.50–0.80** |
| Platforms | ChatGPT | ChatGPT + Gemini + Perplexity + AI Overviews |
| Deliverable | 1 page: citation rate, SoV top-5, 3 named gaps | Full report, per-page citation map, prompt-level detail, 90-day plan |
| Your time | ~30 min | ~6–10 hrs |

**Measured cost: $0.0040 per call** (ChatGPT LLM Scraper, live/advanced, forced web search).
A free teaser costs about a dime. Your real cost is your time, not the API.

**The rule:** give away *the number and the gap*, never the *fix*. Telling a prospect
"you are cited on 2% of your buying prompts and here are the four competitors eating your
share of voice" creates urgency and proves capability. Telling them *which schema to write
and which pages to restructure* is the engagement. Show the diagnosis; sell the treatment.

**Why give away anything:** you cannot answer question 2 on a sales call without it. An
agency that walks in with the prospect's real citation rate has already passed a test the
competition structurally cannot. A dime is a cheap way to be the only credible vendor in
the room.

## Procedure

### 1. Build the prompt set (30–45 min)

Copy `scratch/ai-baseline/prompts-g3z.json` and edit. Five buckets:

- **discovery** (6–8) — "best {service} in {city}", "{service} agency near {metro}"
- **comparison** (3–4) — "how do I choose a {service} provider", "what should I pay for {service}"
- **problem** (4–5) — the questions their content is *supposed* to answer
- **vertical** (2–3) — "best {service} for {their niche}"
- **branded** (3–4) — brand name, "is {brand} legit", "{founder name}", "{brand} reviews"

Rules:
- Write prompts the way a buyer types them, not the way an SEO writes keywords.
- Branded prompts are diagnostic, not scoreable — report them separately. They tell you
  what the model *believes* about the client, which is where you find hallucinated facts.
- Lock the wording. The set does not change between baseline and re-measure, or the
  comparison is meaningless.

### 2. Run it

```bash
cd scratch/ai-baseline && python run_baseline.py prompts-<client>.json
```

Runner prints spend and writes `baseline-<client>.json` plus raw responses in `raw/`.
66 calls takes ~5 minutes at 8 workers.

### 3. Analyze

```bash
python analyze.py baseline-<client>.json
```

### 4. Report these five things, in this order

1. **Non-branded citation rate** — the headline. Branded-inclusive rates are vanity;
   of course the model finds them when you type their name.
2. **Rate by bucket** — shows *where* they are invisible, which maps directly to work.
3. **Flickering prompts** — prompts cited on some runs but not others. These are the
   near-misses and the fastest wins; they are also your proof that single screenshots are worthless.
4. **Share of voice** — top 10 domains cited across non-branded runs. Name the competitors.
5. **Which of their pages got cited** — usually 1–2 pages carry everything, which tells you
   what the rest of the site is failing to do.

## Methodology guardrails (say these out loud on the call)

- **Non-determinism is the whole reason we run 3–5 times.** Same prompt, different answers.
  A competitor's single screenshot of ChatGPT naming them is a coin flip presented as a result.
- **Logged-out, no memory, no personalization.** ChatGPT with account memory on will flatter
  the client and produce a fake baseline.
- **Location and language pinned** and identical between runs.
- **`force_web_search: true`** — separates retrieval-driven citation (which responds to work
  in weeks) from training-data recall (which takes quarters).
- **`sources` vs `search_results`** — the API distinguishes what the model *retrieved* from
  what it actually *cited*. Score on `sources`. Appearing in `search_results` but not
  `sources` is a distinct, useful diagnosis: you were found and rejected.

## Re-measure cadence

Monthly, same set, same settings. Report the delta in citation rate and share of voice.
Never re-measure with a changed prompt set and call it improvement.
