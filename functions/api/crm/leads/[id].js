/**
 * CRM Lead Detail & Update API
 * GET /api/crm/leads/:id - Fetch lead details and interaction timeline
 * PATCH /api/crm/leads/:id - Update lead details, stage/status, value
 * DELETE /api/crm/leads/:id - Delete or archive lead
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../auth.js';

const ALLOWED_METHODS = 'GET, PATCH, DELETE, OPTIONS';
const VALID_LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'spam']);

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

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  if (!env.DB) {
    return json(request, { error: 'Database not available' }, 500);
  }

  try {
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
    if (!lead) {
      return json(request, { error: 'Lead not found' }, 404);
    }

    const { results: notes } = await env.DB.prepare(
      'SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC'
    ).bind(leadId).all();

    return json(request, {
      lead,
      notes: notes || []
    });

  } catch (error) {
    console.error('Error fetching lead detail:', error);
    return json(request, { error: 'Failed to fetch lead details.' }, 500);
  }
}

export async function onRequestPatch(context) {
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
    const existing = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
    if (!existing) {
      return json(request, { error: 'Lead not found' }, 404);
    }

    const body = { ...parsedBody.body };
    if (body.deal_value !== undefined && body.estimated_value === undefined) {
      body.estimated_value = body.deal_value;
    }

    const allowedFields = [
      'name', 'contact_info', 'email', 'phone', 'company', 'company_domain',
      'service_interest', 'message', 'status', 'estimated_value', 'starred'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== null && typeof body[field] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${field}".` }, 400);
      }
    }

    if (body.status !== undefined) {
      if (typeof body.status !== 'string' || !VALID_LEAD_STATUSES.has(body.status.trim())) {
        return json(request, {
          error: `Invalid lead status. Must be one of: ${[...VALID_LEAD_STATUSES].join(', ')}.`
        }, 400);
      }
      body.status = body.status.trim();
    }

    if (body.name !== undefined) {
      if (typeof body.name !== 'string' || !body.name.trim()) {
        return json(request, { error: 'Lead name cannot be empty.' }, 400);
      }
      body.name = body.name.trim();
    }

    if (body.contact_info !== undefined) {
      if (body.contact_info === null) {
        return json(request, { error: 'contact_info cannot be null.' }, 400);
      }
      body.contact_info = String(body.contact_info).trim();
    }

    if (body.estimated_value !== undefined) {
      const numVal = Number(body.estimated_value);
      if (body.estimated_value === null || !Number.isFinite(numVal) || numVal < 0) {
        return json(request, { error: 'Invalid estimated_value.' }, 400);
      }
      body.estimated_value = numVal;
    }

    if (body.starred !== undefined) {
      if (typeof body.starred === 'boolean') {
        body.starred = body.starred ? 1 : 0;
      } else if (body.starred === 0 || body.starred === 1 || body.starred === '0' || body.starred === '1') {
        body.starred = Number(body.starred);
      } else {
        return json(request, { error: 'Invalid starred value.' }, 400);
      }
    }

    const updates = [];
    const values = [];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(typeof body[field] === 'string' ? body[field].trim() : body[field]);
      }
    }

    if (updates.length === 0) {
      return json(request, { message: 'No updates provided', lead: existing });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(leadId);

    const query = `UPDATE leads SET ${updates.join(', ')} WHERE id = ?`;
    await env.DB.prepare(query).bind(...values).run();

    // If status changed, record an automatic status_change note
    if (body.status && body.status !== existing.status) {
      const noteId = generateId('note_');
      const noteText = `Stage changed from "${existing.status}" to "${body.status}".`;
      await env.DB.prepare(
        'INSERT INTO lead_notes (id, lead_id, author, type, content, created_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)'
      ).bind(noteId, leadId, auth.user || 'Christian', 'status_change', noteText).run();
    }

    const updatedLead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();

    let nextUncontactedLead = null;
    let nextUncontactedLeadNotes = [];
    let remainingUncontactedCount = null;

    if (body.status === 'lost') {
      const uncontactedWhere = `
        l.id != ?
        AND (
          l.status = 'new'
          OR (
            l.status = 'contacted'
            AND NOT EXISTS (
              SELECT 1 FROM lead_notes n
              WHERE n.lead_id = l.id
                AND n.type IN ('call', 'sms', 'email', 'meeting')
            )
          )
        )
      `;

      const countRow = await env.DB.prepare(
        `SELECT COUNT(*) AS cnt FROM leads l WHERE ${uncontactedWhere}`
      ).bind(leadId).first();
      remainingUncontactedCount = Number(countRow?.cnt || 0);

      if (remainingUncontactedCount > 0) {
        const anchorCreatedAt = existing.created_at ? String(existing.created_at) : null;
        if (anchorCreatedAt) {
          nextUncontactedLead = await env.DB.prepare(`
            SELECT l.*
            FROM leads l
            WHERE ${uncontactedWhere}
            ORDER BY
              CASE WHEN (l.phone IS NOT NULL AND TRIM(l.phone) != '') THEN 0 ELSE 1 END ASC,
              CASE WHEN (l.created_at < ? OR (l.created_at = ? AND l.id < ?)) THEN 0 ELSE 1 END ASC,
              l.created_at DESC,
              l.id DESC
            LIMIT 1
          `).bind(leadId, anchorCreatedAt, anchorCreatedAt, leadId).first();
        } else {
          nextUncontactedLead = await env.DB.prepare(`
            SELECT l.*
            FROM leads l
            WHERE ${uncontactedWhere}
            ORDER BY
              CASE WHEN (l.phone IS NOT NULL AND TRIM(l.phone) != '') THEN 0 ELSE 1 END ASC,
              l.created_at DESC,
              l.id DESC
            LIMIT 1
          `).bind(leadId).first();
        }

        if (nextUncontactedLead) {
          const { results: nextNotes } = await env.DB.prepare(
            'SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC'
          ).bind(nextUncontactedLead.id).all();
          nextUncontactedLeadNotes = nextNotes || [];
        }
      }
    }

    return json(request, {
      success: true,
      lead: updatedLead,
      ...(body.status === 'lost'
        ? {
            next_uncontacted_lead: nextUncontactedLead || null,
            next_uncontacted_lead_notes: nextUncontactedLeadNotes,
            remaining_uncontacted_count: remainingUncontactedCount
          }
        : {})
    });

  } catch (error) {
    console.error('Error updating lead:', error);
    return json(request, { error: 'Failed to update lead.' }, 500);
  }
}

export async function onRequestDelete(context) {
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

  if (!env.DB) {
    return json(request, { error: 'Database not available' }, 500);
  }

  try {
    // Clean up optional/child foreign-key references safely before deleting lead row
    try {
      await env.DB.prepare('UPDATE outreach_candidates SET lead_id = NULL WHERE lead_id = ?').bind(leadId).run();
    } catch (err) {
      if (!/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
        throw err;
      }
    }

    try {
      await env.DB.prepare('DELETE FROM lead_enrichments WHERE lead_id = ?').bind(leadId).run();
    } catch (err) {
      if (!/no such table:\s*lead_enrichments/i.test(String(err?.message || err))) {
        throw err;
      }
    }

    await env.DB.prepare('DELETE FROM lead_notes WHERE lead_id = ?').bind(leadId).run();
    await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(leadId).run();

    return json(request, { success: true, message: 'Lead deleted' });
  } catch (error) {
    console.error('Error deleting lead:', error);
    return json(request, { error: 'Failed to delete lead.' }, 500);
  }
}
