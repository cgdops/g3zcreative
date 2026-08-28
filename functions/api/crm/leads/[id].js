/**
 * CRM Lead Detail & Update API
 * GET /api/crm/leads/:id - Fetch lead details and interaction timeline
 * PATCH /api/crm/leads/:id - Update lead details, stage/status, value
 * DELETE /api/crm/leads/:id - Delete or archive lead
 */

import { checkAuth } from '../auth.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

function generateId(prefix = 'note_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
    if (!lead) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const { results: notes } = await env.DB.prepare(
      'SELECT * FROM lead_notes WHERE lead_id = ? ORDER BY created_at DESC'
    ).bind(leadId).all();

    return new Response(JSON.stringify({
      lead,
      notes: notes || []
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const existing = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
    if (!existing) {
      return new Response(JSON.stringify({ error: 'Lead not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const body = await request.json().catch(() => ({}));
    const updates = [];
    const values = [];

    const allowedFields = [
      'name', 'contact_info', 'email', 'phone', 'company', 'company_domain',
      'service_interest', 'message', 'status', 'estimated_value', 'starred'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
      }
    }

    if (updates.length === 0) {
      return new Response(JSON.stringify({ message: 'No updates provided', lead: existing }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
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

    return new Response(JSON.stringify({
      success: true,
      lead: updatedLead
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'Database not available' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    await env.DB.prepare('DELETE FROM lead_notes WHERE lead_id = ?').bind(leadId).run();
    await env.DB.prepare('DELETE FROM leads WHERE id = ?').bind(leadId).run();

    return new Response(JSON.stringify({ success: true, message: 'Lead deleted' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
