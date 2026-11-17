-- Migration 0005: Google Maps Bleeder Discovery, Technical & Entity Diagnostics, Tier Classification & Multi-Touch Cadence
-- Evolves outreach_candidates while preserving backward-compatible primary keys, doc_number unique constraint, and leads(id) foreign key.

-- 1. Add Google Maps GBP & Competitor columns
ALTER TABLE outreach_candidates ADD COLUMN place_id TEXT;
ALTER TABLE outreach_candidates ADD COLUMN cid TEXT;
ALTER TABLE outreach_candidates ADD COLUMN gbp_rank INTEGER;
ALTER TABLE outreach_candidates ADD COLUMN review_count INTEGER;
ALTER TABLE outreach_candidates ADD COLUMN rating REAL;
ALTER TABLE outreach_candidates ADD COLUMN gbp_category TEXT;
ALTER TABLE outreach_candidates ADD COLUMN top_competitors TEXT; -- JSON array of top 3 Map Pack leaders [{ name, rank, reviews, rating, website, domain }]

-- 2. Add Live Technical & Entity Diagnostic columns
ALTER TABLE outreach_candidates ADD COLUMN lcp_ms INTEGER;
ALTER TABLE outreach_candidates ADD COLUMN performance_score INTEGER;
ALTER TABLE outreach_candidates ADD COLUMN has_schema INTEGER DEFAULT 0;
ALTER TABLE outreach_candidates ADD COLUMN has_ssl INTEGER DEFAULT 0;
ALTER TABLE outreach_candidates ADD COLUMN website_status TEXT; -- 'missing', 'broken', 'slow', 'unoptimized', 'healthy'
ALTER TABLE outreach_candidates ADD COLUMN recommended_tier TEXT; -- 'platform_3k', 'retainer_2500', 'pilot_500'
ALTER TABLE outreach_candidates ADD COLUMN pain_summary TEXT;

-- 3. Add Multi-Touch Cadence State Machine columns
ALTER TABLE outreach_candidates ADD COLUMN cadence_step INTEGER DEFAULT 0;
ALTER TABLE outreach_candidates ADD COLUMN next_action_at DATETIME;
ALTER TABLE outreach_candidates ADD COLUMN last_channel TEXT;

-- 4. Create Unique & Composite Indexes for Maps Deduplication, Tier Filtering & Follow-Up Queue
-- Note: SQLite UNIQUE index allows multiple NULL values for legacy Sunbiz rows while enforcing uniqueness on non-null place_id values.
CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_place_id ON outreach_candidates(place_id);
CREATE INDEX IF NOT EXISTS idx_outreach_tier_score ON outreach_candidates(outreach_status, recommended_tier, score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_rank_reviews ON outreach_candidates(gbp_rank, review_count DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_next_action ON outreach_candidates(next_action_at ASC);

-- 5. Backfill sensible defaults on existing legacy rows where diagnostic or cadence fields are NULL
UPDATE outreach_candidates
SET website_status = COALESCE(
      website_status,
      CASE
        WHEN website IS NULL OR TRIM(website) = '' THEN 'missing'
        ELSE 'unoptimized'
      END
    ),
    has_ssl = COALESCE(
      has_ssl,
      CASE
        WHEN website IS NOT NULL AND TRIM(website) != '' THEN 1
        ELSE 0
      END
    ),
    has_schema = COALESCE(has_schema, 0),
    recommended_tier = COALESCE(
      recommended_tier,
      CASE
        WHEN COALESCE(review_count, 0) >= 10 AND COALESCE(website_status, CASE WHEN website IS NULL OR TRIM(website) = '' THEN 'missing' ELSE 'unoptimized' END) IN ('missing', 'broken', 'slow') THEN 'platform_3k'
        WHEN COALESCE(review_count, 0) >= 10 THEN 'retainer_2500'
        ELSE 'pilot_500'
      END
    ),
    cadence_step = CASE
      WHEN cadence_step IS NOT NULL AND cadence_step > 0 THEN cadence_step
      WHEN outreach_status IN ('in_cadence', 'emailed', 'promoted') THEN 1
      ELSE COALESCE(cadence_step, 0)
    END,
    last_channel = COALESCE(
      last_channel,
      CASE
        WHEN outreach_status IN ('in_cadence', 'emailed') THEN 'email'
        ELSE NULL
      END
    ),
    pain_summary = COALESCE(
      pain_summary,
      CASE
        WHEN website IS NULL OR TRIM(website) = '' THEN 'New FL entity filing (' || COALESCE(city, 'South Florida') || ') • No active website or LocalBusiness schema detected'
        ELSE 'Active domain (' || website || ') in ' || COALESCE(city, 'South Florida') || ' • Needs LocalBusiness schema & Map Pack conversion audit'
      END
    ),
    updated_at = CURRENT_TIMESTAMP
WHERE recommended_tier IS NULL OR website_status IS NULL OR cadence_step IS NULL OR (outreach_status IN ('in_cadence', 'emailed', 'promoted') AND COALESCE(cadence_step, 0) = 0);
