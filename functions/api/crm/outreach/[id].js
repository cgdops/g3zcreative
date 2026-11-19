/**
 * CRM Outreach Candidate Detail, Technical Audit, Enrichment, Multi-Touch Cadence & Pipeline Promotion API
 * GET    /api/crm/outreach/:id - Fetch candidate + rendered diagnostic templates
 * PATCH  /api/crm/outreach/:id - Update candidate contact, diagnostic, and cadence fields
 * DELETE /api/crm/outreach/:id - Delete candidate
 * POST   /api/crm/outreach/:id - Execute action: 'enrich' | 'audit' | 'send_email' | 'log_touch' | 'advance_cadence' | 'promote' | 'dismiss'
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../auth.js';
import { isValidCompanyDomain, normalizeDomain } from '../_enrich.js';
import { queueContactedFollowUpTask, cancelPendingAutoFollowUpTasks, getTaskBadgeCounts } from '../_tasks.js';
import {
  enrichOutreachCandidate,
  auditCandidateWebsite,
  scoreAndClassifyCandidate,
  renderOutreachTemplate,
  computeNextCadenceState,
  verifyEmailDomainDns,
  normalizeSouthFlCity,
  matchSouthFloridaLocation,
  OUTREACH_TEMPLATES
} from '../_outreach_engine.js';
import { upgradeExistingOutreachTable } from './index.js';

const ALLOWED_METHODS = 'GET, POST, PATCH, DELETE, OPTIONS';
const VALID_OUTREACH_STATUSES = new Set(['uncontacted', 'in_cadence', 'emailed', 'promoted', 'dismissed']);
const VALID_LEAD_STATUSES = new Set(['new', 'contacted', 'qualified', 'proposal', 'won', 'lost', 'spam']);
const VALID_WEBSITE_STATUSES = new Set(['missing', 'broken', 'slow', 'unoptimized', 'healthy']);
const VALID_TIERS = new Set(['platform_3k', 'retainer_2500', 'pilot_500']);
const VALID_CHANNELS = new Set(['email', 'call', 'sms']);

const TIER_ESTIMATED_VALUES = {
  platform_3k: 3000,
  retainer_2500: 2500,
  pilot_500: 500
};

const TIER_LABELS = {
  platform_3k: 'Web Platform Rebuild ($3k)',
  retainer_2500: 'Local Maps & SEO Authority ($2.5k/mo)',
  pilot_500: '30-Day Quick-Win Pilot ($500)'
};

function json(request, body, status = 200, methods = ALLOWED_METHODS, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...extraHeaders,
      ...getCorsHeaders(request, methods)
    }
  });
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

function normalizeIsoDateTime(val) {
  if (val === null || val === undefined) return null;
  const trimmed = String(val).trim();
  if (!trimmed) return null;
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return parsed.toISOString().replace('T', ' ').slice(0, 19);
  }
  return trimmed;
}

function parseOptionalEstimatedValue(body) {
  if (!body || typeof body !== 'object') return { ok: true, value: null };
  for (const key of ['estimated_value', 'deal_value']) {
    if (body[key] !== undefined && body[key] !== null && typeof body[key] === 'object') {
      return { ok: false, error: `Invalid non-primitive value for field "${key}".` };
    }
  }
  const rawVal = body.estimated_value !== undefined ? body.estimated_value : body.deal_value;
  if (rawVal === undefined || rawVal === null || rawVal === '') {
    return { ok: true, value: null };
  }
  const numVal = Number(rawVal);
  if (typeof rawVal === 'boolean' || !Number.isFinite(numVal) || numVal < 0) {
    return { ok: false, error: 'Invalid estimated_value / deal_value (must be a finite number >= 0).' };
  }
  return { ok: true, value: Math.round(numVal * 100) / 100 };
}

function resolveCadenceNextActionAt(currentStep, targetStep, channel, rawExplicitNextActionAt) {
  const hasExplicitNext =
    rawExplicitNextActionAt !== undefined &&
    rawExplicitNextActionAt !== null &&
    String(rawExplicitNextActionAt).trim() !== '';
  const explicitNext = hasExplicitNext ? normalizeIsoDateTime(rawExplicitNextActionAt) : undefined;
  const state = computeNextCadenceState(currentStep || 0, targetStep, channel, new Date(), explicitNext);
  return state.next_action_at ? normalizeIsoDateTime(state.next_action_at) : null;
}

export async function findNextUncontactedPhoneCandidate(db, excludeCandidateId) {
  const hasExclude =
    excludeCandidateId !== undefined &&
    excludeCandidateId !== null &&
    String(excludeCandidateId).trim() !== '';

  const nextSql = hasExclude
    ? `
      SELECT * FROM outreach_candidates
      WHERE outreach_status = 'uncontacted' AND id != ?
      ORDER BY
        CASE WHEN (phone IS NOT NULL AND TRIM(phone) != '') THEN 0 ELSE 1 END ASC,
        score DESC,
        COALESCE(review_count, 0) DESC,
        filing_date DESC,
        id ASC
      LIMIT 1
    `
    : `
      SELECT * FROM outreach_candidates
      WHERE outreach_status = 'uncontacted'
      ORDER BY
        CASE WHEN (phone IS NOT NULL AND TRIM(phone) != '') THEN 0 ELSE 1 END ASC,
        score DESC,
        COALESCE(review_count, 0) DESC,
        filing_date DESC,
        id ASC
      LIMIT 1
    `;

  const countSql = hasExclude
    ? "SELECT COUNT(*) AS remaining_count FROM outreach_candidates WHERE outreach_status = 'uncontacted' AND id != ?"
    : "SELECT COUNT(*) AS remaining_count FROM outreach_candidates WHERE outreach_status = 'uncontacted'";

  const nextCandidate = hasExclude
    ? await db.prepare(nextSql).bind(excludeCandidateId).first()
    : await db.prepare(nextSql).first();
  const countRow = hasExclude
    ? await db.prepare(countSql).bind(excludeCandidateId).first()
    : await db.prepare(countSql).first();

  return {
    next_uncontacted_candidate: nextCandidate || null,
    remaining_uncontacted_count: Number(countRow?.remaining_count || 0)
  };
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[m]);
}

/**
 * Convert plain-text founder email (with optional **bold** markdown) into
 * clean, personal 1-to-1 HTML that lands in Gmail's Primary tab.
 */
