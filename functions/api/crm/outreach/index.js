/**
 * Google Maps & Business Listings Diagnostic Outreach Candidates API
 * GET  /api/crm/outreach - Fetch outreach candidates, filters, KPI counts, and diagnostic templates
 * POST /api/crm/outreach - Add single candidate, bulk import Google Maps / Business Listings records, or run live Maps Bleeder discovery
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../auth.js';
import {
  buildCandidateRecord,
  parseOutreachBulkText,
  enrichOutreachCandidate,
  buildOutreachWhereClause,
  discoverMapsBleedersViaDataForSeo,
  auditCandidateWebsite,
  scoreAndClassifyCandidate,
  OUTREACH_TEMPLATES
} from '../_outreach_engine.js';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const MAX_IMPORT_RECORDS = 2000;
const BATCH_CHUNK_SIZE = 50;
const MAX_AUDIT_SUBREQUESTS = 15;

const VALID_OUTREACH_STATUSES = new Set(['uncontacted', 'in_cadence', 'emailed', 'promoted', 'dismissed']);
const VALID_STATUS_FILTERS = new Set(['active', 'all', 'uncontacted', 'in_cadence', 'emailed', 'promoted', 'dismissed']);
const VALID_CONTACT_FILTERS = new Set(['all', 'has_email', 'has_phone', 'has_any', 'needs_enrichment']);
const VALID_TIER_FILTERS = new Set(['all', 'platform_3k', 'retainer_2500', 'pilot_500']);
const VALID_TIERS = new Set(['platform_3k', 'retainer_2500', 'pilot_500']);
const VALID_WEBSITE_STATUS_FILTERS = new Set(['all', 'missing', 'broken', 'slow', 'unoptimized', 'healthy', 'needs_fix']);
const VALID_WEBSITE_STATUSES = new Set(['missing', 'broken', 'slow', 'unoptimized', 'healthy']);
const VALID_CADENCE_FILTERS = new Set(['all', 'due_today', 'step_0', 'step_1', 'step_2', 'step_3', 'step_4', 'in_cadence']);
const VALID_CHANNELS = new Set(['email', 'call', 'sms']);

const DIAGNOSTIC_SCHEMA_COLUMNS = [
  ['place_id', 'TEXT'],
  ['cid', 'TEXT'],
  ['gbp_rank', 'INTEGER'],
  ['review_count', 'INTEGER'],
  ['rating', 'REAL'],
  ['gbp_category', 'TEXT'],
  ['top_competitors', 'TEXT'],
  ['lcp_ms', 'INTEGER'],
  ['performance_score', 'INTEGER'],
  ['has_schema', 'INTEGER DEFAULT 0'],
  ['has_ssl', 'INTEGER DEFAULT 0'],
  ['website_status', 'TEXT'],
  ['recommended_tier', 'TEXT'],
  ['pain_summary', 'TEXT'],
  ['cadence_step', 'INTEGER DEFAULT 0'],
  ['next_action_at', 'DATETIME'],
  ['last_channel', 'TEXT']
];

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

function validateDiscoveryBodyFields(body) {
  const discoveryScalarFields = [
    'city', 'niche', 'keyword', 'query', 'county', 'state',
    'min_rank', 'max_rank', 'rank_min', 'rank_max',
    'minRank', 'maxRank', 'rankMin', 'rankMax',
    'min_reviews', 'max_reviews', 'minReviews', 'maxReviews',
    'depth', 'limit', 'max_audit', 'maxAudit'
  ];
  for (const field of discoveryScalarFields) {
    if (body[field] !== undefined && body[field] !== null && typeof body[field] === 'object') {
      return `Invalid non-primitive value for field "${field}".`;
    }
  }
  return null;
}

function validateCandidateInputObject(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return 'Each candidate must be a JSON object.';
  }
  const scalarFields = [
    'doc_number', 'docNumber', 'business_name', 'businessName', 'company',
    'founder_name', 'founderName', 'officer_name', 'name', 'founder_title',
    'city', 'state', 'zip', 'niche', 'email', 'phone', 'website', 'company_domain',
    'outreach_status', 'notes',
    'place_id', 'placeId', 'cid',
    'gbp_rank', 'gbpRank', 'review_count', 'reviewCount', 'rating',
    'gbp_category', 'gbpCategory',
    'lcp_ms', 'lcpMs', 'performance_score', 'performanceScore',
    'has_schema', 'hasSchema', 'has_ssl', 'hasSsl',
    'website_status', 'websiteStatus',
    'recommended_tier', 'recommendedTier',
    'pain_summary', 'painSummary',
    'cadence_step', 'cadenceStep',
    'next_action_at', 'nextActionAt',
    'last_channel', 'lastChannel'
  ];
  for (const f of scalarFields) {
    if (item[f] !== undefined && item[f] !== null && typeof item[f] === 'object') {
      return `Invalid non-primitive value for field "${f}".`;
    }
  }

  const topCompetitorsVal = item.top_competitors !== undefined ? item.top_competitors : item.topCompetitors;
  if (topCompetitorsVal !== undefined && topCompetitorsVal !== null) {
    if (typeof topCompetitorsVal !== 'string' && !Array.isArray(topCompetitorsVal)) {
      return 'Invalid top_competitors value. Must be an array or JSON string.';
    }
  }

  if (item.outreach_status !== undefined && item.outreach_status !== null) {
    if (typeof item.outreach_status !== 'string' || !VALID_OUTREACH_STATUSES.has(item.outreach_status.trim())) {
      return `Invalid outreach_status. Must be one of: ${[...VALID_OUTREACH_STATUSES].join(', ')}.`;
    }
  }

  const gbpRankRaw = item.gbp_rank !== undefined ? item.gbp_rank : item.gbpRank;
  if (gbpRankRaw !== undefined && gbpRankRaw !== null && gbpRankRaw !== '') {
    const rankNum = Number(gbpRankRaw);
    if (typeof gbpRankRaw === 'boolean' || !Number.isFinite(rankNum) || rankNum < 1 || rankNum > 200) {
      return 'Invalid gbp_rank value (must be 1..200).';
    }
  }

  const reviewCountRaw = item.review_count !== undefined ? item.review_count : item.reviewCount;
  if (reviewCountRaw !== undefined && reviewCountRaw !== null && reviewCountRaw !== '') {
    const revNum = Number(reviewCountRaw);
    if (typeof reviewCountRaw === 'boolean' || !Number.isFinite(revNum) || revNum < 0) {
      return 'Invalid review_count value (must be >= 0).';
    }
  }

  if (item.rating !== undefined && item.rating !== null && item.rating !== '') {
    const ratingNum = Number(item.rating);
    if (typeof item.rating === 'boolean' || !Number.isFinite(ratingNum) || ratingNum < 0 || ratingNum > 5) {
      return 'Invalid rating value (must be 0..5).';
    }
  }

  const lcpRaw = item.lcp_ms !== undefined ? item.lcp_ms : item.lcpMs;
  if (lcpRaw !== undefined && lcpRaw !== null && lcpRaw !== '') {
    const lcpNum = Number(lcpRaw);
    if (typeof lcpRaw === 'boolean' || !Number.isFinite(lcpNum) || lcpNum < 0) {
      return 'Invalid lcp_ms value (must be >= 0).';
    }
  }

  const perfRaw = item.performance_score !== undefined ? item.performance_score : item.performanceScore;
  if (perfRaw !== undefined && perfRaw !== null && perfRaw !== '') {
    const perfNum = Number(perfRaw);
    if (typeof perfRaw === 'boolean' || !Number.isFinite(perfNum) || perfNum < 0 || perfNum > 100) {
      return 'Invalid performance_score value (must be 0..100).';
    }
  }

  const cadenceStepRaw = item.cadence_step !== undefined ? item.cadence_step : item.cadenceStep;
  if (cadenceStepRaw !== undefined && cadenceStepRaw !== null && cadenceStepRaw !== '') {
    const stepNum = Number(cadenceStepRaw);
    if (typeof cadenceStepRaw === 'boolean' || !Number.isFinite(stepNum) || stepNum < 0 || stepNum > 10) {
      return 'Invalid cadence_step value (must be 0..10).';
    }
  }

  const webStatusRaw = item.website_status !== undefined ? item.website_status : item.websiteStatus;
  if (webStatusRaw !== undefined && webStatusRaw !== null && String(webStatusRaw).trim() !== '') {
    if (typeof webStatusRaw !== 'string' || !VALID_WEBSITE_STATUSES.has(webStatusRaw.trim())) {
      return `Invalid website_status. Must be one of: ${[...VALID_WEBSITE_STATUSES].join(', ')}.`;
    }
  }

  const recTierRaw = item.recommended_tier !== undefined ? item.recommended_tier : item.recommendedTier;
  if (recTierRaw !== undefined && recTierRaw !== null && String(recTierRaw).trim() !== '') {
    if (typeof recTierRaw !== 'string' || !VALID_TIERS.has(recTierRaw.trim())) {
      return `Invalid recommended_tier. Must be one of: ${[...VALID_TIERS].join(', ')}.`;
    }
  }

  const lastChannelRaw = item.last_channel !== undefined ? item.last_channel : item.lastChannel;
  if (lastChannelRaw !== undefined && lastChannelRaw !== null && String(lastChannelRaw).trim() !== '') {
    if (typeof lastChannelRaw !== 'string' || !VALID_CHANNELS.has(lastChannelRaw.trim())) {
      return `Invalid last_channel. Must be one of: ${[...VALID_CHANNELS].join(', ')}.`;
    }
  }

  return null;
}

function computeFallbackTier(rec) {
  if (rec.recommended_tier && VALID_TIERS.has(rec.recommended_tier)) {
    return rec.recommended_tier;
  }
  const rev = Number(rec.review_count || 0);
  const webStatus = rec.website_status || (rec.website ? 'unoptimized' : 'missing');
  const lcp = rec.lcp_ms !== null && rec.lcp_ms !== undefined ? Number(rec.lcp_ms) : null;
  const hasSevereWebBottleneck = ['missing', 'broken', 'slow'].includes(webStatus) || (lcp !== null && lcp > 4000);

  if (rev >= 10 && hasSevereWebBottleneck) {
    return 'platform_3k';
  }
  if (rev >= 15 || (rev >= 10 && ['unoptimized', 'healthy'].includes(webStatus))) {
    return 'retainer_2500';
  }
  return 'pilot_500';
}

function normalizeCandidateDiagnosticFields(rec, raw = {}) {
  if (!rec) return null;

  const placeId = String(rec.place_id ?? raw.place_id ?? raw.placeId ?? '').trim() || null;
  const cid = String(rec.cid ?? raw.cid ?? '').trim() || null;

  // Deterministic doc_number for Google Maps records without an explicit doc_number
  const callerDocNumber = String(raw.doc_number ?? raw.docNumber ?? '').trim().toUpperCase();
  let docNumber = callerDocNumber || rec.doc_number;
  if (placeId && (!callerDocNumber || docNumber.startsWith('GBP_'))) {
    const cleanPlace = placeId.replace(/[^a-zA-Z0-9]/g, '').slice(-14).toUpperCase();
    docNumber = `MAP_${cleanPlace || Date.now().toString(36).toUpperCase()}`;
  }

  const gbpRankRaw = rec.gbp_rank ?? raw.gbp_rank ?? raw.gbpRank;
  const gbpRank = (gbpRankRaw !== undefined && gbpRankRaw !== null && gbpRankRaw !== '' && Number.isFinite(Number(gbpRankRaw)))
    ? Math.round(Number(gbpRankRaw))
    : null;

  const reviewCountRaw = rec.review_count ?? raw.review_count ?? raw.reviewCount;
  const reviewCount = (reviewCountRaw !== undefined && reviewCountRaw !== null && reviewCountRaw !== '' && Number.isFinite(Number(reviewCountRaw)))
    ? Math.round(Number(reviewCountRaw))
    : null;

  const ratingRaw = rec.rating ?? raw.rating;
  const rating = (ratingRaw !== undefined && ratingRaw !== null && ratingRaw !== '' && Number.isFinite(Number(ratingRaw)))
    ? Math.round(Number(ratingRaw) * 100) / 100
    : null;

  const gbpCategory = String(rec.gbp_category ?? raw.gbp_category ?? raw.gbpCategory ?? '').trim() || null;

  const rawTopComp = rec.top_competitors ?? raw.top_competitors ?? raw.topCompetitors;
  let topCompetitors = '[]';
  if (Array.isArray(rawTopComp)) {
    topCompetitors = JSON.stringify(rawTopComp);
  } else if (typeof rawTopComp === 'string' && rawTopComp.trim()) {
    try {
      const parsedComp = JSON.parse(rawTopComp.trim());
      topCompetitors = Array.isArray(parsedComp) ? JSON.stringify(parsedComp) : '[]';
    } catch {
      topCompetitors = '[]';
    }
  }

  const lcpRaw = rec.lcp_ms ?? raw.lcp_ms ?? raw.lcpMs;
  const lcpMs = (lcpRaw !== undefined && lcpRaw !== null && lcpRaw !== '' && Number.isFinite(Number(lcpRaw)))
    ? Math.round(Number(lcpRaw))
    : null;

  const perfRaw = rec.performance_score ?? raw.performance_score ?? raw.performanceScore;
  const performanceScore = (perfRaw !== undefined && perfRaw !== null && perfRaw !== '' && Number.isFinite(Number(perfRaw)))
    ? Math.round(Number(perfRaw))
    : null;

  const hasSchemaRaw = rec.has_schema ?? raw.has_schema ?? raw.hasSchema;
  const hasSchema = hasSchemaRaw === true || hasSchemaRaw === 1 || hasSchemaRaw === '1' ? 1 : 0;

  const hasSslRaw = rec.has_ssl ?? raw.has_ssl ?? raw.hasSsl;
  const hasSsl = hasSslRaw === true || hasSslRaw === 1 || hasSslRaw === '1'
    ? 1
    : (hasSslRaw === false || hasSslRaw === 0 || hasSslRaw === '0' ? 0 : (rec.website ? 1 : 0));

  const rawWebStatus = String(rec.website_status ?? raw.website_status ?? raw.websiteStatus ?? '').trim();
  const websiteStatus = VALID_WEBSITE_STATUSES.has(rawWebStatus) ? rawWebStatus : null;

  const scored = scoreAndClassifyCandidate({
    ...rec,
    gbp_rank: gbpRank,
    review_count: reviewCount,
    rating,
    gbp_category: gbpCategory,
    top_competitors: topCompetitors,
    lcp_ms: lcpMs,
    performance_score: performanceScore,
    has_schema: hasSchema,
    has_ssl: hasSsl,
    website_status: websiteStatus,
    pain_summary: raw.pain_summary ?? raw.painSummary ?? null
  });

  const explicitTier = String(raw.recommended_tier ?? raw.recommendedTier ?? '').trim();
  const recommendedTier = VALID_TIERS.has(explicitTier)
    ? explicitTier
    : (VALID_TIERS.has(scored.recommended_tier) ? scored.recommended_tier : computeFallbackTier({ ...rec, review_count: reviewCount, website_status: scored.website_status, lcp_ms: scored.lcp_ms }));

  const explicitPain = String(raw.pain_summary ?? raw.painSummary ?? '').trim();
  const painSummary = explicitPain || scored.pain_summary;

  const outreachStatus = rec.outreach_status || 'uncontacted';
  const cadenceStepRaw = raw.cadence_step ?? raw.cadenceStep ?? rec.cadence_step;
  let cadenceStep = 0;
  if (cadenceStepRaw !== undefined && cadenceStepRaw !== null && cadenceStepRaw !== '' && Number.isFinite(Number(cadenceStepRaw))) {
    cadenceStep = Math.round(Number(cadenceStepRaw));
  }
  if (cadenceStep === 0 && ['in_cadence', 'emailed', 'promoted'].includes(outreachStatus)) {
    cadenceStep = 1;
  }

  const nextActionAt = (rec.next_action_at ?? raw.next_action_at ?? raw.nextActionAt) || null;
  const rawLastChannel = String(rec.last_channel ?? raw.last_channel ?? raw.lastChannel ?? '').trim();
  const lastChannel = VALID_CHANNELS.has(rawLastChannel) ? rawLastChannel : null;

  return {
    ...rec,
    id: placeId && (!raw.id && rec.id.startsWith('gbp_'))
      ? `map_${docNumber.toLowerCase().replace(/[^a-z0-9]/g, '')}`
      : rec.id,
    doc_number: docNumber,
    place_id: placeId,
    cid,
    gbp_rank: gbpRank,
    review_count: reviewCount,
    rating,
    gbp_category: gbpCategory,
    top_competitors: topCompetitors,
    lcp_ms: scored.lcp_ms,
    performance_score: scored.performance_score,
    has_schema: scored.has_schema,
    has_ssl: scored.has_ssl,
    website_status: scored.website_status,
    recommended_tier: recommendedTier,
    pain_summary: painSummary,
    score: typeof raw.score === 'number' && Number.isFinite(raw.score) ? Math.round(raw.score) : scored.score,
    cadence_step: cadenceStep,
    next_action_at: nextActionAt,
    last_channel: lastChannel
  };
}

/**
 * Shared parameterized WHERE clause builder for outreach candidate queries & CSV exports.
 * Delegates search, niche, city, contactFilter, and recommendedTier to buildOutreachWhereClause
 * and applies exact status, website_status, and cadence state-machine predicates without duplication.
 */
