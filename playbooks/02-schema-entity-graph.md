# Playbook 02 — Schema & the Entity Graph

**Answers client question 3.** The deliverable a prospect can verify in 30 seconds, which is
exactly why you lead with it.

## The principle

Schema does not make you rank. It makes you **machine-legible**. An AI system has to be
confident about *who you are* before it will recommend you, and that confidence comes from
consistent, cross-referenced, corroborated facts.

The difference between plugin schema and hand-written schema is not the tag list — it is
whether the nodes are **linked into one graph**. Most agencies emit five disconnected blocks
that each re-describe the business. You emit one `@graph` where a single `Organization` node
has a stable `@id` and everything else *references* that `@id`. That is the tell, and it is
visible on screen in ten seconds.

## The stack, by page type

| Page | Nodes |
|---|---|
| Homepage | `WebSite` → `Organization`/`LocalBusiness` (+ `hasOfferCatalog`) → `Person` per principal |
| Service page | `Service` with `provider: {@id: org}` + `BreadcrumbList` + `FAQPage` if genuine Q&A |
| Location page | `Service` with `areaServed` + `BreadcrumbList` |
| Blog post | `BlogPosting` with `author: {@id: person}`, `publisher: {@id: org}` + `BreadcrumbList` |

## The seven rules

1. **One `@graph` per page.** Not five sibling `<script>` blocks.
2. **Stable `@id`s, one host, forever.** Pick www or non-www to match your canonical and never
   mix. An `@id` is an identity; changing it creates a second entity.
3. **Reference, never repeat.** `{"@id": "https://site.com/#organization"}` instead of
   re-declaring name/address/phone in every node.
4. **`sameAs` is the entity-resolution glue.** Google Business Profile first, then LinkedIn,
   Facebook, Instagram, Yelp, industry directories. This is the most-skipped, highest-value field
   for a local business — it is how the model confirms the website, the map listing, and the
   reviews are one company.
5. **`Person` nodes with real credentials**, referenced from `author`. This is the only
   machine-readable E-E-A-T signal you control.
6. **Self-host every asset URL** in schema. No CDN URLs from a platform you left.
7. **Never mark up what is not on the page**, and never self-apply `AggregateRating`.

## Validate

- **Schema.org validator** — is the markup *valid*?
- **Google Rich Results Test** — can Google render it as a *rich result*?

Different questions. Run both. Knowing the difference is itself a credibility signal on a call.

## Procedure for a new client

1. Inventory what exists: `grep -rho '"@type": *"[A-Za-z]*"' --include=*.html . | sort | uniq -c | sort -rn`
2. Check `@id` host consistency against the canonical host. Mismatch is the most common defect.
3. Check `sameAs` for the GBP URL. Usually missing.
4. Write the homepage `@graph` first — every other page references it.
5. Validate, deploy, request re-crawl.

Template: `playbooks/schema/g3z-homepage-graph.jsonld`

## What the G3Z audit found (2026-09-02)

Real defects, found by running the procedure above on our own site:

| Defect | Evidence | Impact |
|---|---|---|
| **`@id` host mismatch** | Canonicals are `https://g3zcreative.com/...`; `Organization` `@id` is `https://www.g3zcreative.com/#organization` across ~424 `LocalBusiness` blocks | Two entity identities for one business — the exact ambiguity schema exists to remove. Rule 2 violation. |
| **No Google Business Profile in `sameAs`** | `sameAs` = Instagram + LinkedIn only. Zero GBP/maps links anywhere in 251 pages. | Rule 4 violation, and the highest-value single fix. The AI SEO page tells prospects "our reviews live on our Google Business Profile" and then never links it. |
| **Logo on a foreign CDN** | `logo` → `cdn.prod.website-files.com/...` (Webflow), while `images/Webclip-8.png` exists locally | Rule 6 violation; breaks if the old Webflow project lapses. |
| **Founders are bare `Person` objects** | Homepage `founder` array has name-only Persons, no `@id`, not linked to the `#christian-gomez` node used elsewhere | Rule 3 violation — the founder on the homepage and the author on the blog are different entities to a machine. |
| **`Person.sameAs` points at the company LinkedIn** | `templates/author-bio.html` | Weak. A personal profile corroborates a person; a company page does not. |
| **Missing canonicals** | `pricing.html`, `roi-calculator.html`, `toronto.html` | Public pages with no canonical. |
| **Site-wide soft 404** | Any nonexistent URL returns **HTTP 200** serving the homepage — verified on `/blog/zzz-does-not-exist-xyz/` | Unbounded duplicate content. ChatGPT already cited `/blog/local-seo-tips-miramar-small-businesses/`, a page that does not exist, and got a 200. Fix before anything else. |

Corrected homepage graph: `playbooks/schema/g3z-homepage-graph.jsonld` (three `TODO_` placeholders
need real URLs — GBP, Facebook, and personal LinkedIn profiles — do not ship with placeholders).
