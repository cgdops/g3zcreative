/**
 * CRM Lead & Outreach Export API
 * GET /api/crm/export - Download filtered CSV of CRM leads or Sunbiz outreach candidates
 */

import { checkAuth, getCorsHeaders, handleCorsOptions } from './auth.js';
import { buildOutreachWhereClause } from './_sunbiz.js';

const ALLOWED_METHODS = 'GET, OPTIONS';
const VALID_LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'spam']);
const VALID_OUTREACH_STATUSES = new Set(['uncontacted', 'emailed', 'promoted', 'dismissed']);

const LEADING_WS_CTRL_BOM_RE = /^[\u0000-\u0020\u007F-\u009F\u00A0\u1680\u180E\u2000-\u200F\u2028-\u202F\u205F\u2060\u3000\uFEFF]+/;
const LEADING_CTRL_OR_BOM_RE = /^[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202F\u2060\uFEFF]/;

/**
 * Hardened RFC 4180 CSV cell escaping with spreadsheet formula-injection neutralization.
 * 1. Strips NUL bytes (\u0000).
 * 2. Normalizes CRLF, CR, LF, and Unicode line separators to single spaces so every CSV
 *    record stays strictly on one physical line and embedded "\n=1+1" cannot start a new row.
 * 3. Strips all leading ASCII/Unicode whitespace, control chars, and BOM when checking for
 *    formula trigger prefixes (=, +, -, @, |), exempting plain numbers/phones ONLY when no
 *    leading control/BOM chars were present.
 */
export function escapeCsv(val) {
  if (val === null || val === undefined) return '""';

  let str = String(val)
    .replace(/\u0000/g, '')
    .replace(/\r\n|\r|\n|\u2028|\u2029/g, ' ');

  const hadLeadingCtrlOrBom = LEADING_CTRL_OR_BOM_RE.test(str);
  const strippedLeading = str.replace(LEADING_WS_CTRL_BOM_RE, '');

  if (/^[=+\-@|]/.test(strippedLeading)) {
    const isSafePlainNumberOrPhone =
      !hadLeadingCtrlOrBom &&
      /^[+-]?\d[\d\s().-]*$/.test(strippedLeading) &&
      !/[=@|]/.test(strippedLeading);

    if (!isSafePlainNumberOrPhone) {
      str = `'${str}`;
    }
  } else if (/^[\s\u00A0\uFEFF]*\t/.test(str)) {
    str = `'${str}`;
  }

  return `"${str.replace(/"/g, '""')}"`;
}

function jsonError(corsHeaders, message, status, extraHeaders = {}) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
      ...corsHeaders
    }
  });
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const corsHeaders = getCorsHeaders(request, ALLOWED_METHODS);

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    if (auth.rateLimited) {
      return jsonError(
        corsHeaders,
        'Too many failed authentication attempts. Please try again later.',
        429,
        { 'Retry-After': String(auth.retryAfter || 60) }
      );
    }
    return jsonError(
      corsHeaders,
      auth.misconfigured ? 'CRM authentication is not configured.' : 'Unauthorized',
      auth.misconfigured ? 503 : 401
    );
  }

  if (!env.DB) {
    return jsonError(corsHeaders, 'Database not configured', 500);
  }

  try {
    const url = new URL(request.url);
    const view = (url.searchParams.get('view') || 'leads').trim().toLowerCase();
    const search = (url.searchParams.get('q') || '').trim();
    const dateStr = new Date().toISOString().split('T')[0];

    if (view === 'outreach') {
      const status = (url.searchParams.get('status') || 'active').trim();
      if (status !== 'active' && status !== 'all' && !VALID_OUTREACH_STATUSES.has(status)) {
        return jsonError(corsHeaders, 'Invalid outreach status filter.', 400);
      }
      const niche = (url.searchParams.get('niche') || 'all').trim();
      const city = (url.searchParams.get('city') || 'all').trim();
      const contactFilter = (url.searchParams.get('contact') || 'all').trim();

      const { whereClause, params } = buildOutreachWhereClause({
        search,
        status,
        niche,
        city,
        contactFilter
      });

      let candidates = [];
      try {
        const res = await env.DB.prepare(`
          SELECT * FROM outreach_candidates
          ${whereClause}
          ORDER BY
            CASE WHEN outreach_status = 'uncontacted' THEN 0 ELSE 1 END ASC,
            CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END ASC,
            score DESC,
            filing_date DESC,
            id ASC
        `).bind(...params).all();
        candidates = res.results || [];
      } catch (err) {
        if (!/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
          throw err;
        }
      }

      const headers = [
        'ID', 'Doc Number', 'Business Name', 'Founder Name', 'Founder Title',
        'Email', 'Phone', 'Website', 'City', 'ZIP', 'County', 'Niche', 'Score',
        'Outreach Status', 'Enrichment Status', 'Filing Date', 'Principal Address', 'Lead ID'
      ];

      let csvContent = headers.map(escapeCsv).join(',') + '\n';
      for (const c of candidates) {
        const row = [
          c.id,
          c.doc_number,
          c.business_name_clean || c.business_name,
          c.founder_name,
          c.founder_title,
          c.email,
          c.phone,
          c.website,
          c.city,
          c.zip,
          c.county,
          c.niche,
          c.score ?? 0,
          c.outreach_status,
          c.enrichment_status,
          c.filing_date,
          c.principal_address,
          c.lead_id
        ];
        csvContent += row.map(escapeCsv).join(',') + '\n';
      }

      const filename = `g3z-creative-outreach-${dateStr}.csv`;
      return new Response(csvContent, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="${filename}"`,
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...corsHeaders
        }
      });
    }

    // Default view: 'leads'
    const status = (url.searchParams.get('status') || 'all').trim();
    if (status !== 'all' && !VALID_LEAD_STATUSES.has(status)) {
      return jsonError(corsHeaders, 'Invalid lead status filter.', 400);
    }

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
    const { results: leads } = await env.DB.prepare(
      `SELECT * FROM leads ${whereClause} ORDER BY created_at DESC, id DESC`
    ).bind(...params).all();

    const headers = [
      'ID', 'Name', 'Email', 'Phone', 'Company', 'Service Interest',
      'Status', 'Estimated Value', 'Source Page', 'UTM Source',
      'UTM Campaign', 'Referrer', 'Country', 'Message', 'Created At'
    ];

    let csvContent = headers.map(escapeCsv).join(',') + '\n';

    for (const lead of (leads || [])) {
      const row = [
        lead.id,
        lead.name,
        lead.email,
        lead.phone,
        lead.company,
        lead.service_interest,
        lead.status,
        lead.estimated_value || 0,
        lead.source_page,
        lead.utm_source,
        lead.utm_campaign,
        lead.referrer,
        lead.ip_country,
        lead.message,
        lead.created_at
      ];
      csvContent += row.map(escapeCsv).join(',') + '\n';
    }

    const filename = `g3z-creative-leads-${dateStr}.csv`;

    return new Response(csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        ...corsHeaders
      }
    });

  } catch (error) {
    console.error('CRM CSV export error:', error);
    return jsonError(corsHeaders, 'Failed to generate CSV export.', 500);
  }
}
