/**
 * CRM Lead Notes API
 * POST /api/crm/leads/:id/notes - Add note or activity log to lead
 */

import { checkAuth } from '../../auth.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
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

export async function onRequestPost(context) {
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
    const body = await request.json().catch(() => ({}));
    const content = (body.content || body.note || '').trim();
    const type = (body.type || 'note').trim(); // 'note', 'call', 'sms', 'email', 'meeting'
    const author = (body.author || auth.user || 'Christian').trim();

    if (!content) {
      return new Response(JSON.stringify({ error: 'Note content cannot be empty' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const noteId = generateId('note_');

    await env.DB.prepare(`
      INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(noteId, leadId, author, type, content).run();

    // Touch lead's updated_at timestamp
    await env.DB.prepare('UPDATE leads SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').bind(leadId).run();

    const note = await env.DB.prepare('SELECT * FROM lead_notes WHERE id = ?').bind(noteId).first();

    return new Response(JSON.stringify({
      success: true,
      note
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
