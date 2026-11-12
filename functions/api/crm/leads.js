/**
 * CRM Leads Management API
 * GET /api/crm/leads - Fetch leads list with filters, search, and pipeline metrics
 * POST /api/crm/leads - Create lead manually from CRM
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from './auth.js';
import { normalizeDomain } from './_enrich.js';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
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

function generateId(prefix = 'lead_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

/**
 * Cleanly separate email and phone from explicit fields or a combined contact_info string
 * without setting phone to an email or non-phone text.
 */
function extractLeadContacts(contactInfo, rawEmail, rawPhone) {
  const emailRegex = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/;
  const explicitEmail = String(rawEmail || '').trim();
  const explicitPhone = String(rawPhone || '').trim();
  const info = String(contactInfo || '').trim();

  let email = '';
  if (explicitEmail && emailRegex.test(explicitEmail)) {
    email = explicitEmail.match(emailRegex)[0].toLowerCase();
  } else if (info) {
    const emailMatch = info.match(emailRegex);
    if (emailMatch) email = emailMatch[0].toLowerCase();
  }

  // Strip matched email before extracting phone digits so email domains/local-parts with digits don't pollute phone
  const remainder = info.replace(emailRegex, ' ').trim();

  const extractValidPhone = (candidateStr) => {
    if (!candidateStr || emailRegex.test(candidateStr)) return '';
    const phoneMatch = candidateStr.match(/(?:\+?\d{1,3}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}|\+?\d[\d\s().-]{5,}\d/);
    if (!phoneMatch) return '';
    const matched = phoneMatch[0].trim();
    const digits = matched.replace(/\D/g, '');
    return digits.length >= 7 && digits.length <= 15 ? matched : '';
  };

  const phone = extractValidPhone(explicitPhone) || extractValidPhone(remainder);

  return {
    email: email || null,
    phone: phone || null
  };
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
      leads: [],
      filteredTotal: 0,
      counts: {
        total: 0,
        activeTotal: 0,
        new: 0,
        newToday: 0,
        contacted: 0,
        qualified: 0,
        proposal: 0,
        won: 0,
        lost: 0,
        spam: 0,
        pipelineValue: 0,
        wonValue: 0
      },
      error: 'D1 database binding "DB" is not configured.'
    });
  }

  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || 'all').trim();
    const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '100', 10) || 100, 1), 500);
    const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);

    if (status && status !== 'all' && !VALID_LEAD_STATUSES.has(status)) {
      return json(request, { error: `Invalid lead status filter "${status}".` }, 400);
    }

    // Build query conditions
    const conditions = [];
    const params = [];

    if (status && status !== 'all') {
      conditions.push('status = ?');
      params.push(status);
    }

    if (search) {
      conditions.push('(name LIKE ? OR contact_info LIKE ? OR email LIKE ? OR phone LIKE ? OR company LIKE ? OR message LIKE ? OR source_page LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

    const filteredCountRow = await env.DB.prepare(
      `SELECT COUNT(*) as filtered_total FROM leads ${whereClause}`
    ).bind(...params).first();
    const filteredTotal = Number(filteredCountRow?.filtered_total || 0);

    const query = `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`;
    const queryParams = [...params, limit, offset];

    const { results: leads } = await env.DB.prepare(query).bind(...queryParams).all();

    // Fetch pipeline summary counts
    const countQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status != 'spam' THEN 1 ELSE 0 END) as active_total,
        SUM(CASE WHEN status = 'new' THEN 1 ELSE 0 END) as new_count,
        SUM(CASE WHEN DATE(created_at) = DATE('now') AND status != 'spam' THEN 1 ELSE 0 END) as new_today_count,
        SUM(CASE WHEN status = 'contacted' THEN 1 ELSE 0 END) as contacted_count,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified_count,
        SUM(CASE WHEN status = 'proposal' THEN 1 ELSE 0 END) as proposal_count,
        SUM(CASE WHEN status = 'won' THEN 1 ELSE 0 END) as won_count,
        SUM(CASE WHEN status = 'lost' THEN 1 ELSE 0 END) as lost_count,
        SUM(CASE WHEN status = 'spam' THEN 1 ELSE 0 END) as spam_count,
        COALESCE(SUM(CASE WHEN status IN ('contacted', 'qualified', 'proposal') THEN estimated_value ELSE 0 END), 0) as pipeline_value,
        COALESCE(SUM(CASE WHEN status = 'won' THEN estimated_value ELSE 0 END), 0) as won_value
      FROM leads
    `;
    const countResult = await env.DB.prepare(countQuery).first();

    return json(request, {
      leads: leads || [],
      filteredTotal,
      counts: {
        total: Number(countResult?.total || 0),
        activeTotal: Number(countResult?.active_total || 0),
        new: Number(countResult?.new_count || 0),
        newToday: Number(countResult?.new_today_count || 0),
        contacted: Number(countResult?.contacted_count || 0),
        qualified: Number(countResult?.qualified_count || 0),
        proposal: Number(countResult?.proposal_count || 0),
        won: Number(countResult?.won_count || 0),
        lost: Number(countResult?.lost_count || 0),
        spam: Number(countResult?.spam_count || 0),
        pipelineValue: Number(countResult?.pipeline_value || 0),
        wonValue: Number(countResult?.won_value || 0)
      }
    });

  } catch (error) {
    console.error('Error fetching leads:', error);
    return json(request, { error: 'Failed to fetch leads.' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

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
    return json(request, { error: 'D1 database binding "DB" is missing.' }, 500);
  }

  try {
    const body = parsedBody.body;

    // Reject non-primitive objects/arrays on scalar fields
    const scalarFields = [
      'name', 'contact_info', 'email', 'phone', 'company', 'company_domain',
      'service_interest', 'message', 'status', 'estimated_value', 'deal_value', 'source_page'
    ];
    for (const f of scalarFields) {
      if (body[f] !== undefined && body[f] !== null && typeof body[f] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${f}".` }, 400);
      }
    }

    const name = String(body.name || '').trim();
    const rawContactInfo = String(body.contact_info || body.email || body.phone || '').trim();
    const companyDomain = normalizeDomain(body.company_domain);

    if (!name) {
      return json(request, { error: 'Name is required' }, 400);
    }

    // An outbound lead has no contact details yet — that's the whole point of
    // enriching it. A company domain is enough to create the record.
    if (!rawContactInfo && !companyDomain) {
      return json(request, { error: 'Provide contact info, or a company domain to enrich from' }, 400);
    }

    const rawStatus = body.status !== undefined && body.status !== null ? body.status : 'new';
    if (typeof rawStatus !== 'string' || !VALID_LEAD_STATUSES.has(rawStatus.trim())) {
      return json(request, {
        error: `Invalid lead status. Must be one of: ${[...VALID_LEAD_STATUSES].join(', ')}.`
      }, 400);
    }
    const status = rawStatus.trim();

    const { email, phone } = extractLeadContacts(rawContactInfo, body.email, body.phone);
    const contactInfo = rawContactInfo || email || phone || companyDomain;
    const company = String(body.company || '').trim();
    const serviceInterest = String(body.service_interest || 'Direct Referral / Outreach').trim();
    const message = String(body.message || '').trim();
    const estimatedValue = Math.max(0, parseFloat(body.estimated_value ?? body.deal_value) || 0);
    const sourcePage = String(body.source_page || 'Manual Entry / CRM').trim();

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
      VALUES (?, ?, ?, 'note', 'Created lead manually in CRM.', CURRENT_TIMESTAMP)
    `).bind(noteId, leadId, auth.user || 'Christian').run();

    const createdLead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();

    return json(request, {
      success: true,
      lead_id: leadId,
      estimated_value: estimatedValue,
      lead: createdLead,
      message: 'Lead created successfully'
    }, 201);

  } catch (error) {
    console.error('Error creating manual lead:', error);
    return json(request, { error: 'Failed to create lead.' }, 500);
  }
}
