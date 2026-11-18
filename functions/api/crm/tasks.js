/**
 * CRM Lead Follow-Up Tasks API
 * GET  /api/crm/tasks - Fetch follow-up tasks with status/due filters, search, and counts
 * POST /api/crm/tasks - Create a manual task (optionally linked to a lead)
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from './auth.js';
import {
  VALID_TASK_TYPES,
  VALID_TASK_PRIORITIES,
  generateTaskId,
  getTaskBadgeCounts,
  isMissingTasksTableError,
  normalizeSqlDatetime
} from './_tasks.js';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const VALID_TASK_FILTERS = new Set(['due_now', 'upcoming', 'all_pending', 'completed', 'cancelled', 'all']);

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

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  if (!env.DB) {
    return json(request, {
      tasks: [],
      filteredTotal: 0,
      counts: { dueNow: 0, upcoming: 0, pendingTotal: 0, completedToday: 0, completedTotal: 0, total: 0 },
      error: 'D1 database binding "DB" is not configured.'
    });
  }

  try {
    const url = new URL(request.url);
    const filter = (url.searchParams.get('filter') || 'all_pending').trim();
    const search = (url.searchParams.get('q') || '').trim();
    const leadId = (url.searchParams.get('lead_id') || '').trim();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    if (!VALID_TASK_FILTERS.has(filter)) {
      return json(request, { error: `Invalid task filter "${filter}".` }, 400);
    }

    const conditions = [];
    const params = [];

    if (filter === 'due_now') {
      conditions.push("t.status = 'pending' AND DATETIME(t.due_at) <= DATETIME('now')");
    } else if (filter === 'upcoming') {
      conditions.push("t.status = 'pending' AND DATETIME(t.due_at) > DATETIME('now')");
    } else if (filter === 'all_pending') {
      conditions.push("t.status = 'pending'");
    } else if (filter === 'completed') {
      conditions.push("t.status = 'completed'");
    } else if (filter === 'cancelled') {
      conditions.push("t.status = 'cancelled'");
    }

    if (leadId) {
      conditions.push('t.lead_id = ?');
      params.push(leadId);
    }

    if (search) {
      conditions.push("(t.title LIKE ? ESCAPE '\\' OR t.description LIKE ? ESCAPE '\\' OR l.name LIKE ? ESCAPE '\\' OR l.company LIKE ? ESCAPE '\\' OR l.email LIKE ? ESCAPE '\\' OR l.phone LIKE ? ESCAPE '\\')");
      const escapedSearch = search.replace(/[\\%_]/g, '\\$&');
      const term = `%${escapedSearch}%`;
      params.push(term, term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await env.DB.prepare(`
      SELECT COUNT(*) AS filtered_total
      FROM lead_tasks t
      LEFT JOIN leads l ON t.lead_id = l.id
      ${whereClause}
    `).bind(...params).first();
    const filteredTotal = Number(countRow?.filtered_total || 0);

    const orderClause = filter === 'completed' || filter === 'cancelled'
      ? 'ORDER BY COALESCE(t.completed_at, t.updated_at) DESC, t.id DESC'
      : "ORDER BY CASE t.status WHEN 'pending' THEN 0 WHEN 'completed' THEN 1 ELSE 2 END ASC, DATETIME(t.due_at) ASC, t.created_at DESC";

    const { results: tasks } = await env.DB.prepare(`
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
      ${whereClause}
      ${orderClause}
      LIMIT ? OFFSET ?
    `).bind(...params, limit, offset).all();

    const counts = await getTaskBadgeCounts(env.DB);

    return json(request, {
      tasks: tasks || [],
      filteredTotal,
      counts
    });
  } catch (error) {
    if (isMissingTasksTableError(error)) {
      return json(request, {
        tasks: [],
        filteredTotal: 0,
        counts: { dueNow: 0, upcoming: 0, pendingTotal: 0, completedToday: 0, completedTotal: 0, total: 0 },
        migrationRequired: true
      });
    }
    console.error('Error fetching tasks:', error);
    return json(request, { error: 'Failed to fetch tasks.' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

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

  if (!env.DB) {
    return json(request, { error: 'D1 database binding "DB" is missing.' }, 500);
  }

  try {
    const body = parsedBody.body;

    const scalarFields = ['title', 'description', 'task_type', 'priority', 'lead_id', 'due_at', 'due_in_hours'];
    for (const f of scalarFields) {
      if (body[f] !== undefined && body[f] !== null && typeof body[f] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${f}".` }, 400);
      }
    }

    if (typeof body.title !== 'string') {
      return json(request, { error: 'Task title must be a string.' }, 400);
    }
    const title = body.title.trim();
    if (!title) {
      return json(request, { error: 'Task title is required.' }, 400);
    }
    if (title.length > 300) {
      return json(request, { error: 'Task title cannot exceed 300 characters.' }, 400);
    }

    if (body.description !== undefined && body.description !== null && typeof body.description !== 'string') {
      return json(request, { error: 'Task description must be a string.' }, 400);
    }
    const description = body.description !== undefined && body.description !== null
      ? body.description.trim()
      : null;
    if (description !== null && description.length > 4000) {
      return json(request, { error: 'Task description cannot exceed 4000 characters.' }, 400);
    }

    if (body.task_type !== undefined && body.task_type !== null && typeof body.task_type !== 'string') {
      return json(request, { error: `Invalid task_type. Must be one of: ${[...VALID_TASK_TYPES].join(', ')}.` }, 400);
    }
    const taskType = body.task_type !== undefined && body.task_type !== null && body.task_type.trim() !== ''
      ? body.task_type.trim()
      : 'follow_up';
    if (!VALID_TASK_TYPES.has(taskType)) {
      return json(request, { error: `Invalid task_type. Must be one of: ${[...VALID_TASK_TYPES].join(', ')}.` }, 400);
    }

    if (body.priority !== undefined && body.priority !== null && typeof body.priority !== 'string') {
      return json(request, { error: `Invalid priority. Must be one of: ${[...VALID_TASK_PRIORITIES].join(', ')}.` }, 400);
    }
    const priority = body.priority !== undefined && body.priority !== null && body.priority.trim() !== ''
      ? body.priority.trim()
      : 'normal';
    if (!VALID_TASK_PRIORITIES.has(priority)) {
      return json(request, { error: `Invalid priority. Must be one of: ${[...VALID_TASK_PRIORITIES].join(', ')}.` }, 400);
    }

    if (body.lead_id !== undefined && body.lead_id !== null && typeof body.lead_id !== 'string') {
      return json(request, { error: 'lead_id must be a string.' }, 400);
    }
    let leadId = body.lead_id !== undefined && body.lead_id !== null && body.lead_id.trim() !== ''
      ? body.lead_id.trim()
      : null;
    if (leadId) {
      const lead = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(leadId).first();
      if (!lead) {
        return json(request, { error: 'Linked lead not found.' }, 404);
      }
    } else {
      leadId = null;
    }

    const dueNorm = normalizeSqlDatetime(body.due_at, body.due_in_hours);
    if (!dueNorm.ok) {
      return json(request, { error: dueNorm.error }, 400);
    }

    const taskId = generateTaskId('task_');
    await env.DB.prepare(`
      INSERT INTO lead_tasks (
        id, lead_id, title, description, task_type, status, priority,
        due_at, source, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, 'pending', ?, ${dueNorm.sqlExpr}, 'manual', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(taskId, leadId, title, description, taskType, priority, dueNorm.bindValue).run();

    const created = await env.DB.prepare(`
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
      task: created,
      counts
    }, 201);
  } catch (error) {
    if (isMissingTasksTableError(error)) {
      return json(request, {
        error: 'Task queue migration (0006_lead_tasks.sql) has not been applied yet.',
        migrationRequired: true
      }, 503);
    }
    console.error('Error creating task:', error);
    return json(request, { error: 'Failed to create task.' }, 500);
  }
}
