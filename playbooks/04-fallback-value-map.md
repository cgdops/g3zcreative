# Playbook 04 — The Fallback Value Map

**Answers client question 5: "What happens if the AI channel does not pay off for me?"**

## The principle

Every deliverable must earn its fee through a conventional channel even if AI search
underdelivers. If a line item only pays off in the AI scenario, it does not go on the invoice.
That constraint is the answer to question 5, and it is also a genuinely better way to build a
program.

## The map — hand this to the client

| Deliverable | If AI search pays off | If it does not |
|---|---|---|
| Entity graph / hand-written schema | Model resolves you as one confident entity, recommends you | Rich results, knowledge panel eligibility, GBP corroboration |
| Soft-404 / canonical / crawl fixes | AI crawlers can fetch and trust your URLs | Index bloat removed, crawl budget recovered, duplicate content resolved |
| Site speed & clean HTML | Retrievable, parseable passages | Core Web Vitals, conversion rate |
| Answer-first content restructure | Citable passages | Featured snippets, longer dwell, higher on-page conversion |
| GBP + NAP + review velocity | Grounding for every location prompt | **Map pack — usually the biggest revenue lever regardless** |
| Directory / aggregator placements | Presence in the sources models actually cite | Referral traffic and citation-signal for local rankings |
| Digital PR & third-party mentions | Training-data and retrieval presence | Links, authority, brand search |
| Bing indexation / IndexNow | Prerequisite for ChatGPT and Copilot | Bing organic traffic |

## The two things to volunteer before you are asked

**1. Zero-click is the norm.** AI citations send less traffic per impression than a blue link.
Tell the client to expect flat-to-declining organic *sessions* alongside rising branded search
and better-informed inbound. If you let them discover that from their analytics in month three,
you look like you were hiding it.

**2. Nobody can guarantee AI placement.** Non-deterministic outputs, no ranking API, no index
access. What is guaranteeable: retrievability, entity legibility, and being the best-structured
answer available. Scope the guarantee to those.

## G3Z's own fallback map (2026-09-02)

Applying the constraint to our own audit findings — every item is justified twice:

| Finding | AI payoff | Conventional payoff |
|---|---|---|
| **Soft 404 → all bad URLs return 200 + homepage** | Stops models citing URLs that do not exist (already happening: ChatGPT cited `/blog/local-seo-tips-miramar-small-businesses/`) | Kills unbounded duplicate content and index bloat. Would be priority one on a pure-SEO engagement. |
| **GBP missing from `sameAs` and from the entire site** | Links the website entity to the map entity and the reviews | Direct map pack signal. Highest-ROI item on the list in either scenario. |
| **`@id` www/non-www mismatch (~424 blocks)** | One entity instead of two | Cleaner structured data, rich result eligibility |
| **Missing canonicals on `pricing`, `roi-calculator`, `toronto`** | Retrievable canonical URL per page | Standard duplicate-content hygiene |
| **Founders not linked as `Person` `@id`s** | Author identity resolves to founder identity | E-E-A-T signal for the Dec 2025 quality update |
| **Aggregator/directory absence** (`expertise.com`, `topseos.com`, Semrush agency directory all outrank us in SoV) | Presence in the sources models cite for "best agency" prompts | Referral leads and local citation signal |

Not one of these is an AI-only bet. That is the point, and it is the answer to question 5
delivered as evidence rather than as reassurance.
