/**
 * Shared CRM Lead Task Queue Helpers
 * Single source of truth for auto-queuing 24h follow-up tasks when a lead
 * enters 'contacted', cancelling them when leaving 'contacted', and
 * computing task badge/KPI counts.
 */

export const AUTO_CONTACTED_SOURCE = 'auto_contacted_24h';
export const VALID_TASK_TYPES = new Set(['follow_up', 'call', 'email', 'sms', 'general']);
export const VALID_TASK_STATUSES = new Set(['pending', 'completed', 'cancelled']);
export const VALID_TASK_PRIORITIES = new Set(['low', 'normal', 'high']);

export function generateTaskId(prefix = 'task_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

const SQL_OR_ISO_DATETIME_RE = /^(\d{4})-(\d{2})-(\d{2})(?:[Tt ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?(?:([Zz])|([+-])(\d{2}):?(\d{2}))?)?$/;

export function isMissingTasksTableError(err) {
  return /no such (table|column)/i.test(String(err?.message || err || ''));
}

/**
 * Parse SQLite 'YYYY-MM-DD HH:MM:SS' or ISO datetime strings cleanly as UTC epoch ms (or NaN).
 */
export function parseSqlUtcMs(val) {
  if (typeof val !== 'string') return NaN;
  const trimmed = val.trim();
  if (!trimmed) return NaN;

  const match = trimmed.match(SQL_OR_ISO_DATETIME_RE);
  if (match) {
    const year = Number(match[1]);
    const month = Number(match[2]);
    const day = Number(match[3]);
    const hour = match[4] !== undefined ? Number(match[4]) : 0;
    const minute = match[5] !== undefined ? Number(match[5]) : 0;
    const second = match[6] !== undefined ? Number(match[6]) : 0;
    const ms = match[7] !== undefined ? Number(match[7].slice(0, 3).padEnd(3, '0')) : 0;

    if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59 || second > 59) {
      return NaN;
    }

    const utcProbe = new Date(Date.UTC(year, month - 1, day, hour, minute, second, ms));
    if (
      utcProbe.getUTCFullYear() !== year ||
      utcProbe.getUTCMonth() !== month - 1 ||
      utcProbe.getUTCDate() !== day
    ) {
      return NaN;
    }

    let epochMs = utcProbe.getTime();
    if (match[9]) {
      const offSign = match[9] === '+' ? 1 : -1;
      const offHours = Number(match[10]);
      const offMins = Number(match[11]);
      if (offHours > 23 || offMins > 59) return NaN;
      epochMs -= offSign * (offHours * 60 + offMins) * 60 * 1000;
    }
    return epochMs;
  }

  if (/^\d+$/.test(trimmed) || /^\d{4}-\d{1,2}-\d{1,2}/.test(trimmed)) {
    return NaN;
  }
  if (!/(?:^|\D)\d{4}(?:\D|$)/.test(trimmed)) {
    return NaN;
  }
  if (!/(?:GMT|UTC|[+-]\d{2}:?\d{2}|Z)$/i.test(trimmed)) {
    return NaN;
  }

  const parsed = Date.parse(trimmed);
  return Number.isFinite(parsed) ? parsed : NaN;
}

/**
 * Validate and normalize due_at or due_in_hours into a UTC SQLite datetime string ('YYYY-MM-DD HH:MM:SS').
 */
export function normalizeSqlDatetime(rawDueAt, dueInHours) {
  if (
    typeof dueInHours === 'boolean' ||
    (dueInHours !== undefined && dueInHours !== null && typeof dueInHours === 'object')
  ) {
    return { ok: false, error: 'due_in_hours must be between 0 and 8760.' };
  }

  if (rawDueAt !== undefined && rawDueAt !== null) {
    if (typeof rawDueAt !== 'string' || rawDueAt.trim() === '') {
      return { ok: false, error: 'Invalid due_at datetime.' };
    }
    const ms = parseSqlUtcMs(rawDueAt);
    if (!Number.isFinite(ms)) {
      return { ok: false, error: 'Invalid due_at datetime.' };
    }
    const targetDate = new Date(ms);
    const y = targetDate.getUTCFullYear();
    if (y < 1000 || y > 9999) {
      return { ok: false, error: 'Invalid due_at datetime.' };
    }
    const iso = targetDate.toISOString().slice(0, 19).replace('T', ' ');
    return { ok: true, sqlExpr: '?', bindValue: iso };
  }

  if (dueInHours !== undefined && dueInHours !== null && String(dueInHours).trim() === '') {
    return { ok: false, error: 'due_in_hours must be between 0 and 8760.' };
  }

  const hours = dueInHours !== undefined && dueInHours !== null ? Number(dueInHours) : 24;
  if (!Number.isFinite(hours) || hours < 0 || hours > 8760) {
    return { ok: false, error: 'due_in_hours must be between 0 and 8760.' };
  }

  const targetDate = new Date(Date.now() + hours * 3600 * 1000);
  const y = targetDate.getUTCFullYear();
  if (!Number.isFinite(targetDate.getTime()) || y < 1000 || y > 9999) {
    return { ok: false, error: 'Invalid due_at datetime.' };
  }
  const iso = targetDate.toISOString().slice(0, 19).replace('T', ' ');
  return { ok: true, sqlExpr: '?', bindValue: iso };
}

/**
 * Queue a 24-hour follow-up task when a lead transitions into 'contacted'.
 * Idempotent: relies on idx_lead_tasks_unique_pending_auto + INSERT OR IGNORE
 * so concurrent transitions never duplicate or throw unique constraint errors.
 */
export async function queueContactedFollowUpTask(db, lead) {
  if (!db || !lead?.id) return null;

  try {
    const taskId = generateTaskId('task_');
    const leadName = String(lead.name || 'Lead').trim() || 'Lead';
    const title = `Follow up with ${leadName}`.slice(0, 300);
    const description = 'Auto-queued 24h follow-up after lead moved to Contacted.';

    await db.prepare(`
      INSERT OR IGNORE INTO lead_tasks (
        id, lead_id, title, description, task_type, status, priority,
        due_at, source, created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, 'follow_up', 'pending', 'normal',
        DATETIME('now', '+24 hours'), ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).bind(taskId, lead.id, title, description, AUTO_CONTACTED_SOURCE).run();

    return await db.prepare(`
      SELECT * FROM lead_tasks
      WHERE lead_id = ?
        AND status = 'pending'
        AND source = ?
      LIMIT 1
    `).bind(lead.id, AUTO_CONTACTED_SOURCE).first();
  } catch (err) {
    if (isMissingTasksTableError(err)) return null;
    throw err;
  }
}

/**
 * Cancel any pending auto-queued 24h follow-up tasks when a lead leaves 'contacted'
 * (e.g. moves to qualified, proposal, won, lost, spam, or back to new).
 */
export async function cancelPendingAutoFollowUpTasks(db, leadId) {
  if (!db || !leadId) return 0;

  try {
    const result = await db.prepare(`
      UPDATE lead_tasks
      SET status = 'cancelled',
          completed_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
      WHERE lead_id = ?
        AND status = 'pending'
        AND source = ?
    `).bind(leadId, AUTO_CONTACTED_SOURCE).run();

    return Number(result?.meta?.changes || 0);
  } catch (err) {
    if (isMissingTasksTableError(err)) return 0;
    throw err;
  }
}

/**
 * Fetch summary counts for the Tasks tab badge and KPI strip.
 */
export async function getTaskBadgeCounts(db) {
  const empty = {
    dueNow: 0,
    upcoming: 0,
    pendingTotal: 0,
    completedToday: 0,
    completedTotal: 0,
    total: 0
  };
  if (!db) return empty;

  try {
    const row = await db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' AND DATETIME(due_at) <= DATETIME('now') THEN 1 ELSE 0 END) AS due_now,
        SUM(CASE WHEN status = 'pending' AND DATETIME(due_at) > DATETIME('now') THEN 1 ELSE 0 END) AS upcoming,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending_total,
        SUM(CASE WHEN status = 'completed' AND DATE(completed_at) = DATE('now') THEN 1 ELSE 0 END) AS completed_today,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed_total
      FROM lead_tasks
    `).first();

    return {
      dueNow: Number(row?.due_now || 0),
      upcoming: Number(row?.upcoming || 0),
      pendingTotal: Number(row?.pending_total || 0),
      completedToday: Number(row?.completed_today || 0),
      completedTotal: Number(row?.completed_total || 0),
      total: Number(row?.total || 0)
    };
  } catch (err) {
    if (isMissingTasksTableError(err)) return empty;
    throw err;
  }
}

/**
 * Fetch all tasks for a specific lead (pending first, then by due_at).
 */
export async function getTasksForLead(db, leadId) {
  if (!db || !leadId) return [];

  try {
    const { results } = await db.prepare(`
      SELECT
        *,
        CASE
          WHEN status = 'pending' AND DATETIME(due_at) <= DATETIME('now') THEN 1
          ELSE 0
        END AS is_due
      FROM lead_tasks
      WHERE lead_id = ?
      ORDER BY
        CASE status
          WHEN 'pending' THEN 0
          WHEN 'completed' THEN 1
          ELSE 2
        END ASC,
        DATETIME(due_at) ASC,
        created_at DESC
    `).bind(leadId).all();

    return results || [];
  } catch (err) {
    if (isMissingTasksTableError(err)) return [];
    throw err;
  }
}
