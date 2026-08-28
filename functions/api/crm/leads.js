/**
 * CRM Leads Management API
 * GET /api/crm/leads - Fetch leads list with filters, search, and pipeline metrics
 * POST /api/crm/leads - Create lead manually from CRM
 */

import { checkAuth } from './auth.js';
import { normalizeDomain } from './_enrich.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

function generateId(prefix = 'lead_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({
      leads: [],
      counts: { total: 0, new: 0, contacted: 0, qualified: 0, proposal: 0, won: 0, lost: 0 },
      error: 'D1 database binding "DB" is not configured.'
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || 'all').trim();
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100', 10), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    // Build query conditions
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(name LIKE ? OR contact_info LIKE ? OR company LIKE ? OR message LIKE ? OR source_page LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, limit, offset];

    const { results: leads } = await env.DB.prepare(query).bind(...queryParams).all();

    // Fetch pipeline summary counts
    const countQuery = `
      SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted_count,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
        SUM(CASE WHEN status = 'proposal' THEN 1 ELSE 0 END) as proposal_count,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_count,
        SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) as spam_count,
        SUM(estimated_value) as pipeline_value
      FROM leads
    `;
    const countResult = await env.DB.prepare(countQuery).first();

    return new Response(JSON.stringify({
      leads: leads || [],
      counts: {
        total: countResult?.total || 0,
        new: countResult?.new_count || 0,
        contacted: countResult?.contacted_count || 0,
        qualified: countResult?.qualified_count || 0,
        proposal: countResult?.proposal_count || 0,
        won: countResult?.won_count || 0,
        lost: countResult?.lost_count || 0,
        spam: countResult?.spam_count || 0,
        pipelineValue: countResult?.pipeline_value || 0
      }
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    console.error('Error fetching leads:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  if (!env.DB) {
    return new Response(JSON.stringify({ error: 'D1 database binding "DB" is missing.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }

  try {
    const body = await request.json().catch(() => ({}));
    const name = (body.name || '').trim();
    const contactInfo = (body.contact_info || body.phone || body.email || '').trim();
    const companyDomain = normalizeDomain(body.company_domain);

    if (!name) {
      return new Response(JSON.stringify({ error: 'Name is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // An outbound lead has no contact details yet — that's the whole point of
    // enriching it. A company domain is enough to create the record.
    if (!contactInfo && !companyDomain) {
      return new Response(JSON.stringify({ error: 'Provide contact info, or a company domain to enrich from' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const email = (body.email || (contactInfo.includes('@') ? contactInfo : '')).trim();
    const phone = (body.phone || (!contactInfo.includes('@') ? contactInfo : '')).trim();
    const company = (body.company || '').trim();
    const serviceInterest = (body.service_interest || 'Direct Referral / Outreach').trim();
    const message = (body.message || '').trim();
    const status = (body.status || 'new').trim();
    const estimatedValue = parseFloat(body.estimated_value) || 0;
    const sourcePage = (body.source_page || 'Manual Entry / CRM').trim();

    const leadId = generateId('lead_');

    await env.DB.prepare(`
      INSERT INTO leads (
        id, name, contact_info, email, phone, company, company_domain,
        service_interest, message, source_page, status,
        estimated_value, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      leadId, name, contactInfo, email, phone, company, companyDomain || null,
      serviceInterest, message, sourcePage, status,
      estimatedValue
    ).run();

    // Add note for creation
    const noteId = generateId('note_');
    await env.DB.prepare(`
      INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
      VALUES (?, ?, 'Christian', 'note', 'Created lead manually in CRM.', CURRENT_TIMESTAMP)
    `).bind(noteId, leadId).run();

    return new Response(JSON.stringify({
      success: true,
      lead_id: leadId,
      message: 'Lead created successfully'
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    console.error('Error creating manual lead:', error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
