-- Migration 0001: Initialize G3Z Creative CRM Tables

CREATE TABLE IF NOT EXISTS leads (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    contact_info TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    company TEXT,
    service_interest TEXT,
    message TEXT,
    source_page TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    referrer TEXT,
    user_agent TEXT,
    ip_country TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'spam'
    estimated_value REAL DEFAULT 0,
    starred INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS lead_notes (
    id TEXT PRIMARY KEY,
    lead_id TEXT NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    author TEXT DEFAULT 'Christian',
    type TEXT DEFAULT 'note', -- 'note', 'call', 'sms', 'email', 'status_change'
    content TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_created_at ON leads(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lead_notes_lead_id ON lead_notes(lead_id);