function formatPersonalEmailHtml(plainText) {
  const escaped = escapeHtml(plainText);
  const withBold = escaped.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  const withLinks = withBold.replace(
    /(https?:\/\/[^\s<]+)/g,
    '<a href="$1" style="color:#da104d;text-decoration:underline;">$1</a>'
  );
  const paragraphs = withLinks
    .split(/\n\s*\n/)
    .map(p => `<p style="margin:0 0 14px 0;line-height:1.6;">${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:15px;color:#1e293b;max-width:620px;">${paragraphs}</div>`;
}

function renderAllTemplates(candidate) {
  const renderedTemplates = {};
  for (const key of Object.keys(OUTREACH_TEMPLATES)) {
    renderedTemplates[key] = {
      ...OUTREACH_TEMPLATES[key],
      ...renderOutreachTemplate(key, candidate)
    };
  }
  return renderedTemplates;
}

/**
 * Deterministically recompute recommended_tier, pain_summary, website_status, and score from first principles
 * via scoreAndClassifyCandidate without ratcheting existing scores upward.
 */
function deriveDiagnosticsFromAudit(candidate, audit = {}) {
  const website = candidate.website || null;
  const lcpMs = audit.lcp_ms !== undefined ? audit.lcp_ms : (audit.lcpMs !== undefined ? audit.lcpMs : null);
  const performanceScore = audit.performance_score !== undefined
    ? audit.performance_score
    : (audit.performanceScore !== undefined ? audit.performanceScore : null);
  const hasSchema = (audit.has_schema ?? audit.hasSchema) ? 1 : 0;
  const hasSsl = (audit.has_ssl !== undefined || audit.hasSsl !== undefined)
    ? ((audit.has_ssl ?? audit.hasSsl) ? 1 : 0)
    : (website ? 1 : 0);
  const websiteStatus = audit.website_status || audit.websiteStatus || null;

  const scored = scoreAndClassifyCandidate({
    ...candidate,
    website,
    lcp_ms: lcpMs,
    performance_score: performanceScore,
    has_schema: hasSchema,
    has_ssl: hasSsl,
    website_status: websiteStatus,
    pain_summary: null,
    recommended_tier: null
  });

  return {
    ...candidate,
    website,
    lcp_ms: scored.lcp_ms,
    performance_score: scored.performance_score,
    has_schema: scored.has_schema,
    has_ssl: scored.has_ssl,
    website_status: scored.website_status,
    recommended_tier: scored.recommended_tier,
    pain_summary: scored.pain_summary,
    score: scored.score
  };
}

async function runLiveWebsiteAudit(candidate, env) {
  const rawAudit = await auditCandidateWebsite(candidate.website, {
    timeoutMs: 6000,
    psiApiKey: env?.PSI_API_KEY || env?.PAGESPEED_API_KEY || null
  });
  return deriveDiagnosticsFromAudit(candidate, rawAudit || {});
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

function authErrorResponse(request, auth, methods = ALLOWED_METHODS) {
  if (auth.rateLimited) {
    return json(
      request,
      { error: 'Too many failed authentication attempts. Please try again later.' },
      429,
      methods,
      { 'Retry-After': String(auth.retryAfter || 60) }
    );
  }
  return json(
    request,
    { error: auth.misconfigured ? 'CRM authentication is not configured.' : 'Unauthorized' },
    auth.misconfigured ? 503 : 401,
    methods
  );
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const auth = await checkAuth(request, env);
  if (!auth.authenticated) return authErrorResponse(request, auth);
  if (!env.DB) return json(request, { error: 'Database not available' }, 500);

  try {
    const candidate = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(params.id).first();
    if (!candidate) return json(request, { error: 'Candidate not found' }, 404);

    const renderedTemplates = renderAllTemplates(candidate);
    return json(request, { candidate, renderedTemplates });
  } catch (err) {
    if (/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
      return json(request, { error: 'Candidate not found' }, 404);
    }
    console.error('Error fetching outreach candidate detail:', err);
    return json(request, { error: 'Failed to fetch outreach candidate.' }, 500);
  }
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const candidateId = params.id;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) return authErrorResponse(request, auth);

  const csrf = enforceCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403);
  }

  const parsedBody = await readJsonObject(request, auth, { allowEmpty: false });
  if (!parsedBody.ok) {
    return json(request, { error: parsedBody.error }, parsedBody.status);
  }

  if (!env.DB) return json(request, { error: 'Database not available' }, 500);

  try {
    await upgradeExistingOutreachTable(env.DB);

    let existing;
    try {
      existing = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    } catch (err) {
      if (/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
        return json(request, { error: 'Candidate not found' }, 404);
      }
      throw err;
    }
    if (!existing) return json(request, { error: 'Candidate not found' }, 404);

    const body = { ...parsedBody.body };
    const allowedFields = [
      'business_name_clean', 'founder_name', 'founder_first_name', 'founder_last_name',
      'founder_title', 'city', 'zip', 'county', 'niche', 'score', 'email', 'phone', 'website',
      'outreach_status', 'notes',
      'gbp_rank', 'review_count', 'rating', 'gbp_category',
      'lcp_ms', 'performance_score', 'has_schema', 'has_ssl',
      'website_status', 'recommended_tier', 'pain_summary',
      'cadence_step', 'next_action_at', 'last_channel'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined && body[field] !== null && typeof body[field] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${field}".` }, 400);
      }
    }

    const parsedPatchEstVal = parseOptionalEstimatedValue(body);
    if (!parsedPatchEstVal.ok) {
      return json(request, { error: parsedPatchEstVal.error }, 400);
    }

    if (body.outreach_status !== undefined) {
      if (typeof body.outreach_status !== 'string' || !VALID_OUTREACH_STATUSES.has(body.outreach_status.trim())) {
        return json(request, {
          error: `Invalid outreach_status. Must be one of: ${[...VALID_OUTREACH_STATUSES].join(', ')}.`
        }, 400);
      }
      body.outreach_status = body.outreach_status.trim();
      if (
        ['in_cadence', 'emailed', 'promoted'].includes(body.outreach_status) &&
        body.cadence_step === undefined &&
        Number(existing.cadence_step || 0) === 0
      ) {
        body.cadence_step = 1;
      }
    }

    if (body.score !== undefined) {
      const scoreNum = Number(body.score);
      if (typeof body.score === 'boolean' || body.score === null || body.score === '' || !Number.isFinite(scoreNum) || scoreNum < 0 || scoreNum > 100) {
        return json(request, { error: 'Invalid score value (must be 0..100).' }, 400);
      }
      body.score = Math.round(scoreNum);
    }

    if (body.gbp_rank !== undefined) {
      const rankNum = Number(body.gbp_rank);
      if (typeof body.gbp_rank === 'boolean' || body.gbp_rank === null || body.gbp_rank === '' || !Number.isFinite(rankNum) || rankNum < 1 || rankNum > 200) {
        return json(request, { error: 'Invalid gbp_rank value (must be 1..200).' }, 400);
      }
      body.gbp_rank = Math.round(rankNum);
    }

    if (body.review_count !== undefined) {
      const revNum = Number(body.review_count);
      if (typeof body.review_count === 'boolean' || body.review_count === null || body.review_count === '' || !Number.isFinite(revNum) || revNum < 0) {
        return json(request, { error: 'Invalid review_count value (must be >= 0).' }, 400);
      }
      body.review_count = Math.round(revNum);
    }

    if (body.rating !== undefined) {
      const ratingNum = Number(body.rating);
      if (typeof body.rating === 'boolean' || body.rating === null || body.rating === '' || !Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
        return json(request, { error: 'Invalid rating value (must be 0..5).' }, 400);
      }
      body.rating = Math.round(ratingNum * 100) / 100;
    }

    if (body.lcp_ms !== undefined) {
      const lcpNum = Number(body.lcp_ms);
      if (typeof body.lcp_ms === 'boolean' || body.lcp_ms === null || body.lcp_ms === '' || !Number.isFinite(lcpNum) || lcpNum < 0) {
        return json(request, { error: 'Invalid lcp_ms value (must be >= 0).' }, 400);
      }
      body.lcp_ms = Math.round(lcpNum);
    }

    if (body.performance_score !== undefined) {
      const perfNum = Number(body.performance_score);
      if (typeof body.performance_score === 'boolean' || body.performance_score === null || body.performance_score === '' || !Number.isFinite(perfNum) || perfNum < 0 || perfNum > 100) {
        return json(request, { error: 'Invalid performance_score value (must be 0..100).' }, 400);
      }
      body.performance_score = Math.round(perfNum);
    }

    if (body.cadence_step !== undefined) {
      const stepNum = Number(body.cadence_step);
      if (typeof body.cadence_step === 'boolean' || body.cadence_step === null || body.cadence_step === '' || !Number.isFinite(stepNum) || stepNum < 0 || stepNum > 10) {
        return json(request, { error: 'Invalid cadence_step value (must be 0..10).' }, 400);
      }
      body.cadence_step = Math.round(stepNum);
    }

    if (body.has_schema !== undefined) {
      if (![0, 1, '0', '1', true, false].includes(body.has_schema)) {
        return json(request, { error: 'Invalid has_schema value (must be 0, 1, or boolean).' }, 400);
      }
      body.has_schema = body.has_schema === true || body.has_schema === 1 || body.has_schema === '1' ? 1 : 0;
    }

    if (body.has_ssl !== undefined) {
      if (![0, 1, '0', '1', true, false].includes(body.has_ssl)) {
        return json(request, { error: 'Invalid has_ssl value (must be 0, 1, or boolean).' }, 400);
      }
      body.has_ssl = body.has_ssl === true || body.has_ssl === 1 || body.has_ssl === '1' ? 1 : 0;
    }

    if (body.website_status !== undefined) {
      if (typeof body.website_status !== 'string' || !VALID_WEBSITE_STATUSES.has(body.website_status.trim())) {
        return json(request, {
          error: `Invalid website_status. Must be one of: ${[...VALID_WEBSITE_STATUSES].join(', ')}.`
        }, 400);
      }
      body.website_status = body.website_status.trim();
    }

    if (body.recommended_tier !== undefined) {
      if (typeof body.recommended_tier !== 'string' || !VALID_TIERS.has(body.recommended_tier.trim())) {
        return json(request, {
          error: `Invalid recommended_tier. Must be one of: ${[...VALID_TIERS].join(', ')}.`
        }, 400);
      }
      body.recommended_tier = body.recommended_tier.trim();
    }

    if (body.last_channel !== undefined && body.last_channel !== null && body.last_channel !== '') {
      if (typeof body.last_channel !== 'string' || !VALID_CHANNELS.has(body.last_channel.trim())) {
        return json(request, {
          error: `Invalid last_channel. Must be one of: ${[...VALID_CHANNELS].join(', ')}.`
        }, 400);
      }
      body.last_channel = body.last_channel.trim();
    }

    if (body.website !== undefined && body.website !== null && body.website !== '') {
      const normWeb = normalizeDomain(body.website);
      body.website = isValidCompanyDomain(normWeb) ? normWeb : '';
    }

    const updates = [];
    const values = [];

    const effectiveZip = body.zip !== undefined ? String(body.zip || '').trim() : (existing.zip || '');

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        let val = typeof body[field] === 'string' ? body[field].trim() : body[field];
        if (field === 'city') {
          val = normalizeSouthFlCity(val || '', effectiveZip);
          if (body.county === undefined && val) {
            const loc = matchSouthFloridaLocation(val, effectiveZip);
            if (loc.isSouthFlorida && loc.county) {
              updates.push('county = ?');
              values.push(loc.county);
            }
          }
        }
        if (field === 'next_action_at') {
          val = normalizeIsoDateTime(val);
        }
        updates.push(`${field} = ?`);
        values.push(val === '' && (field === 'next_action_at' || field === 'last_channel') ? null : val);
      }
    }

    // Automatically update enrichment_status when email or phone is manually entered
    const nextEmail = body.email !== undefined ? String(body.email || '').trim() : existing.email;
    const nextPhone = body.phone !== undefined ? String(body.phone || '').trim() : existing.phone;
    if (body.email !== undefined || body.phone !== undefined) {
      const nextEnrStatus = (nextEmail && nextPhone) ? 'found' : (nextEmail || nextPhone) ? 'partial' : existing.enrichment_status;
      updates.push('enrichment_status = ?');
      values.push(nextEnrStatus);
      if (nextEmail || nextPhone) {
        updates.push("enrichment_source = COALESCE(enrichment_source, 'manual')");
      }
    }

    if (updates.length === 0) {
      return json(request, { success: true, candidate: existing });
    }

    updates.push('updated_at = CURRENT_TIMESTAMP');
    values.push(candidateId);

    await env.DB.prepare(`UPDATE outreach_candidates SET ${updates.join(', ')} WHERE id = ?`)
      .bind(...values)
      .run();

    const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    let dismissMeta = {};
    if (body.outreach_status === 'dismissed') {
      dismissMeta = await findNextUncontactedPhoneCandidate(env.DB, candidateId);
    }
    return json(request, { success: true, candidate: updated, ...dismissMeta });
  } catch (err) {
    console.error('Error updating outreach candidate:', err);
    return json(request, { error: 'Failed to update outreach candidate.' }, 500);
  }
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const auth = await checkAuth(request, env);
  if (!auth.authenticated) return authErrorResponse(request, auth);

  const csrf = enforceCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403);
  }

  if (!env.DB) return json(request, { error: 'Database not available' }, 500);

  try {
    await env.DB.prepare('DELETE FROM outreach_candidates WHERE id = ?').bind(params.id).run();
    return json(request, { success: true });
  } catch (err) {
    if (/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
      return json(request, { success: true });
    }
    console.error('Error deleting outreach candidate:', err);
    return json(request, { error: 'Failed to delete outreach candidate.' }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const candidateId = params.id;
  const effectiveMethods = params?.action ? 'POST, OPTIONS' : ALLOWED_METHODS;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) return authErrorResponse(request, auth, effectiveMethods);

  const csrf = enforceCsrf(request, auth);
  if (!csrf.ok) {
    return json(request, { error: csrf.error || 'Forbidden' }, csrf.status || 403, effectiveMethods);
  }

  const parsedBody = await readJsonObject(request, auth, { allowEmpty: true });
  if (!parsedBody.ok) {
    return json(request, { error: parsedBody.error }, parsedBody.status, effectiveMethods);
  }

  if (!env.DB) return json(request, { error: 'Database not available' }, 500, effectiveMethods);

  try {
    await upgradeExistingOutreachTable(env.DB);

    const body = parsedBody.body;
    const scalarActionFields = [
      'action', 'company_domain', 'website', 'status', 'note', 'to', 'subject', 'body', 'mode',
      'touch_number', 'cadence_step', 'step', 'channel', 'last_channel', 'next_action_at', 'promote',
      'estimated_value', 'deal_value', 'skip_dns_check'
    ];
    for (const f of scalarActionFields) {
      if (body[f] !== undefined && body[f] !== null && typeof body[f] === 'object') {
        return json(request, { error: `Invalid non-primitive value for field "${f}".` }, 400, effectiveMethods);
      }
    }

    let candidate;
    try {
      candidate = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    } catch (err) {
      if (/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
        return json(request, { error: 'Candidate not found' }, 404, effectiveMethods);
      }
      throw err;
    }
    if (!candidate) return json(request, { error: 'Candidate not found' }, 404, effectiveMethods);

    const action = String(params.action || body.action || 'enrich').trim();

    // -------------------------------------------------------------------------
    // Action 1: Run Automated Contact Enrichment Waterfall (+ Website Audit if needed)
    // -------------------------------------------------------------------------
    if (action === 'enrich') {
      const requestedDomain = normalizeDomain(body.company_domain || body.website || '');
      const validRequestedDomain = isValidCompanyDomain(requestedDomain) ? requestedDomain : '';
      if (validRequestedDomain) {
        if (!candidate.website) {
          await env.DB.prepare('UPDATE outreach_candidates SET website = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .bind(validRequestedDomain, candidateId)
            .run();
        }
        candidate.website = validRequestedDomain;
      }

      const hasProvider = Boolean(
        env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API ||
        env.APOLLO_API_KEY || env.APOLLO_API ||
        env.PDL_API_KEY || env.PDL_API ||
        (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
      );

      if (!hasProvider) {
        return json(request, {
          error: 'No enrichment API keys configured (APOLLO_API_KEY, PDL_API_KEY, ENRICHMENT_API_KEY, or DATAFORSEO_LOGIN). Use the 1-click research links on the card or add an API key to your environment.',
          userError: true
        }, 400, effectiveMethods);
      }

      await env.DB.prepare("UPDATE outreach_candidates SET enrichment_status = 'pending' WHERE id = ?")
        .bind(candidateId)
        .run();

      const enr = await enrichOutreachCandidate(candidate, env);
      const effectiveWebsite = enr.website || (candidate.website !== 'google.com' ? candidate.website : null);

      let auditDiagnostics = null;
      if (effectiveWebsite && (candidate.lcp_ms === null || candidate.lcp_ms === undefined)) {
        try {
          auditDiagnostics = await runLiveWebsiteAudit({ ...candidate, website: effectiveWebsite }, env);
        } catch (auditErr) {
          console.warn('Website audit during enrich skipped:', auditErr.message);
        }
      }

      if (auditDiagnostics) {
        await env.DB.prepare(`
          UPDATE outreach_candidates
          SET founder_name = COALESCE(?, founder_name),
              founder_first_name = COALESCE(?, founder_first_name),
              founder_last_name = COALESCE(?, founder_last_name),
              email = COALESCE(?, CASE WHEN email LIKE '%@google.com' THEN NULL ELSE email END),
              phone = COALESCE(?, phone),
              website = COALESCE(?, CASE WHEN website = 'google.com' THEN NULL ELSE website END),
              enrichment_status = ?,
              enrichment_source = ?,
              enrichment_confidence = ?,
              enrichment_meta = ?,
              lcp_ms = ?,
              performance_score = ?,
              has_schema = ?,
              has_ssl = ?,
              website_status = ?,
              recommended_tier = ?,
              pain_summary = ?,
              score = ?,
              enriched_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          enr.resolvedFounder?.fullName || null,
          enr.resolvedFounder?.firstName || null,
          enr.resolvedFounder?.lastName || null,
          enr.email, enr.phone, enr.website,
          enr.status, enr.source, enr.confidence, JSON.stringify(enr.meta),
          auditDiagnostics.lcp_ms,
          auditDiagnostics.performance_score,
          auditDiagnostics.has_schema,
          auditDiagnostics.has_ssl,
          auditDiagnostics.website_status,
          auditDiagnostics.recommended_tier,
          auditDiagnostics.pain_summary,
          auditDiagnostics.score,
          candidateId
        ).run();
      } else {
        await env.DB.prepare(`
          UPDATE outreach_candidates
          SET founder_name = COALESCE(?, founder_name),
              founder_first_name = COALESCE(?, founder_first_name),
              founder_last_name = COALESCE(?, founder_last_name),
              email = COALESCE(?, CASE WHEN email LIKE '%@google.com' THEN NULL ELSE email END),
              phone = COALESCE(?, phone),
              website = COALESCE(?, CASE WHEN website = 'google.com' THEN NULL ELSE website END),
              enrichment_status = ?,
              enrichment_source = ?,
              enrichment_confidence = ?,
              enrichment_meta = ?,
              enriched_at = CURRENT_TIMESTAMP,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          enr.resolvedFounder?.fullName || null,
          enr.resolvedFounder?.firstName || null,
          enr.resolvedFounder?.lastName || null,
          enr.email, enr.phone, enr.website,
          enr.status, enr.source, enr.confidence, JSON.stringify(enr.meta),
          candidateId
        ).run();
      }

      const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
      return json(request, {
        success: true,
        enrichment: enr,
        ...(auditDiagnostics ? { audit: auditDiagnostics } : {}),
        candidate: updated,
        renderedTemplates: renderAllTemplates(updated || candidate)
      }, 200, effectiveMethods);
    }

    // -------------------------------------------------------------------------
    // Action 2: Run Live Website Technical & Schema Audit
    // -------------------------------------------------------------------------
    if (action === 'audit') {
      const requestedDomain = normalizeDomain(body.website || body.company_domain || '');
      if (requestedDomain && isValidCompanyDomain(requestedDomain)) {
        candidate.website = requestedDomain;
      }

      const audited = await runLiveWebsiteAudit(candidate, env);

      await env.DB.prepare(`
        UPDATE outreach_candidates
        SET website = COALESCE(?, website),
            lcp_ms = ?,
            performance_score = ?,
            has_schema = ?,
            has_ssl = ?,
            website_status = ?,
            recommended_tier = ?,
            pain_summary = ?,
            score = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(
        candidate.website || null,
        audited.lcp_ms,
        audited.performance_score,
        audited.has_schema,
        audited.has_ssl,
        audited.website_status,
        audited.recommended_tier,
        audited.pain_summary,
        audited.score,
        candidateId
      ).run();

      const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
      const effectiveCandidate = updated || audited;
      return json(request, {
        success: true,
        audit: {
          lcp_ms: audited.lcp_ms,
          performance_score: audited.performance_score,
          has_schema: audited.has_schema,
          has_ssl: audited.has_ssl,
          website_status: audited.website_status,
          recommended_tier: audited.recommended_tier,
          pain_summary: audited.pain_summary,
          score: audited.score
        },
        candidate: effectiveCandidate,
        renderedTemplates: renderAllTemplates(effectiveCandidate)
      }, 200, effectiveMethods);
    }

    // -------------------------------------------------------------------------
    // Action 3: Promote Candidate to Active Kanban Pipeline
    // -------------------------------------------------------------------------
    if (action === 'promote') {
      const defaultPromoteStage = candidate.outreach_status === 'emailed' ? 'contacted' : 'new';
      const hasExplicitStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== '';
      const rawStage = hasExplicitStatus ? body.status : defaultPromoteStage;
      if (typeof rawStage !== 'string' || !VALID_LEAD_STATUSES.has(rawStage.trim())) {
        return json(request, {
          error: `Invalid target lead status. Must be one of: ${[...VALID_LEAD_STATUSES].join(', ')}.`
        }, 400, effectiveMethods);
      }
      const targetStage = rawStage.trim();

      const parsedEstVal = parseOptionalEstimatedValue(body);
      if (!parsedEstVal.ok) {
        return json(request, { error: parsedEstVal.error }, 400, effectiveMethods);
      }

      const promoted = await promoteCandidateToLead(env.DB, candidate, {
        status: targetStage,
        explicitStatus: hasExplicitStatus,
        author: auth.user || 'Christian',
        noteType: 'note',
        noteContent: String(body.note || '').trim() || buildDefaultPromoteNote(candidate),
        estimatedValue: parsedEstVal.value
      });

      const [updated, taskCounts] = await Promise.all([
        env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first(),
        getTaskBadgeCounts(env.DB)
      ]);
      return json(request, {
        success: true,
        lead_id: promoted.leadId,
        estimated_value: promoted.estimatedValue,
        queued_task: promoted?.queuedTask || null,
        cancelled_task_count: promoted?.cancelledTaskCount || 0,
        task_counts: taskCounts,
        candidate: updated
      }, 200, effectiveMethods);
    }

    // -------------------------------------------------------------------------
    // Action 3b: Dismiss Candidate & Auto-Advance to Next Uncontacted Phone Lead
    // -------------------------------------------------------------------------
    if (action === 'dismiss') {
      const dismissNote = String(body.note || '').trim();
      const nextNotes = dismissNote
        ? (candidate.notes && String(candidate.notes).trim() ? `${String(candidate.notes).trim()}\n${dismissNote}` : dismissNote)
        : (candidate.notes ?? null);

      await env.DB.prepare(`
        UPDATE outreach_candidates
        SET outreach_status = 'dismissed',
            notes = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).bind(nextNotes, candidateId).run();

      const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
      const nextQueue = await findNextUncontactedPhoneCandidate(env.DB, candidateId);
      return json(request, {
        success: true,
        candidate: updated,
        ...nextQueue
      }, 200, effectiveMethods);
    }

    // -------------------------------------------------------------------------
    // Action 4: Log Multi-Touch Cadence Step ('log_touch' / 'advance_cadence')
    // -------------------------------------------------------------------------
    if (action === 'log_touch' || action === 'advance_cadence') {
      const rawChannel = String(body.channel || body.last_channel || 'call').trim().toLowerCase();
      if (!VALID_CHANNELS.has(rawChannel)) {
        return json(request, {
          error: `Invalid channel "${rawChannel}". Must be one of: ${[...VALID_CHANNELS].join(', ')}.`
        }, 400, effectiveMethods);
      }

      const rawStep = body.step ?? body.cadence_step ?? body.touch_number ?? Math.min((Number(candidate.cadence_step) || 0) + 1, 4);
      const stepNum = Number(rawStep);
      if (typeof rawStep === 'boolean' || rawStep === '' || !Number.isFinite(stepNum) || ![1, 2, 3, 4].includes(Math.round(stepNum))) {
        return json(request, {
          error: 'Invalid cadence step. Must be 1, 2, 3, or 4.'
        }, 400, effectiveMethods);
      }
      const step = Math.round(stepNum);
      const effectiveCadenceStep = Math.max(Number(candidate.cadence_step) || 0, step);

      const hasExplicitStatus = body.status !== undefined && body.status !== null && String(body.status).trim() !== '';
      let targetLeadStatus = 'contacted';
      if (hasExplicitStatus) {
        if (typeof body.status !== 'string' || !VALID_LEAD_STATUSES.has(body.status.trim())) {
          return json(request, {
            error: `Invalid target lead status. Must be one of: ${[...VALID_LEAD_STATUSES].join(', ')}.`
          }, 400, effectiveMethods);
        }
        targetLeadStatus = body.status.trim();
      }

      const parsedEstVal = parseOptionalEstimatedValue(body);
      if (!parsedEstVal.ok) {
        return json(request, { error: parsedEstVal.error }, 400, effectiveMethods);
      }

      const nextActionAt = resolveCadenceNextActionAt(candidate.cadence_step, step, rawChannel, body.next_action_at);

      const shouldPromote = body.promote !== false;
      const nextOutreachStatus = body.promote === true
        ? 'promoted'
        : (candidate.outreach_status === 'promoted'
          ? 'promoted'
          : (step < 4
            ? (candidate.outreach_status === 'in_cadence' ? 'in_cadence' : 'emailed')
            : (candidate.lead_id ? 'promoted' : 'emailed')));

      const customNote = String(body.note || '').trim();
      const noteContent = customNote ||
        `Cadence Touch #${step} logged via ${rawChannel.toUpperCase()} for ${candidate.business_name_clean} (${candidate.city || 'South Florida'}).` +
        (nextActionAt ? ` Next follow-up scheduled for ${nextActionAt}.` : ' 4-touch cadence complete.');

      let leadId = candidate.lead_id || null;
      let promotedEstimatedValue;
      let promoted = null;

      if (shouldPromote || candidate.lead_id) {
        promoted = await promoteCandidateToLead(env.DB, candidate, {
          status: targetLeadStatus,
          explicitStatus: hasExplicitStatus,
          author: auth.user || 'Christian',
          outreachStatus: nextOutreachStatus,
          noteType: rawChannel,
          noteContent,
          cadenceStep: effectiveCadenceStep,
          lastChannel: rawChannel,
          nextActionAt,
          estimatedValue: parsedEstVal.value
        });
        leadId = promoted.leadId;
        promotedEstimatedValue = promoted.estimatedValue;
      } else {
        await env.DB.prepare(`
          UPDATE outreach_candidates
          SET cadence_step = ?,
              last_channel = ?,
              next_action_at = ?,
              outreach_status = ?,
              emailed_at = CASE WHEN ? = 'email' THEN CURRENT_TIMESTAMP ELSE emailed_at END,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(
          effectiveCadenceStep,
          rawChannel,
          nextActionAt,
          nextOutreachStatus,
          rawChannel,
          candidateId
        ).run();
      }

      const [updated, taskCounts] = await Promise.all([
        env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first(),
        getTaskBadgeCounts(env.DB)
      ]);
      return json(request, {
        success: true,
        cadence_step: effectiveCadenceStep,
        last_channel: rawChannel,
        next_action_at: nextActionAt,
        lead_id: leadId,
        ...(promotedEstimatedValue !== undefined ? { estimated_value: promotedEstimatedValue } : {}),
        queued_task: promoted?.queuedTask || null,
        cancelled_task_count: promoted?.cancelledTaskCount || 0,
        task_counts: taskCounts,
        candidate: updated,
        renderedTemplates: renderAllTemplates(updated || candidate)
      }, 200, effectiveMethods);
    }

    // -------------------------------------------------------------------------
    // Action 5: Send CRO Outreach Email + Update Cadence + Auto-Promote on Kanban
    // -------------------------------------------------------------------------
    if (action === 'send_email' || action === 'send-email') {
      const toEmail = String(body.to || candidate.email || '').trim();
      const subject = String(body.subject || '').trim();
      const emailBody = String(body.body || '').trim();
      const mode = String(body.mode || 'send').trim(); // 'send' (API dispatch) or 'log_only' (opened in mail client)

      const rawTouch = body.touch_number ?? body.cadence_step ?? body.step;
      let touchStep = 1;
      if (rawTouch !== undefined && rawTouch !== null && rawTouch !== '') {
        const parsedTouch = Number(rawTouch);
        if (typeof rawTouch === 'boolean' || !Number.isFinite(parsedTouch) || ![1, 2, 3, 4].includes(Math.round(parsedTouch))) {
          return json(request, { error: 'Invalid touch_number / cadence_step. Must be 1, 2, 3, or 4.' }, 400, effectiveMethods);
        }
        touchStep = Math.round(parsedTouch);
      } else {
        const currentStep = Number(candidate.cadence_step || 0);
        if (currentStep >= 3) {
          touchStep = 4;
        } else if (currentStep === 2) {
          touchStep = 3;
        } else {
          touchStep = 1;
        }
      }

      const parsedEstVal = parseOptionalEstimatedValue(body);
      if (!parsedEstVal.ok) {
        return json(request, { error: parsedEstVal.error }, 400, effectiveMethods);
      }

      if (!toEmail || !toEmail.includes('@')) {
        return json(request, { error: 'A valid recipient email address is required.' }, 400, effectiveMethods);
      }
      if (!subject || !emailBody) {
        return json(request, { error: 'Subject and email body are required.' }, 400, effectiveMethods);
      }

      // Verify recipient domain exists in DNS and has MX records before sending/logging
      if (!body.skip_dns_check) {
        const dnsCheck = await verifyEmailDomainDns(toEmail);
        if (!dnsCheck.valid) {
          return json(request, {
            error: `Bounce protection: ${dnsCheck.reason}. This business likely hasn't configured mail records on their domain yet — try calling/texting or use the PeopleLookup pill to find the owner's personal Gmail/iCloud/Yahoo address.`,
            dnsInvalid: true
          }, 400, effectiveMethods);
        }
      }

      // Save email onto candidate if Christian typed/updated it directly in the composer
      if (toEmail !== candidate.email) {
        await env.DB.prepare('UPDATE outreach_candidates SET email = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
          .bind(toEmail, candidateId)
          .run();
        candidate.email = toEmail;
      }

      let dispatchProvider = 'mail_app';
      if (mode === 'send') {
        const dispatchResult = await dispatchOutreachEmail(env, {
          to: toEmail,
          subject,
          text: emailBody,
          html: formatPersonalEmailHtml(emailBody),
          candidate
        });

        if (!dispatchResult.ok) {
          return json(request, {
            error: dispatchResult.error,
            canFallbackToMailto: true
          }, 400, effectiveMethods);
        }
        dispatchProvider = dispatchResult.provider;
      }

      const effectiveCadenceStep = Math.max(Number(candidate.cadence_step) || 0, touchStep);
      const nextActionAt = resolveCadenceNextActionAt(candidate.cadence_step, touchStep, 'email', body.next_action_at);

      // Promote to CRM Kanban Pipeline under 'contacted' and log outbound email in lead_notes
      const promoted = await promoteCandidateToLead(env.DB, candidate, {
        status: 'contacted',
        explicitStatus: false,
        author: auth.user || 'Christian',
        outreachStatus: candidate.outreach_status === 'promoted' ? 'promoted' : 'emailed',
        lastSubject: subject,
        noteType: 'email',
        noteContent: `Outbound Outreach Email (Touch #${touchStep}) sent to ${toEmail} (${dispatchProvider}):\nSubject: ${subject}\n\n${emailBody}`,
        cadenceStep: effectiveCadenceStep,
        lastChannel: 'email',
        nextActionAt,
        estimatedValue: parsedEstVal.value
      });

      const [updated, taskCounts] = await Promise.all([
        env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first(),
        getTaskBadgeCounts(env.DB)
      ]);
      return json(request, {
        success: true,
        provider: dispatchProvider,
        touch_number: touchStep,
        cadence_step: effectiveCadenceStep,
        next_action_at: nextActionAt,
        lead_id: promoted.leadId,
        estimated_value: promoted.estimatedValue,
        queued_task: promoted?.queuedTask || null,
        cancelled_task_count: promoted?.cancelledTaskCount || 0,
        task_counts: taskCounts,
        candidate: updated
      }, 200, effectiveMethods);
    }

    return json(request, { error: `Unknown action: ${action}` }, 400, effectiveMethods);
  } catch (err) {
    console.error('Error executing outreach action:', err);
    return json(request, { error: 'Failed to execute outreach action.' }, 500, effectiveMethods);
  }
}

function getTierEstimatedValue(tier) {
  return TIER_ESTIMATED_VALUES[tier] || 1500;
}

function getTierServiceInterest(candidate) {
  const niche = candidate.niche || 'Local Business';
  const tier = candidate.recommended_tier;
  if (tier && TIER_LABELS[tier]) {
    return `${TIER_LABELS[tier]} — ${niche}`;
  }
  return `Day-1 Launchpad (${niche})`;
}

function buildDiagnosticLeadMessage(candidate, canonicalCity) {
  const parts = [];
  if (candidate.place_id || candidate.gbp_rank) {
    parts.push(`Google Maps Rank: #${candidate.gbp_rank || '?'} in ${canonicalCity} (${candidate.review_count ?? 0} reviews, ${candidate.rating ?? 'N/A'}★)`);
  }
  if (candidate.doc_number) {
    parts.push(`Doc#: ${candidate.doc_number} (${candidate.entity_type || 'Google Maps GBP'})`);
  }
  if (candidate.founder_name) {
    parts.push(`Owner: ${candidate.founder_name} (${candidate.founder_title || 'Owner'})`);
  }
  if (candidate.website) {
    const lcpLabel = candidate.lcp_ms ? `, LCP ${(Number(candidate.lcp_ms) / 1000).toFixed(1)}s` : '';
    const perfLabel = candidate.performance_score !== null && candidate.performance_score !== undefined ? `, Perf ${candidate.performance_score}/100` : '';
    const schemaLabel = candidate.has_schema ? ', Schema: Yes' : ', Schema: Missing';
    parts.push(`Website: ${candidate.website} [${candidate.website_status || 'unoptimized'}${lcpLabel}${perfLabel}${schemaLabel}]`);
  } else {
    parts.push('Website: None (Missing)');
  }
  if (candidate.recommended_tier) {
    parts.push(`Recommended Tier: ${TIER_LABELS[candidate.recommended_tier] || candidate.recommended_tier}`);
  }
  if (candidate.pain_summary) {
    parts.push(`Diagnostic: ${candidate.pain_summary}`);
  }
  if (candidate.principal_address) {
    parts.push(`Address: ${candidate.principal_address}, ${canonicalCity}, FL ${candidate.zip || ''}`);
  }
  return parts.join(' | ');
}

function buildDefaultPromoteNote(candidate) {
  const canonicalCity = normalizeSouthFlCity(candidate.city, candidate.zip) || candidate.city || 'South Florida';
  const tierLabel = TIER_LABELS[candidate.recommended_tier] || 'Day-1 Launchpad ($1,500)';
  const diag = candidate.pain_summary ? `\nDiagnostic Summary: ${candidate.pain_summary}` : '';
  return `Promoted from Diagnostic Outreach (${candidate.doc_number || candidate.place_id || candidate.id} — ${canonicalCity}) • Tier: ${tierLabel}.${diag}`;
}

/**
 * Promote an outreach candidate into the main `leads` table (or update if already linked)
 * and log a timeline note in `lead_notes`.
 */
async function promoteCandidateToLead(db, candidate, opts) {
  let leadId = candidate.lead_id;
  const existingLead = leadId
    ? await db.prepare('SELECT id, status, estimated_value FROM leads WHERE id = ?').bind(leadId).first()
    : null;

  const canonicalCity = normalizeSouthFlCity(candidate.city, candidate.zip) || candidate.city || 'South Florida';
  const contactInfo = candidate.email || candidate.phone || `${canonicalCity}, FL (${candidate.doc_number})`;
  const serviceInterest = getTierServiceInterest(candidate);
  const hasEstimatedValueOverride = opts.estimatedValue !== undefined && opts.estimatedValue !== null;
  const defaultEstimatedValue = getTierEstimatedValue(candidate.recommended_tier);
  const effectiveEstimatedValue = hasEstimatedValueOverride ? opts.estimatedValue : defaultEstimatedValue;
  const sourcePage = `Google Maps (${candidate.place_id || candidate.doc_number || candidate.id})`;
  const contextMessage = buildDiagnosticLeadMessage(candidate, canonicalCity);

  let persistedEstimatedValue = effectiveEstimatedValue;
  let queuedTask = null;
  let cancelledTaskCount = 0;

  if (!existingLead) {
    leadId = generateId('lead_');
    const targetStatus = opts.status || 'contacted';
    await db.prepare(`
      INSERT INTO leads (
        id, name, contact_info, email, phone, company, company_domain,
        service_interest, message, source_page, status, estimated_value,
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).bind(
      leadId,
      candidate.founder_name,
      contactInfo,
      candidate.email || null,
      candidate.phone || null,
      candidate.business_name_clean,
      candidate.website || null,
      serviceInterest,
      contextMessage,
      sourcePage,
      targetStatus,
      effectiveEstimatedValue
    ).run();

    if (targetStatus === 'contacted') {
      const createdLead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
      if (createdLead) {
        queuedTask = await queueContactedFollowUpTask(db, createdLead);
      }
    }
  } else {
    const estimatedValueSql = hasEstimatedValueOverride
      ? 'estimated_value = ?,'
      : 'estimated_value = CASE WHEN COALESCE(estimated_value, 0) <= 0 OR estimated_value = 1500 THEN ? ELSE estimated_value END,';

    const nextLeadStatus = (opts.explicitStatus || !existingLead.status || existingLead.status === 'new')
      ? (opts.status || 'contacted')
      : existingLead.status;

    await db.prepare(`
      UPDATE leads
      SET contact_info = COALESCE(?, contact_info),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          service_interest = COALESCE(?, service_interest),
          message = COALESCE(?, message),
          ${estimatedValueSql}
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      candidate.email || candidate.phone || null,
      candidate.email || null,
      candidate.phone || null,
      serviceInterest,
      contextMessage,
      effectiveEstimatedValue,
      nextLeadStatus,
      leadId
    ).run();

    if (nextLeadStatus !== existingLead.status) {
      if (nextLeadStatus === 'contacted') {
        const updatedLead = await db.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
        if (updatedLead) {
          queuedTask = await queueContactedFollowUpTask(db, updatedLead);
        }
      } else if (existingLead.status === 'contacted') {
        cancelledTaskCount = await cancelPendingAutoFollowUpTasks(db, leadId);
      }
    }

    if (!hasEstimatedValueOverride) {
      const existingVal = Number(existingLead.estimated_value || 0);
      persistedEstimatedValue = (existingVal <= 0 || existingVal === 1500) ? defaultEstimatedValue : existingVal;
    }
  }

  // Record timeline note
  const noteId = generateId('note_');
  await db.prepare(`
    INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
    VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(noteId, leadId, opts.author || 'Christian', opts.noteType || 'email', opts.noteContent).run();

  // Update outreach_candidates record (including cadence tracking if provided)
  const nextOutreachStatus = opts.outreachStatus || 'promoted';
  if (opts.cadenceStep !== undefined) {
    await db.prepare(`
      UPDATE outreach_candidates
      SET outreach_status = ?,
          emailed_at = CASE WHEN ? = 'emailed' OR ? = 'email' THEN CURRENT_TIMESTAMP ELSE emailed_at END,
          last_subject = COALESCE(?, last_subject),
          lead_id = ?,
          cadence_step = MAX(COALESCE(cadence_step, 0), ?),
          last_channel = COALESCE(?, last_channel),
          next_action_at = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      nextOutreachStatus,
      nextOutreachStatus,
      opts.lastChannel || '',
      opts.lastSubject || null,
      leadId,
      opts.cadenceStep,
      opts.lastChannel || null,
      opts.nextActionAt !== undefined ? opts.nextActionAt : candidate.next_action_at,
      candidate.id
    ).run();
  } else {
    await db.prepare(`
      UPDATE outreach_candidates
      SET outreach_status = ?,
          emailed_at = CASE WHEN ? = 'emailed' THEN CURRENT_TIMESTAMP ELSE emailed_at END,
          last_subject = COALESCE(?, last_subject),
          lead_id = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      nextOutreachStatus,
      nextOutreachStatus,
      opts.lastSubject || null,
      leadId,
      candidate.id
    ).run();
  }

  return { leadId, estimatedValue: persistedEstimatedValue, queuedTask, cancelledTaskCount };
}

/**
 * Send 1-to-1 founder outreach email via configured provider (Resend, Postmark, SendGrid, or Webhook).
 */
async function dispatchOutreachEmail(env, { to, subject, text, html, candidate }) {
  const replyTo = env.OUTREACH_REPLY_TO || env.NOTIFICATION_EMAIL || 'chris@g3zcreative.com';
  const fromEmail = env.OUTREACH_FROM || env.RESEND_FROM || 'Christian Gomez <chris@g3zcreative.com>';

  // 1. Resend
  if (env.RESEND_API_KEY) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [to],
        reply_to: replyTo,
        subject,
        text,
        html
      })
    });
    if (!res.ok) {
      console.error('Resend dispatch error:', res.status, await res.text().catch(() => ''));
      return { ok: false, error: `Email provider rejected request (Resend HTTP ${res.status}).` };
    }
    return { ok: true, provider: 'resend' };
  }

  // 2. Postmark
  if (env.POSTMARK_SERVER_TOKEN) {
    const res = await fetch('https://api.postmarkapp.com/email', {
      method: 'POST',
      headers: {
        'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        From: env.POSTMARK_FROM || 'chris@g3zcreative.com',
        To: to,
        ReplyTo: replyTo,
        Subject: subject,
        TextBody: text,
        HtmlBody: html
      })
    });
    if (!res.ok) {
      console.error('Postmark dispatch error:', res.status, await res.text().catch(() => ''));
      return { ok: false, error: `Email provider rejected request (Postmark HTTP ${res.status}).` };
    }
    return { ok: true, provider: 'postmark' };
  }

  // 3. SendGrid
  if (env.SENDGRID_API_KEY) {
    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: to, name: candidate.founder_name }] }],
        from: { email: env.SENDGRID_FROM || 'chris@g3zcreative.com', name: 'Christian Gomez — G3Z Creative' },
        reply_to: { email: replyTo, name: 'Christian Gomez' },
        subject,
        content: [
          { type: 'text/plain', value: text },
          { type: 'text/html', value: html }
        ]
      })
    });
    if (!res.ok) {
      console.error('SendGrid dispatch error:', res.status, await res.text().catch(() => ''));
      return { ok: false, error: `Email provider rejected request (SendGrid HTTP ${res.status}).` };
    }
    return { ok: true, provider: 'sendgrid' };
  }

  // 4. Generic Email Webhook
  if (env.EMAIL_WEBHOOK_URL) {
    const res = await fetch(env.EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'outreach_email',
        from: fromEmail,
        to,
        reply_to: replyTo,
        subject,
        text,
        html,
        candidate
      })
    });
    if (!res.ok) {
      return { ok: false, error: `Webhook error (${res.status})` };
    }
    return { ok: true, provider: 'webhook' };
  }

  return {
    ok: false,
    error: 'No outbound email API key configured in Worker (RESEND_API_KEY, POSTMARK_SERVER_TOKEN, SENDGRID_API_KEY, or EMAIL_WEBHOOK_URL). Click "Open in Mail App" below to send from your email client and auto-promote to Contacted!'
  };
}
