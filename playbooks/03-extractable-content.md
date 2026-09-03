# Playbook 03 — Writing Content to Be Extracted

**Answers client question 4.**

## Why (the mechanism — lead with this on a call)

A model does not read your page and decide you are good. A retriever chops indexed pages into
**passages of a few hundred words**, embeds them, and matches them against the queries the model
generated from the user's prompt. The model then synthesizes an answer from the passages that
scored best and cites those.

Three consequences:

1. **The page is not the unit. The passage is.** A brilliant page whose answer is buried in
   paragraph nine loses to a mediocre page that answers in paragraph one.
2. **A passage must survive being lifted.** Stripped of the page around it, it still has to make
   sense and still has to name you.
3. **Query-shaped headings win**, because the retriever is matching text against a query.

"Written to a word count" is not a style complaint. Word-count writing front-loads context and
back-loads the answer, which puts the answer outside the retrieved chunk.

## The rules

1. **Answer in the first 40–60 words** under the heading. Answer, then elaborate. Never the reverse.
2. **Headings phrased as the question a buyer types.** "How much does AI SEO cost?" not "Pricing".
3. **Self-contained passages.** No "as mentioned above", no pronoun pointing three sections back.
4. **Repeat the entity.** Use the brand name, not "we", at least once per section, so a lifted
   chunk still attributes.
5. **Liftable facts.** Numbers, dates, tables, definitions, numbered steps. Models prefer concrete
   checkable statements to adjectives.
6. **Original information.** Data you gathered, a process you run, a first-hand observation. A
   synthesis of the same ten posts everyone synthesized gives the model no reason to pick you.
7. **One question per heading.** Two questions under one heading splits the match and wins neither.

## The extraction test

For any section, cut it out and read it alone. Ask:
- Does it answer a question a buyer would actually type?
- Is the answer in the first two sentences?
- Does it name the company without the surrounding page?
- Does it contain at least one specific, checkable fact?

Four yeses or rewrite it.

## What the G3Z audit found (2026-09-02)

Honest result: **the page is well built and the content is not the bottleneck.**

`services/ai-seo.html` passes the extraction test almost everywhere. Openers are answer-first
("An AI SEO agency optimizes a business to be found, understood, and cited by AI search
systems such as..."), headings are question-shaped, pricing is stated in numbers rather than
"contact us", and the five-questions section is structured as liftable Q&A. The FAQ answers
lead with the number: "AI SEO typically costs $2,500 to $8,000 per month..."

**But it earned zero citations.** Baseline results across 54 non-branded runs:

| Bucket | Citation rate |
|---|---|
| branded | 91.7% |
| discovery | 4.8% |
| comparison | **0%** |
| problem | **0%** |
| vertical | **0%** |

The comparison and problem buckets are precisely what `ai-seo.html` was written to answer —
"how do I choose an AI SEO agency", "how do I know if my agency is actually doing AI SEO",
"why is my business not showing up in ChatGPT". Zero for nine prompts, 27 runs.

**The diagnosis is not the writing.** Content quality gets you cited *once you are retrieved*.
G3Z is not being retrieved, because the page is new and has close to no corroborating signal
pointing at it. Meanwhile the pages that *did* win those prompts were mostly aggregators and
directories — `expertise.com`, `agencies.semrush.com`, `topseos.com` — plus one direct
competitor, `sealglobalholdings.com` (9.3% SoV), who is running the same play with a post
titled "Best SEO Agency in South Florida (2026): The Honest Guide."

**The lesson to carry into every engagement:** extraction quality is necessary and not
sufficient. Sequence the work as retrieval first, extraction second:

1. Fix technical retrievability (for G3Z: the soft 404, canonicals, entity graph).
2. Earn corroboration — GBP, directory and aggregator listings the models actually cite,
   third-party mentions.
3. *Then* extraction quality decides whether you get picked out of the retrieved set.

Selling step 3 without steps 1 and 2 is how agencies produce beautiful pages that nothing cites.
