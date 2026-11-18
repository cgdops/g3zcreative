-- Migration 0006: CRM Lead Follow-Up Task Queue

CREATE TABLE IF NOT EXISTS lead_tasks (
    id TEXT PRIMARY KEY,
    lead_id TEXT REFERENCES leads(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    task_type TEXT DEFAULT 'follow_up', -- 'follow_up', 'call', 'email', 'sms', 'general'
    status TEXT DEFAULT 'pending',      -- 'pending', 'completed', 'cancelled'
    priority TEXT DEFAULT 'normal',     -- 'low', 'normal', 'high'
    due_at DATETIME NOT NULL,
    source TEXT DEFAULT 'manual',       -- 'auto_contacted_24h', 'manual'
    completed_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_lead_tasks_status_due ON lead_tasks(status, due_at ASC);
CREATE INDEX IF NOT EXISTS idx_lead_tasks_lead_id ON lead_tasks(lead_id, status);
CREATE UNIQUE INDEX IF NOT EXISTS idx_lead_tasks_unique_pending_auto
  ON lead_tasks(lead_id)
  WHERE status = 'pending' AND source = 'auto_contacted_24h';

-- Backfill existing leads currently in 'contacted' stage (idempotent)
INSERT OR IGNORE INTO lead_tasks (
    id, lead_id, title, description, task_type, status, priority, due_at, source, created_at, updated_at
)
SELECT
    'task_bf_' || l.id,
    l.id,
    SUBSTR('Follow up with ' || COALESCE(NULLIF(TRIM(l.name), ''), 'Lead'), 1, 300),
    'Auto-queued 24h follow-up after lead moved to Contacted.',
    'follow_up',
    'pending',
    'normal',
    COALESCE(DATETIME(COALESCE(l.updated_at, l.created_at), '+24 hours'), DATETIME('now', '+24 hours')),
    'auto_contacted_24h',
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM leads l
WHERE l.status = 'contacted'
  AND NOT EXISTS (
      SELECT 1 FROM lead_tasks t
      WHERE t.lead_id = l.id
        AND t.status = 'pending'
        AND t.source = 'auto_contacted_24h'
  );