export function buildDiagnosticWhereClause(filters = {}) {
  const {
    search = '',
    status = 'active',
    niche = 'all',
    city = 'all',
    contactFilter = 'all',
    tier = 'all',
    websiteStatus = 'all',
    cadence = 'all'
  } = filters;

  const base = buildOutreachWhereClause({
    search,
    status: 'all',
    niche,
    city,
    contactFilter,
    recommendedTier: tier,
    websiteStatus: 'all',
    cadenceFilter: 'all',
    dueFollowup: 'all'
  });

  const extraConditions = [];
  const extraParams = [];

  if (status === 'active') {
    extraConditions.push("outreach_status != 'dismissed'");
  } else if (status === 'in_cadence') {
    extraConditions.push("((outreach_status = 'in_cadence' OR COALESCE(cadence_step, 0) >= 1) AND outreach_status != 'dismissed')");
  } else if (status && status !== 'all') {
    extraConditions.push('outreach_status = ?');
    extraParams.push(status);
  }

  if (websiteStatus && websiteStatus !== 'all') {
    if (websiteStatus === 'needs_fix') {
      extraConditions.push("(website_status IN ('missing', 'broken', 'slow', 'unoptimized') OR website IS NULL OR website = '')");
    } else {
      extraConditions.push('website_status = ?');
      extraParams.push(websiteStatus);
    }
  }

  if (cadence && cadence !== 'all') {
    if (cadence === 'due_today') {
      extraConditions.push("(outreach_status != 'dismissed' AND COALESCE(cadence_step, 0) < 4 AND next_action_at IS NOT NULL AND datetime(next_action_at) <= datetime('now'))");
    } else if (cadence === 'step_0') {
      extraConditions.push('COALESCE(cadence_step, 0) = 0');
    } else if (cadence === 'step_1') {
      extraConditions.push('cadence_step = 1');
    } else if (cadence === 'step_2') {
      extraConditions.push('cadence_step = 2');
    } else if (cadence === 'step_3') {
      extraConditions.push('cadence_step = 3');
    } else if (cadence === 'step_4') {
      extraConditions.push('cadence_step >= 4');
    } else if (cadence === 'in_cadence') {
      extraConditions.push("((outreach_status = 'in_cadence' OR COALESCE(cadence_step, 0) BETWEEN 1 AND 3) AND outreach_status != 'dismissed')");
    }
  }

  if (extraConditions.length === 0) {
    return base;
  }

  const sql = base.whereClause || '';
  const combinedWhere = sql
    ? `${sql} AND ${extraConditions.join(' AND ')}`
    : `WHERE ${extraConditions.join(' AND ')}`;

  return {
    whereClause: combinedWhere,
    params: [...base.params, ...extraParams]
  };
}

