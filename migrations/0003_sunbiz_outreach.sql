-- Migration 0003: Sunbiz Outreach Candidates & Outbound Email Tracking

CREATE TABLE IF NOT EXISTS outreach_candidates (
    id TEXT PRIMARY KEY,
    doc_number TEXT UNIQUE,
    business_name TEXT NOT NULL,
    business_name_clean TEXT NOT NULL,
    entity_type TEXT DEFAULT 'FL LLC',
    filing_date TEXT,
    founder_name TEXT NOT NULL,
    founder_first_name TEXT,
    founder_last_name TEXT,
    founder_title TEXT,
    secondary_officers TEXT, -- JSON array of additional officers/managers
    registered_agent TEXT,
    principal_address TEXT,
    mailing_address TEXT,
    city TEXT,
    state TEXT DEFAULT 'FL',
    zip TEXT,
    county TEXT,
    niche TEXT DEFAULT 'Local Business',
    score INTEGER DEFAULT 50,
    email TEXT,
    phone TEXT,
    website TEXT,
    enrichment_status TEXT DEFAULT 'unattempted', -- 'unattempted', 'pending', 'found', 'partial', 'not_found', 'failed'
    enrichment_source TEXT, -- 'apollo', 'pdl', 'hunter', 'dataforseo', 'manual'
    enrichment_confidence INTEGER,
    enrichment_meta TEXT, -- JSON payload (linkedin_url, job_title, verification, etc.)
    enriched_at DATETIME,
    outreach_status TEXT DEFAULT 'uncontacted', -- 'uncontacted', 'emailed', 'promoted', 'dismissed'
    emailed_at DATETIME,
    last_subject TEXT,
    lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
    notes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_outreach_status ON outreach_candidates(outreach_status);
CREATE INDEX IF NOT EXISTS idx_outreach_score ON outreach_candidates(score DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_filing_date ON outreach_candidates(filing_date DESC);
CREATE INDEX IF NOT EXISTS idx_outreach_city ON outreach_candidates(city);
CREATE INDEX IF NOT EXISTS idx_outreach_niche ON outreach_candidates(niche);
