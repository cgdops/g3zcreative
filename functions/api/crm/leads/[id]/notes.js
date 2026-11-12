/**
 * CRM Lead Notes API
 * POST /api/crm/leads/:id/notes - Add note or activity log to lead
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../../auth.js';

const ALLOWED_METHODS = 'POST, OPTIONS';
const VALID_NOTE_TYPES = new Set(['note', 'call', 'sms', 'email', 'meeting', 'status_change', 'enrichment']);

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

function enforceCsrf(request, auth) {
  return verifyCsrf(request, auth);
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

function generateId(prefix = 'note_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  const csrf = enforceCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403);
  }

  const parsedBody = await readJsonObject(request, auth, { allowEmpty: false });
  if (!parsedBody.ok) {
    return json(request, { error: parsedBody.error }, parsedBody.status);
  }

  if (!env.DB) {
    return json(request, { error: 'Database not available' }, 500);
  }

  try {
    const body = parsedBody.body;
    for (const f of ['content', 'note', 'type', 'author']) {
      if (body[f] !== undefined && body[f] !== null && typeof body[f] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${f}".` }, 400);
      }
    }

    const lead = await env.DB.prepare('SELECT id FROM leads WHERE id = ?').bind(leadId).first();
    if (!lead) {
      return json(request, { error: 'Lead not found' }, 404);
    }

    const content = String(body.content || body.note || '').trim();
    const rawType = body.type !== undefined && body.type !== null ? body.type : 'note';
    if (typeof rawType !== 'string' || !VALID_NOTE_TYPES.has(rawType.trim())) {
      return json(request, {
        error: `Invalid note type. Must be one of: ${[...VALID_NOTE_TYPES].join(', ')}.`
      }, 400);
    }
    const type = rawType.trim();
    const author = String(body.author || auth.user || 'Christian').trim();

    if (!content) {
      return json(request, { error: 'Note content cannot be empty' }, 400);
    }

    const noteId = generateId('note_');

    await env.DB.prepare(`
      INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(noteId, leadId, author, type, content).run();

    // Touch lead's updated_at timestamp
    await env.DB.prepare('UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(leadId).run();

    const note = await env.DB.prepare('SELECT * FROM lead_notes WHERE id = ?').bind(noteId).first();

    return json(request, {
      success: true,
      note
    }, 201);

  } catch (error) {
    console.error('Error adding lead note:', error);
    return json(request, { error: 'Failed to add note.' }, 500);
  }
}