function buildEmptyOutreachResponse(limit, offset, extra = {}) {
  return {
    candidates: [],
    filteredTotal: 0,
    limit,
    offset,
    counts: {
      total: 0,
      uncontacted: 0,
      in_cadence: 0,
      has_email: 0,
      has_phone: 0,
      high_priority: 0,
      emailed: 0,
      dismissed: 0,
      platform_3k: 0,
      retainer_2500: 0,
      due_followup: 0,
      bleeders: 0
    },
    facets: {
      cities: [],
      niches: []
    },
    templates: OUTREACH_TEMPLATES,
    ...extra
  };
}

/**
 * Safely inspect an existing outreach_candidates table via PRAGMA table_info and add any missing
 * 0005_maps_diagnostic_pivot.sql columns and indexes. Returns false if the table does not exist yet.
 */
export async function upgradeExistingOutreachTable(db) {
  if (!db) return false;
  try {
    const pragmaRes = await db.prepare('PRAGMA table_info(outreach_candidates)').all();
    const existingRows = Array.isArray(pragmaRes?.results) ? pragmaRes.results : [];
    if (existingRows.length === 0) {
      return false;
    }

    const existingNames = new Set(existingRows.map(r => String(r.name || '').toLowerCase()));
    for (const [colName, colDef] of DIAGNOSTIC_SCHEMA_COLUMNS) {
      if (!existingNames.has(colName.toLowerCase())) {
        await db.prepare(`ALTER TABLE outreach_candidates ADD COLUMN ${colName} ${colDef}`).run();
      }
    }

    const indexStatements = [
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_outreach_place_id ON outreach_candidates(place_id)',
      'CREATE INDEX IF NOT EXISTS idx_outreach_tier_score ON outreach_candidates(outreach_status, recommended_tier, score DESC)',
      'CREATE INDEX IF NOT EXISTS idx_outreach_rank_reviews ON outreach_candidates(gbp_rank, review_count DESC)',
      'CREATE INDEX IF NOT EXISTS idx_outreach_next_action ON outreach_candidates(next_action_at ASC)'
    ];
    for (const idxSql of indexStatements) {
      await db.prepare(idxSql).run();
    }
    return true;
  } catch (_) {
    return false;
  }
}

