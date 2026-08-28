-- Migration 0002: Lead Enrichment (Hunter.io)

ALTER TABLE leads ADD COLUMN company_domain TEXT;
ALTER TABLE leads ADD COLUMN enrichment_status TEXT; -- null, 'pending', 'found', 'not_found', 'failed'
ALTER TABLE leads ADD COLUMN enrichment_confidence INTEGER;
ALTER TABLE leads ADD COLUMN enrichment_source TEXT;
ALTER TABLE leads ADD COLUMN enriched_at DATETIME;

-- Raw provider responses, one row per attempt. Keeps the audit trail and lets
-- the UI re-read a result without paying for the lookup twice.
CREATE TABLE IF NOT EXISTS lead_enrichments (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    provider TEXT NOT NULL DEFAULT 'hunter',
    status TEXT NOT NULL, -- 'found', 'not_found', 'failed'
    email TEXT,
    confidence INTEGER,
    verification TEXT, -- provider's verification state, e.g. 'valid', 'accept_all'
    job_title TEXT,
    linkedin_url TEXT,
    company_domain TEXT,
    raw_response TEXT, -- full JSON payload as returned
    error TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_enrichments_lead_id ON lead_enrichments(lead_id);
CREATE INDEX IF NOT EXISTS idx_leads_enrichment_status ON leads(enrichment_status);
