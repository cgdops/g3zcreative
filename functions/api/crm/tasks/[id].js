/**
 * CRM Single Task API
 * PATCH  /api/crm/tasks/:id - Complete, reopen, cancel, or snooze/reschedule a task
 * DELETE /api/crm/tasks/:id - Delete a task
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../auth.js';
import {
  AUTO_CONTACTED_SOURCE,
  VALID_TASK_TYPES,
  VALID_TASK_STATUSES,
  VALID_TASK_PRIORITIES,
  getTaskBadgeCounts,
  isMissingTasksTableError,
  normalizeSqlDatetime,
  parseSqlUtcMs
} from '../_tasks.js';

const ALLOWED_METHODS = 'PATCH, DELETE, OPTIONS';

function json(request, body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
      ...getCorsHeaders(request, ALLOWED_METHODS)
    }
  });
}

function authErrorResponse(request, auth) {
  if (auth.rateLimited) {
    return json(
      request,
      { error: 'Too many failed authentication attempts. Please try again later.' },
      429,
      { 'Retry-After': String(auth.retryAfter || 60) }
    );
  }
  return json(
    request,
    { error: auth.misconfigured ? 'CRM authentication is not configured.' : 'Unauthorized' },
    auth.misconfigured ? 503 : 401
  );
}

async function readJsonObject(request, auth, { allowEmpty = false } = {}) {
  const ctHeader = (request.headers.get('content-type') || '').trim().toLowerCase();
  const mediaType = ctHeader ? ctHeader.split(';')[0].trim() : '';
  const clHeader = (request.headers.get('content-length') || '').trim();

  if (auth?.method === 'cookie') {
    if (ctHeader && mediaType !== 'application/json') {
      return { ok: false, status: 415, error: 'Unsupported Media Type: Content-Type must be application/json.' };
    }
    if (!ctHeader && (!allowEmpty || (clHeader && clHeader !== '0'))) {
      return { ok: false, status: 415, error: 'Unsupported Media Type: Content-Type must be application/json.' };
    }
  } else if (ctHeader && (mediaType === 'application/x-www-form-urlencoded' || mediaType === 'multipart/form-data')) {
    return { ok: false, status: 415, error: 'Unsupported Media Type: Content-Type must be application/json.' };
  }

  const rawText = await request.text();
  if (!rawText.trim()) {
    if (auth?.method === 'cookie' && !ctHeader && !allowEmpty) {
      return { ok: false, status: 415, error: 'Unsupported Media Type: Content-Type must be application/json.' };
    }
    if (!allowEmpty) {
      return { ok: false, status: 400, error: 'Request body cannot be empty.' };
    }
    return { ok: true, body: {} };
  }

  if (auth?.method === 'cookie' && !ctHeader) {
    return { ok: false, status: 415, error: 'Unsupported Media Type: Content-Type must be application/json.' };
  }

  try {
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { ok: false, status: 400, error: 'Request body must be a JSON object.' };
    }
    return { ok: true, body: parsed };
  } catch {
    return { ok: false, status: 400, error: 'Invalid JSON request body.' };
  }
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const taskId = String(params?.id || '').trim();

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  const csrf = verifyCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403);
  }

  const parsedBody = await readJsonObject(request, auth);
  if (!parsedBody.ok) {
    return json(request, { error: parsedBody.error }, parsedBody.status);
  }

  if (!taskId) {
    return json(request, { error: 'Task ID is required.' }, 400);
  }

  if (!env.DB) {
    return json(request, { error: 'D1 database binding "DB" is missing.' }, 500);
  }

  try {
    const existing = await env.DB.prepare('SELECT * FROM lead_tasks WHERE id = ?').bind(taskId).first();
    if (!existing) {
      return json(request, { error: 'Task not found.' }, 404);
    }

    const body = parsedBody.body;

    const scalarFields = ['title', 'description', 'task_type', 'priority', 'status', 'snooze_hours', 'due_at'];
    for (const f of scalarFields) {
      if (body[f] !== undefined && body[f] !== null && typeof body[f] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${f}".` }, 400);
      }
    }

    const updates = [];
    const values = [];

    if (body.title !== undefined) {
      if (typeof body.title !== 'string') {
        return json(request, { error: 'Task title must be a string.' }, 400);
      }
      const title = body.title.trim();
      if (!title) return json(request, { error: 'Task title cannot be empty.' }, 400);
      if (title.length > 300) {
        return json(request, { error: 'Task title cannot exceed 300 characters.' }, 400);
      }
      updates.push('title = ?');
      values.push(title);
    }

    if (body.description !== undefined) {
      if (body.description !== null && typeof body.description !== 'string') {
        return json(request, { error: 'Task description must be a string.' }, 400);
      }
      const description = body.description === null ? null : body.description.trim();
      if (description !== null && description.length > 4000) {
        return json(request, { error: 'Task description cannot exceed 4000 characters.' }, 400);
      }
      updates.push('description = ?');
      values.push(description);
    }

    if (body.task_type !== undefined) {
      if (typeof body.task_type !== 'string') {
        return json(request, { error: `Invalid task_type. Must be one of: ${[...VALID_TASK_TYPES].join(', ')}.` }, 400);
      }
      const taskType = body.task_type.trim();
      if (!VALID_TASK_TYPES.has(taskType)) {
        return json(request, { error: `Invalid task_type. Must be one of: ${[...VALID_TASK_TYPES].join(', ')}.` }, 400);
      }
      updates.push('task_type = ?');
      values.push(taskType);
    }

    if (body.priority !== undefined) {
      if (typeof body.priority !== 'string') {
        return json(request, { error: `Invalid priority. Must be one of: ${[...VALID_TASK_PRIORITIES].join(', ')}.` }, 400);
      }
      const priority = body.priority.trim();
      if (!VALID_TASK_PRIORITIES.has(priority)) {
        return json(request, { error: `Invalid priority. Must be one of: ${[...VALID_TASK_PRIORITIES].join(', ')}.` }, 400);
      }
      updates.push('priority = ?');
      values.push(priority);
    }

    let requestedStatus;
    if (body.status !== undefined) {
      if (typeof body.status !== 'string') {
        return json(request, { error: `Invalid status. Must be one of: ${[...VALID_TASK_STATUSES].join(', ')}.` }, 400);
      }
      requestedStatus = body.status.trim();
      if (!VALID_TASK_STATUSES.has(requestedStatus)) {
        return json(request, { error: `Invalid status. Must be one of: ${[...VALID_TASK_STATUSES].join(', ')}.` }, 400);
      }
      updates.push('status = ?');
      values.push(requestedStatus);
      if (requestedStatus === 'completed' || requestedStatus === 'cancelled') {
        updates.push('completed_at = CURRENT_TIMESTAMP');
      } else {
        updates.push('completed_at = NULL');
      }
    }

    const hasSnoozeHours = body.snooze_hours !== undefined && body.snooze_hours !== null;
    if (hasSnoozeHours) {
      if (requestedStatus === 'completed' || requestedStatus === 'cancelled') {
        return json(request, { error: 'Cannot snooze a task while marking it completed or cancelled.' }, 400);
      }
      if (body.due_at !== undefined) {
        return json(request, { error: 'Provide either snooze_hours or due_at, not both.' }, 400);
      }
      if (typeof body.snooze_hours === 'boolean' || String(body.snooze_hours).trim() === '') {
        return json(request, { error: 'snooze_hours must be greater than 0 and at most 8760.' }, 400);
      }
      const hours = Number(body.snooze_hours);
      if (!Number.isFinite(hours) || hours <= 0 || hours > 8760) {
        return json(request, { error: 'snooze_hours must be greater than 0 and at most 8760.' }, 400);
      }
      const existingDueMs = parseSqlUtcMs(existing.due_at);
      const baseMs = Number.isFinite(existingDueMs) ? Math.max(Date.now(), existingDueMs) : Date.now();
      const nextDueDate = new Date(baseMs + hours * 3600 * 1000);
      if (!Number.isFinite(nextDueDate.getTime()) || nextDueDate.getUTCFullYear() < 1000 || nextDueDate.getUTCFullYear() > 9999) {
        return json(request, { error: 'Invalid due_at datetime.' }, 400);
      }
      const nextDue = nextDueDate.toISOString().slice(0, 19).replace('T', ' ');
      updates.push('due_at = ?');
      values.push(nextDue);
      if (body.status === undefined && existing.status !== 'pending') {
        updates.push("status = 'pending'");
        updates.push('completed_at = NULL');
      }
    } else if (body.due_at !== undefined) {
      if (body.due_at === null || typeof body.due_at !== 'string' || body.due_at.trim() === '') {
        return json(request, { error: 'Invalid due_at datetime.' }, 400);
      }
      const dueNorm = normalizeSqlDatetime(body.due_at);
      if (!dueNorm.ok) {
        return json(request, { error: dueNorm.error }, 400);
      }
      updates.push('due_at = ?');
      values.push(dueNorm.bindValue);
    }

    if (updates.length === 0) {
      return json(request, { message: 'No updates provided', task: existing });
    }

    const nextStatus = requestedStatus !== undefined
      ? requestedStatus
      : ((hasSnoozeHours && existing.status !== 'pending') ? 'pending' : existing.status);

    if (
      nextStatus === 'pending' &&
      existing.status !== 'pending' &&
      existing.source === AUTO_CONTACTED_SOURCE &&
      existing.lead_id
    ) {
      const activeDuplicate = await env.DB.prepare(`
        SELECT id FROM lead_tasks
        WHERE lead_id = ?
          AND status = 'pending'
          AND source = ?
          AND id != ?
        LIMIT 1
      `).bind(existing.lead_id, AUTO_CONTACTED_SOURCE, taskId).first();
      if (activeDuplicate) {
        return json(request, {
          error: 'This lead already has an active pending 24h auto follow-up task.'
        }, 409);
      }
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(taskId);

    await env.DB.prepare(`UPDATE lead_tasks SET ${updates.join(', ')} WHERE id = ?`).bind(...values).run();

    const updated = await env.DB.prepare(`
      SELECT
        t.*,
        l.name AS lead_name,
        l.company AS lead_company,
        l.email AS lead_email,
        l.phone AS lead_phone,
        l.contact_info AS lead_contact_info,
        l.status AS lead_status,
        l.estimated_value AS lead_estimated_value,
        CASE
          WHEN t.status = 'pending' AND DATETIME(t.due_at) <= DATETIME('now') THEN 1
          ELSE 0
        END AS is_due
      FROM lead_tasks t
      LEFT JOIN leads l ON t.lead_id = l.id
      WHERE t.id = ?
    `).bind(taskId).first();

    const counts = await getTaskBadgeCounts(env.DB);

    return json(request, {
      success: true,
      task: updated,
      counts
    });
  } catch (error) {
    if (isMissingTasksTableError(error)) {
      return json(request, {
        error: 'Task queue migration (0006_lead_tasks.sql) has not been applied yet.',
        migrationRequired: true
      }, 503);
    }
    if (/unique constraint failed|SQLITE_CONSTRAINT_UNIQUE/i.test(String(error?.message || error || ''))) {
      return json(request, {
        error: 'This lead already has an active pending 24h auto follow-up task.'
      }, 409);
    }
    console.error('Error updating task:', error);
    return json(request, { error: 'Failed to update task.' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const taskId = String(params?.id || '').trim();

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  const csrf = verifyCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403);
  }

  if (!taskId) {
    return json(request, { error: 'Task ID is required.' }, 400);
  }

  if (!env.DB) {
    return json(request, { error: 'D1 database binding "DB" is missing.' }, 500);
  }

  try {
    const existing = await env.DB.prepare('SELECT id FROM lead_tasks WHERE id = ?').bind(taskId).first();
    if (!existing) {
      return json(request, { error: 'Task not found.' }, 404);
    }

    await env.DB.prepare('DELETE FROM lead_tasks WHERE id = ?').bind(taskId).run();
    const counts = await getTaskBadgeCounts(env.DB);

    return json(request, {
      success: true,
      deleted_id: taskId,
      counts
    });
  } catch (error) {
    if (isMissingTasksTableError(error)) {
      return json(request, {
        error: 'Task queue migration (0006_lead_tasks.sql) has not been applied yet.',
        migrationRequired: true
      }, 503);
    }
    console.error('Error deleting task:', error);
    return json(request, { error: 'Failed to delete task.' }, 500);
  }
}