export async function ensureOutreachSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS outreach_candidates (
      id TEXT PRIMARY KEY,
      doc_number TEXT UNIQUE,
      business_name TEXT NOT NULL,
      business_name_clean TEXT NOT NULL,
      entity_type TEXT DEFAULT 'Google Maps GBP',
      filing_date TEXT,
      founder_name TEXT NOT NULL,
      founder_first_name TEXT,
      founder_last_name TEXT,
      founder_title TEXT,
      secondary_officers TEXT,
      registered_agent TEXT,
      principal_address TEXT,
      mailing_address TEXT,
      city TEXT,
      state TEXT DEFAULT 'FL',
      zip TEXT,
      county TEXT,
      niche TEXT DEFAULT 'Local Business',
      score INTEGER DEFAULT 50,
      email TEXT,
      phone TEXT,
      website TEXT,
      enrichment_status TEXT DEFAULT 'unattempted',
      enrichment_source TEXT,
      enrichment_confidence INTEGER,
      enrichment_meta TEXT,
      enriched_at DATETIME,
      outreach_status TEXT DEFAULT 'uncontacted',
      emailed_at DATETIME,
      last_subject TEXT,
      lead_id TEXT REFERENCES leads(id) ON DELETE SET NULL,
      notes TEXT,
      place_id TEXT,
      cid TEXT,
      gbp_rank INTEGER,
      review_count INTEGER,
      rating REAL,
      gbp_category TEXT,
      top_competitors TEXT,
      lcp_ms INTEGER,
      performance_score INTEGER,
      has_schema INTEGER DEFAULT 0,
      has_ssl INTEGER DEFAULT 0,
      website_status TEXT,
      recommended_tier TEXT,
      pain_summary TEXT,
      cadence_step INTEGER DEFAULT 0,
      next_action_at DATETIME,
      last_channel TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();

  await upgradeExistingOutreachTable(db);
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

export function normalizeCadenceQueryParam(cadenceRaw, dueFollowupRaw) {
  const rawCadence = (cadenceRaw || '').trim();
  if (rawCadence) return rawCadence;
  const rawDue = (dueFollowupRaw || '').trim().toLowerCase();
  if (!rawDue || rawDue === 'false' || rawDue === '0') return 'all';
  if (rawDue === 'true' || rawDue === '1') return 'due_today';
  return (dueFollowupRaw || '').trim() || 'all';
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = await checkAuth(request, env);
  if (!auth.authenticated) {
    return authErrorResponse(request, auth);
  }

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const search = (url.searchParams.get('q') || '').trim();
  const status = (url.searchParams.get('status') || 'active').trim();
  const niche = (url.searchParams.get('niche') || 'all').trim();
  const city = (url.searchParams.get('city') || 'all').trim();
  const contactFilter = (url.searchParams.get('contact') || 'all').trim();
  const tier = (url.searchParams.get('tier') || url.searchParams.get('recommended_tier') || 'all').trim();
  const websiteStatus = (url.searchParams.get('website_status') || 'all').trim();
  const cadence = normalizeCadenceQueryParam(
    url.searchParams.get('cadence'),
    url.searchParams.get('due_followup')
  );

  if (!VALID_STATUS_FILTERS.has(status)) {
    return json(request, { error: `Invalid outreach status filter "${status}".` }, 400);
  }
  if (!VALID_CONTACT_FILTERS.has(contactFilter)) {
    return json(request, { error: `Invalid outreach contact filter "${contactFilter}".` }, 400);
  }
  if (!VALID_TIER_FILTERS.has(tier)) {
    return json(request, { error: `Invalid outreach tier filter "${tier}".` }, 400);
  }
  if (!VALID_WEBSITE_STATUS_FILTERS.has(websiteStatus)) {
    return json(request, { error: `Invalid website_status filter "${websiteStatus}".` }, 400);
  }
  if (!VALID_CADENCE_FILTERS.has(cadence)) {
    return json(request, { error: `Invalid outreach cadence filter "${cadence}".` }, 400);
  }

  if (!env.DB) {
    return json(
      request,
      buildEmptyOutreachResponse(limit, offset, {
        error: 'D1 database binding "DB" is not configured.'
      })
    );
  }

  const { whereClause, params } = buildDiagnosticWhereClause({
    search,
    status,
    niche,
    city,
    contactFilter,
    tier,
    websiteStatus,
    cadence
  });

  const executeOutreachQueries = async () => {
    const filteredCountRow = await env.DB.prepare(
      `SELECT COUNT(*) as filtered_total FROM outreach_candidates ${whereClause}`
    ).bind(...params).first();
    const filteredTotal = Number(filteredCountRow?.filtered_total || 0);

    const query = `
      SELECT * FROM outreach_candidates
      ${whereClause}
      ORDER BY
        CASE
          WHEN outreach_status != 'dismissed' AND COALESCE(cadence_step, 0) < 4 AND next_action_at IS NOT NULL AND datetime(next_action_at) <= datetime('now') THEN 0
          WHEN outreach_status = 'uncontacted' THEN 1
          ELSE 2
        END ASC,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END ASC,
        score DESC,
        COALESCE(review_count, 0) DESC,
        filing_date DESC,
        id ASC
      LIMIT ? OFFSET ?
    `;

    const { results: candidates } = await env.DB.prepare(query).bind(...params, limit, offset).all();

    const countQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' THEN 1 ELSE 0 END), 0) as total,
        COALESCE(SUM(CASE WHEN outreach_status = 'uncontacted' THEN 1 ELSE 0 END), 0) as uncontacted_count,
        COALESCE(SUM(CASE WHEN (outreach_status = 'in_cadence' OR COALESCE(cadence_step, 0) >= 1) AND outreach_status != 'dismissed' THEN 1 ELSE 0 END), 0) as in_cadence_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND email IS NOT NULL AND email != '' THEN 1 ELSE 0 END), 0) as has_email_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END), 0) as has_phone_count,
        COALESCE(SUM(CASE WHEN score >= 80 AND outreach_status = 'uncontacted' THEN 1 ELSE 0 END), 0) as high_priority_count,
        COALESCE(SUM(CASE WHEN outreach_status IN ('emailed', 'promoted') THEN 1 ELSE 0 END), 0) as emailed_count,
        COALESCE(SUM(CASE WHEN outreach_status = 'dismissed' THEN 1 ELSE 0 END), 0) as dismissed_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND recommended_tier = 'platform_3k' THEN 1 ELSE 0 END), 0) as platform_3k_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND recommended_tier = 'retainer_2500' THEN 1 ELSE 0 END), 0) as retainer_2500_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND COALESCE(cadence_step, 0) < 4 AND next_action_at IS NOT NULL AND datetime(next_action_at) <= datetime('now') THEN 1 ELSE 0 END), 0) as due_followup_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND gbp_rank BETWEEN 4 AND 30 THEN 1 ELSE 0 END), 0) as bleeders_count
      FROM outreach_candidates
    `;
    const countRow = await env.DB.prepare(countQuery).first();

    const { results: cityRows } = await env.DB.prepare(
      "SELECT DISTINCT city FROM outreach_candidates WHERE city IS NOT NULL AND city != '' AND outreach_status != 'dismissed' ORDER BY city ASC"
    ).all();
    const { results: nicheRows } = await env.DB.prepare(
      "SELECT DISTINCT niche FROM outreach_candidates WHERE niche IS NOT NULL AND niche != '' AND outreach_status != 'dismissed' ORDER BY niche ASC"
    ).all();

    return {
      candidates: candidates || [],
      filteredTotal,
      limit,
      offset,
      counts: {
        total: Number(countRow?.total || 0),
        uncontacted: Number(countRow?.uncontacted_count || 0),
        in_cadence: Number(countRow?.in_cadence_count || 0),
        has_email: Number(countRow?.has_email_count || 0),
        has_phone: Number(countRow?.has_phone_count || 0),
        high_priority: Number(countRow?.high_priority_count || 0),
        emailed: Number(countRow?.emailed_count || 0),
        dismissed: Number(countRow?.dismissed_count || 0),
        platform_3k: Number(countRow?.platform_3k_count || 0),
        retainer_2500: Number(countRow?.retainer_2500_count || 0),
        due_followup: Number(countRow?.due_followup_count || 0),
        bleeders: Number(countRow?.bleeders_count || 0)
      },
      facets: {
        cities: (cityRows || []).map(r => r.city),
        niches: (nicheRows || []).map(r => r.niche)
      },
      templates: OUTREACH_TEMPLATES
    };
  };

  try {
    const payload = await executeOutreachQueries();
    return json(request, payload);
  } catch (err) {
    const errMsg = String(err?.message || err);
    if (/no such table:\s*outreach_candidates/i.test(errMsg)) {
      return json(request, buildEmptyOutreachResponse(limit, offset));
    }
    if (/no such column/i.test(errMsg)) {
      try {
        const upgraded = await upgradeExistingOutreachTable(env.DB);
        if (upgraded) {
          const retryPayload = await executeOutreachQueries();
          return json(request, retryPayload);
        }
      } catch (retryErr) {
        console.error('Error retrying outreach query after schema upgrade:', retryErr);
      }
    }
    console.error('Error fetching outreach candidates:', err);
    return json(request, { error: 'Failed to fetch outreach candidates.' }, 500);
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
    const requireSouthFlorida = body.require_south_fl !== false;
    const excludeShells = body.exclude_shells !== false;
    const autoEnrichTop = body.auto_enrich_top !== false; // Smart Hybrid default: true
    const isMapsDiscovery = body.action === 'discover_maps' || body.discover_maps === true;

    let rawRecords = [];
    let auditedCount = 0;

    if (isMapsDiscovery) {
      const discoveryFieldError = validateDiscoveryBodyFields(body);
      if (discoveryFieldError) {
        return json(request, { error: discoveryFieldError }, 400);
      }

      const maxAudit = Math.min(
        Math.max(parseInt(body.max_audit ?? body.maxAudit ?? 10, 10) || 10, 0),
        MAX_AUDIT_SUBREQUESTS
      );

      const minRank = body.min_rank ?? body.rank_min ?? body.minRank ?? body.rankMin ?? 4;
      const maxRank = body.max_rank ?? body.rank_max ?? body.maxRank ?? body.rankMax ?? 30;
      const minReviews = body.min_reviews ?? body.minReviews ?? 5;
      const maxReviews = body.max_reviews ?? body.maxReviews ?? 120;

      const discoveryResult = await discoverMapsBleedersViaDataForSeo({
        niche: body.niche || 'Roofing',
        keyword: body.keyword || body.query || undefined,
        city: body.city || 'Fort Lauderdale',
        county: body.county || undefined,
        state: body.state || 'FL',
        minRank,
        maxRank,
        rankMin: minRank,
        rankMax: maxRank,
        minReviews,
        maxReviews,
        depth: body.depth || body.limit || 40,
        auditWebsites: false,
        auditTopN: 0,
        useFixture: Boolean(body.use_fixture || body.useFixture),
        fixtureItems: Array.isArray(body.fixture_items) ? body.fixture_items : undefined,
        env
      }, env);

      const discoveredItems = Array.isArray(discoveryResult)
        ? discoveryResult
        : (Array.isArray(discoveryResult?.candidates)
          ? discoveryResult.candidates
          : (Array.isArray(discoveryResult?.items) ? discoveryResult.items : []));

      for (const rawItem of discoveredItems) {
        let itemToBuild = { ...rawItem };
        if (!itemToBuild.founder_name && !itemToBuild.founderName && !itemToBuild.name) {
          itemToBuild.founder_name = 'Owner';
        }

        // Run website technical audit exclusively in this loop up to maxAudit
        if (
          body.audit_websites !== false &&
          auditedCount < maxAudit &&
          itemToBuild.website
        ) {
          try {
            const audit = await auditCandidateWebsite(itemToBuild.website, {
              timeoutMs: 5500,
              psiApiKey: env?.PSI_API_KEY || env?.PAGESPEED_API_KEY || null
            });
            if (audit && typeof audit === 'object') {
              itemToBuild = {
                ...itemToBuild,
                lcp_ms: audit.lcp_ms ?? audit.lcpMs ?? null,
                performance_score: audit.performance_score ?? audit.performanceScore ?? null,
                has_schema: audit.has_schema ?? audit.hasSchema ?? 0,
                has_ssl: audit.has_ssl ?? audit.hasSsl ?? (itemToBuild.website ? 1 : 0),
                website_status: audit.website_status ?? audit.websiteStatus ?? 'unoptimized',
                pain_summary: null,
                recommended_tier: null,
                score: undefined
              };
              auditedCount++;
            }
          } catch (auditErr) {
            console.warn('Website audit skipped for', itemToBuild.website, auditErr.message);
          }
        }

        const built = buildCandidateRecord(itemToBuild, {
          requireSouthFlorida: body.require_south_fl === true,
          excludeShells
        });
        const normalized = normalizeCandidateDiagnosticFields(built, itemToBuild);
        if (normalized) rawRecords.push(normalized);
      }
    } else if (typeof body.raw_text === 'string' && body.raw_text.trim()) {
      const parsed = parseOutreachBulkText(body.raw_text, {
        requireSouthFlorida,
        excludeShells
      });
      rawRecords = parsed.map(r => normalizeCandidateDiagnosticFields(r, r)).filter(Boolean);
    } else if (Array.isArray(body.candidates)) {
      if (body.candidates.length > MAX_IMPORT_RECORDS) {
        return json(request, {
          error: `Batch limit exceeded (${body.candidates.length} items). Maximum ${MAX_IMPORT_RECORDS} candidates per request.`
        }, 400);
      }
      for (const item of body.candidates) {
        const validationError = validateCandidateInputObject(item);
        if (validationError) {
          return json(request, { error: validationError }, 400);
        }
        const hasMapsIdentity = Boolean(item.place_id || item.placeId);
        const normalizedItem = {
          ...item,
          ...(item.outreach_status ? { outreach_status: item.outreach_status.trim() } : {}),
          ...(hasMapsIdentity && !item.founder_name && !item.founderName && !item.officer_name && !item.name
            ? { founder_name: 'Owner' }
            : {})
        };
        const rec = buildCandidateRecord(normalizedItem, { requireSouthFlorida, excludeShells });
        const normalizedRec = normalizeCandidateDiagnosticFields(rec, normalizedItem);
        if (normalizedRec) rawRecords.push(normalizedRec);
      }
    } else if (body.business_name !== undefined || body.businessName !== undefined || body.company !== undefined) {
      const validationError = validateCandidateInputObject(body);
      if (validationError) {
        return json(request, { error: validationError }, 400);
      }
      const hasMapsIdentity = Boolean(body.place_id || body.placeId);
      const normalizedBody = {
        ...body,
        ...(body.outreach_status ? { outreach_status: body.outreach_status.trim() } : {}),
        ...(hasMapsIdentity && !body.founder_name && !body.founderName && !body.officer_name && !body.name
          ? { founder_name: 'Owner' }
          : {})
      };
      // Single manual candidate creation — allow any city if explicitly added
      const rec = buildCandidateRecord(normalizedBody, { requireSouthFlorida: false, excludeShells: false });
      const normalizedRec = normalizeCandidateDiagnosticFields(rec, normalizedBody);
      if (!normalizedRec) {
        return json(request, { error: 'Business name and founder name are required.' }, 400);
      }
      rawRecords.push(normalizedRec);
    } else {
      return json(request, { error: 'Provide raw_text, candidates[], a single candidate object, or action: "discover_maps".' }, 400);
    }

    if (rawRecords.length > MAX_IMPORT_RECORDS) {
      return json(request, {
        error: `Batch limit exceeded (${rawRecords.length} parsed candidates). Maximum ${MAX_IMPORT_RECORDS} candidates per request.`
      }, 400);
    }

    // Deduplicate within the incoming payload by doc_number AND non-null place_id so chunk counts remain exact
    const dedupedByDoc = new Map();
    const docByPlaceId = new Map();

    for (const rec of rawRecords) {
      if (rec.place_id && docByPlaceId.has(rec.place_id)) {
        rec.doc_number = docByPlaceId.get(rec.place_id);
      }
      const prev = dedupedByDoc.get(rec.doc_number);
      if (!prev) {
        dedupedByDoc.set(rec.doc_number, rec);
        if (rec.place_id) {
          docByPlaceId.set(rec.place_id, rec.doc_number);
        }
      } else {
        const mergedPlaceId = rec.place_id || prev.place_id;
        if (mergedPlaceId && !docByPlaceId.has(mergedPlaceId)) {
          docByPlaceId.set(mergedPlaceId, prev.doc_number);
        }
        dedupedByDoc.set(prev.doc_number, {
          ...prev,
          ...rec,
          id: prev.id,
          doc_number: prev.doc_number,
          email: rec.email || prev.email,
          phone: rec.phone || prev.phone,
          website: rec.website || prev.website,
          notes: rec.notes || prev.notes,
          place_id: mergedPlaceId,
          cid: rec.cid || prev.cid,
          gbp_rank: rec.gbp_rank ?? prev.gbp_rank,
          review_count: rec.review_count ?? prev.review_count,
          rating: rec.rating ?? prev.rating,
          gbp_category: rec.gbp_category || prev.gbp_category,
          top_competitors: (rec.top_competitors && rec.top_competitors !== '[]') ? rec.top_competitors : prev.top_competitors,
          lcp_ms: rec.lcp_ms ?? prev.lcp_ms,
          performance_score: rec.performance_score ?? prev.performance_score,
          has_schema: rec.has_schema || prev.has_schema,
          has_ssl: rec.has_ssl || prev.has_ssl,
          website_status: rec.website_status || prev.website_status,
          recommended_tier: rec.recommended_tier || prev.recommended_tier,
          pain_summary: rec.pain_summary || prev.pain_summary
        });
      }
    }
    const recordsToUpsert = [...dedupedByDoc.values()];

    await ensureOutreachSchema(env.DB);

    let inserted = 0;
    let updated = 0;
    let autoEnriched = 0;
    const insertedRecords = [];

    const upsertSql = `
      INSERT INTO outreach_candidates (
        id, doc_number, business_name, business_name_clean, entity_type, filing_date,
        founder_name, founder_first_name, founder_last_name, founder_title, secondary_officers,
        registered_agent, principal_address, mailing_address, city, state, zip, county,
        niche, score, email, phone, website, enrichment_status, enrichment_source,
        enrichment_confidence, enrichment_meta, outreach_status, notes,
        place_id, cid, gbp_rank, review_count, rating, gbp_category, top_competitors,
        lcp_ms, performance_score, has_schema, has_ssl, website_status,
        recommended_tier, pain_summary, cadence_step, next_action_at, last_channel,
        created_at, updated_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
      ON CONFLICT(doc_number) DO UPDATE SET
        email = COALESCE(NULLIF(excluded.email, ''), outreach_candidates.email),
        phone = COALESCE(NULLIF(excluded.phone, ''), outreach_candidates.phone),
        website = COALESCE(NULLIF(excluded.website, ''), outreach_candidates.website),
        city = COALESCE(NULLIF(excluded.city, ''), outreach_candidates.city),
        county = COALESCE(NULLIF(excluded.county, ''), outreach_candidates.county),
        score = COALESCE(excluded.score, outreach_candidates.score),
        enrichment_status = CASE
          WHEN excluded.enrichment_status != 'unattempted' THEN excluded.enrichment_status
          ELSE outreach_candidates.enrichment_status
        END,
        enrichment_source = COALESCE(NULLIF(excluded.enrichment_source, ''), outreach_candidates.enrichment_source),
        enrichment_confidence = COALESCE(excluded.enrichment_confidence, outreach_candidates.enrichment_confidence),
        enrichment_meta = CASE
          WHEN excluded.enrichment_meta IS NOT NULL AND excluded.enrichment_meta != '{}' THEN excluded.enrichment_meta
          ELSE outreach_candidates.enrichment_meta
        END,
        outreach_status = CASE
          WHEN outreach_candidates.outreach_status IN ('emailed', 'promoted', 'dismissed') THEN outreach_candidates.outreach_status
          ELSE COALESCE(NULLIF(outreach_candidates.outreach_status, ''), NULLIF(excluded.outreach_status, ''), 'uncontacted')
        END,
        lead_id = COALESCE(outreach_candidates.lead_id, excluded.lead_id),
        notes = COALESCE(NULLIF(outreach_candidates.notes, ''), NULLIF(excluded.notes, '')),
        place_id = COALESCE(NULLIF(excluded.place_id, ''), outreach_candidates.place_id),
        cid = COALESCE(NULLIF(excluded.cid, ''), outreach_candidates.cid),
        gbp_rank = COALESCE(excluded.gbp_rank, outreach_candidates.gbp_rank),
        review_count = COALESCE(excluded.review_count, outreach_candidates.review_count),
        rating = COALESCE(excluded.rating, outreach_candidates.rating),
        gbp_category = COALESCE(NULLIF(excluded.gbp_category, ''), outreach_candidates.gbp_category),
        top_competitors = CASE
          WHEN excluded.top_competitors IS NOT NULL AND excluded.top_competitors != '' AND excluded.top_competitors != '[]' THEN excluded.top_competitors
          ELSE outreach_candidates.top_competitors
        END,
        lcp_ms = COALESCE(excluded.lcp_ms, outreach_candidates.lcp_ms),
        performance_score = COALESCE(excluded.performance_score, outreach_candidates.performance_score),
        has_schema = COALESCE(excluded.has_schema, outreach_candidates.has_schema),
        has_ssl = COALESCE(excluded.has_ssl, outreach_candidates.has_ssl),
        website_status = COALESCE(NULLIF(excluded.website_status, ''), outreach_candidates.website_status),
        recommended_tier = COALESCE(NULLIF(excluded.recommended_tier, ''), outreach_candidates.recommended_tier),
        pain_summary = COALESCE(NULLIF(excluded.pain_summary, ''), outreach_candidates.pain_summary),
        cadence_step = CASE
          WHEN COALESCE(excluded.cadence_step, 0) > COALESCE(outreach_candidates.cadence_step, 0) THEN excluded.cadence_step
          ELSE COALESCE(outreach_candidates.cadence_step, excluded.cadence_step, 0)
        END,
        next_action_at = COALESCE(outreach_candidates.next_action_at, excluded.next_action_at),
        last_channel = COALESCE(NULLIF(outreach_candidates.last_channel, ''), NULLIF(excluded.last_channel, '')),
        updated_at = CURRENT_TIMESTAMP
    `;

    for (let offsetIdx = 0; offsetIdx < recordsToUpsert.length; offsetIdx += BATCH_CHUNK_SIZE) {
      const chunk = recordsToUpsert.slice(offsetIdx, offsetIdx + BATCH_CHUNK_SIZE);
      const docPlaceholders = chunk.map(() => '?').join(', ');
      const chunkDocNumbers = chunk.map(r => r.doc_number);
      const chunkPlaceIds = chunk.map(r => r.place_id).filter(Boolean);

      let existingRows = [];
      if (chunkPlaceIds.length > 0) {
        const placePlaceholders = chunkPlaceIds.map(() => '?').join(', ');
        const res = await env.DB.prepare(
          `SELECT id, doc_number, place_id FROM outreach_candidates WHERE doc_number IN (${docPlaceholders}) OR place_id IN (${placePlaceholders})`
        ).bind(...chunkDocNumbers, ...chunkPlaceIds).all();
        existingRows = res?.results || [];
      } else {
        const res = await env.DB.prepare(
          `SELECT id, doc_number, place_id FROM outreach_candidates WHERE doc_number IN (${docPlaceholders})`
        ).bind(...chunkDocNumbers).all();
        existingRows = res?.results || [];
      }

      const existingByDoc = new Map();
      const existingByPlaceId = new Map();
      for (const row of existingRows) {
        if (row.doc_number) existingByDoc.set(row.doc_number, row);
        if (row.place_id) existingByPlaceId.set(row.place_id, row);
      }

      const statements = chunk.map((rec) => {
        const matchedRow = existingByDoc.get(rec.doc_number) || (rec.place_id ? existingByPlaceId.get(rec.place_id) : null);
        if (matchedRow) {
          if (matchedRow.doc_number) rec.doc_number = matchedRow.doc_number;
          if (matchedRow.id) rec.id = matchedRow.id;
          updated++;
        } else {
          inserted++;
          insertedRecords.push(rec);
        }
        return env.DB.prepare(upsertSql).bind(
          rec.id, rec.doc_number, rec.business_name, rec.business_name_clean, rec.entity_type, rec.filing_date,
          rec.founder_name, rec.founder_first_name, rec.founder_last_name, rec.founder_title, rec.secondary_officers,
          rec.registered_agent, rec.principal_address, rec.mailing_address, rec.city, rec.state, rec.zip, rec.county,
          rec.niche, rec.score, rec.email, rec.phone, rec.website, rec.enrichment_status, rec.enrichment_source,
          rec.enrichment_confidence, rec.enrichment_meta, rec.outreach_status, rec.notes,
          rec.place_id, rec.cid, rec.gbp_rank, rec.review_count, rec.rating, rec.gbp_category, rec.top_competitors,
          rec.lcp_ms, rec.performance_score, rec.has_schema, rec.has_ssl, rec.website_status,
          rec.recommended_tier, rec.pain_summary, rec.cadence_step, rec.next_action_at, rec.last_channel
        );
      });

      if (typeof env.DB.batch === 'function') {
        await env.DB.batch(statements);
      } else {
        for (const stmt of statements) {
          await stmt.run();
        }
      }
    }

    // Smart Hybrid Enrichment: Auto-enrich top-scoring niches (score >= 80) up to 5 per synchronous batch
    // so Worker subrequest limits are respected; remaining can be enriched on-click or via batch button.
    const hasAnyEnrichmentProvider = Boolean(
      env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API ||
      env.APOLLO_API_KEY || env.APOLLO_API ||
      env.PDL_API_KEY || env.PDL_API ||
      (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
    );

    if (autoEnrichTop && hasAnyEnrichmentProvider && insertedRecords.length > 0) {
      const topCandidates = insertedRecords
        .filter(r => r.score >= 80 && !r.email)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      for (const candidate of topCandidates) {
        try {
          const enr = await enrichOutreachCandidate(candidate, env);
          await env.DB.prepare(`
            UPDATE outreach_candidates
            SET email = COALESCE(?, email),
                phone = COALESCE(?, phone),
                website = COALESCE(?, website),
                enrichment_status = ?,
                enrichment_source = ?,
                enrichment_confidence = ?,
                enrichment_meta = ?,
                enriched_at = CURRENT_TIMESTAMP,
                updated_at = CURRENT_TIMESTAMP
            WHERE id = ?
          `).bind(
            enr.email, enr.phone, enr.website,
            enr.status, enr.source, enr.confidence, JSON.stringify(enr.meta),
            candidate.id
          ).run();
          if (enr.email || enr.phone) autoEnriched++;
        } catch (e) {
          console.warn('Auto-enrichment skipped for', candidate.id, e.message);
        }
      }
    }

    return json(request, {
      success: true,
      ...(isMapsDiscovery ? { mode: 'discover_maps', audited: auditedCount } : {}),
      parsed: recordsToUpsert.length,
      inserted,
      updated,
      auto_enriched: autoEnriched
    }, 201);
  } catch (err) {
    console.error('Error importing outreach candidates:', err);
    return json(request, { error: 'Failed to import outreach candidates.' }, 500);
  }
}
