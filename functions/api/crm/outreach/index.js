/**
 * Sunbiz Outreach Candidates API
 * GET  /api/crm/outreach - Fetch outreach candidates, filters, KPI counts, and CRO templates
 * POST /api/crm/outreach - Add single candidate or bulk import Sunbiz .txt / .csv / JSON records
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../auth.js';
import {
  buildCandidateRecord,
  parseSunbizBulkText,
  enrichOutreachCandidate,
  buildOutreachWhereClause,
  OUTREACH_TEMPLATES
} from '../_sunbiz.js';

const ALLOWED_METHODS = 'GET, POST, OPTIONS';
const MAX_IMPORT_RECORDS = 2000;
const BATCH_CHUNK_SIZE = 50;
const VALID_OUTREACH_STATUSES = new Set(['uncontacted', 'emailed', 'promoted', 'dismissed']);
const VALID_CONTACT_FILTERS = new Set(['all', 'has_email', 'has_phone', 'has_any', 'needs_enrichment']);

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

function validateCandidateInputObject(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) {
    return 'Each candidate must be a JSON object.';
  }
  const scalarFields = [
    'doc_number', 'docNumber', 'business_name', 'businessName', 'company',
    'founder_name', 'founderName', 'officer_name', 'name', 'founder_title',
    'city', 'state', 'zip', 'niche', 'email', 'phone', 'website', 'company_domain',
    'outreach_status', 'notes'
  ];
  for (const f of scalarFields) {
    if (item[f] !== undefined && item[f] !== null && typeof item[f] === 'object') {
      return `Invalid non-primitive value for field "${f}".`;
    }
  }
  if (item.outreach_status !== undefined && item.outreach_status !== null) {
    if (typeof item.outreach_status !== 'string' || !VALID_OUTREACH_STATUSES.has(item.outreach_status.trim())) {
      return `Invalid outreach_status. Must be one of: ${[...VALID_OUTREACH_STATUSES].join(', ')}.`;
    }
  }
  return null;
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
      has_email: 0,
      has_phone: 0,
      high_priority: 0,
      emailed: 0,
      dismissed: 0
    },
    facets: {
      cities: [],
      niches: []
    },
    templates: OUTREACH_TEMPLATES,
    ...extra
  };
}

export async function ensureOutreachSchema(db) {
  await db.prepare(`
    CREATE TABLE IF NOT EXISTS outreach_candidates (
      id TEXT PRIMARY KEY,
      doc_number TEXT UNIQUE,
      business_name TEXT NOT NULL,
      business_name_clean TEXT NOT NULL,
      entity_type TEXT DEFAULT 'FL LLC',
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
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
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

  const url = new URL(request.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 1), 500);
  const offset = Math.max(parseInt(url.searchParams.get('offset') || '0', 10) || 0, 0);
  const search = (url.searchParams.get('q') || '').trim();
  const status = (url.searchParams.get('status') || 'active').trim();
  const niche = (url.searchParams.get('niche') || 'all').trim();
  const city = (url.searchParams.get('city') || 'all').trim();
  const contactFilter = (url.searchParams.get('contact') || 'all').trim();

  if (status !== 'active' && status !== 'all' && !VALID_OUTREACH_STATUSES.has(status)) {
    return json(request, { error: `Invalid outreach status filter "${status}".` }, 400);
  }
  if (!VALID_CONTACT_FILTERS.has(contactFilter)) {
    return json(request, { error: `Invalid outreach contact filter "${contactFilter}".` }, 400);
  }

  if (!env.DB) {
    return json(
      request,
      buildEmptyOutreachResponse(limit, offset, {
        error: 'D1 database binding "DB" is not configured.'
      })
    );
  }

  try {
    const { whereClause, params } = buildOutreachWhereClause({
      search,
      status,
      niche,
      city,
      contactFilter
    });

    const filteredCountRow = await env.DB.prepare(
      `SELECT COUNT(*) as filtered_total FROM outreach_candidates ${whereClause}`
    ).bind(...params).first();
    const filteredTotal = Number(filteredCountRow?.filtered_total || 0);

    const query = `
      SELECT * FROM outreach_candidates
      ${whereClause}
      ORDER BY
        CASE WHEN outreach_status = 'uncontacted' THEN 0 ELSE 1 END ASC,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END ASC,
        score DESC,
        filing_date DESC,
        id ASC
      LIMIT ? OFFSET ?
    `;

    const { results: candidates } = await env.DB.prepare(query).bind(...params, limit, offset).all();

    const countQuery = `
      SELECT
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' THEN 1 ELSE 0 END), 0) as total,
        COALESCE(SUM(CASE WHEN outreach_status = 'uncontacted' THEN 1 ELSE 0 END), 0) as uncontacted_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND email IS NOT NULL AND email != '' THEN 1 ELSE 0 END), 0) as has_email_count,
        COALESCE(SUM(CASE WHEN outreach_status != 'dismissed' AND phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END), 0) as has_phone_count,
        COALESCE(SUM(CASE WHEN score >= 80 AND outreach_status = 'uncontacted' THEN 1 ELSE 0 END), 0) as high_priority_count,
        COALESCE(SUM(CASE WHEN outreach_status IN ('emailed', 'promoted') THEN 1 ELSE 0 END), 0) as emailed_count,
        COALESCE(SUM(CASE WHEN outreach_status = 'dismissed' THEN 1 ELSE 0 END), 0) as dismissed_count
      FROM outreach_candidates
    `;
    const countRow = await env.DB.prepare(countQuery).first();

    // Distinct cities & niches for dynamic filter dropdowns
    const { results: cityRows } = await env.DB.prepare(
      "SELECT DISTINCT city FROM outreach_candidates WHERE city IS NOT NULL AND city != '' AND outreach_status != 'dismissed' ORDER BY city ASC"
    ).all();
    const { results: nicheRows } = await env.DB.prepare(
      "SELECT DISTINCT niche FROM outreach_candidates WHERE niche IS NOT NULL AND niche != '' AND outreach_status != 'dismissed' ORDER BY niche ASC"
    ).all();

    return json(request, {
      candidates: candidates || [],
      filteredTotal,
      limit,
      offset,
      counts: {
        total: Number(countRow?.total || 0),
        uncontacted: Number(countRow?.uncontacted_count || 0),
        has_email: Number(countRow?.has_email_count || 0),
        has_phone: Number(countRow?.has_phone_count || 0),
        high_priority: Number(countRow?.high_priority_count || 0),
        emailed: Number(countRow?.emailed_count || 0),
        dismissed: Number(countRow?.dismissed_count || 0)
      },
      facets: {
        cities: (cityRows || []).map(r => r.city),
        niches: (nicheRows || []).map(r => r.niche)
      },
      templates: OUTREACH_TEMPLATES
    });
  } catch (err) {
    if (/no such table:\s*outreach_candidates/i.test(String(err?.message || err))) {
      return json(request, buildEmptyOutreachResponse(limit, offset));
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

    let rawRecords = [];

    if (typeof body.raw_text === 'string' && body.raw_text.trim()) {
      rawRecords = parseSunbizBulkText(body.raw_text, {
        requireSouthFlorida,
        excludeShells
      });
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
        const normalizedItem = item.outreach_status
          ? { ...item, outreach_status: item.outreach_status.trim() }
          : item;
        const rec = buildCandidateRecord(normalizedItem, { requireSouthFlorida, excludeShells });
        if (rec) rawRecords.push(rec);
      }
    } else if (body.business_name !== undefined || body.company !== undefined) {
      const validationError = validateCandidateInputObject(body);
      if (validationError) {
        return json(request, { error: validationError }, 400);
      }
      const normalizedBody = body.outreach_status
        ? { ...body, outreach_status: body.outreach_status.trim() }
        : body;
      // Single manual candidate creation — allow any city if explicitly added
      const rec = buildCandidateRecord(normalizedBody, { requireSouthFlorida: false, excludeShells: false });
      if (!rec) {
        return json(request, { error: 'Business name and founder name are required.' }, 400);
      }
      rawRecords.push(rec);
    } else {
      return json(request, { error: 'Provide raw_text, candidates[], or a single candidate object.' }, 400);
    }

    if (rawRecords.length > MAX_IMPORT_RECORDS) {
      return json(request, {
        error: `Batch limit exceeded (${rawRecords.length} parsed candidates). Maximum ${MAX_IMPORT_RECORDS} candidates per request.`
      }, 400);
    }

    // Deduplicate within the incoming payload by doc_number so chunk counts remain exact
    const dedupedByDoc = new Map();
    for (const rec of rawRecords) {
      const prev = dedupedByDoc.get(rec.doc_number);
      if (!prev) {
        dedupedByDoc.set(rec.doc_number, rec);
      } else {
        dedupedByDoc.set(rec.doc_number, {
          ...prev,
          email: rec.email || prev.email,
          phone: rec.phone || prev.phone,
          website: rec.website || prev.website,
          notes: rec.notes || prev.notes
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
        created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT(doc_number) DO UPDATE SET
        email = COALESCE(NULLIF(excluded.email, ''), outreach_candidates.email),
        phone = COALESCE(NULLIF(excluded.phone, ''), outreach_candidates.phone),
        website = COALESCE(NULLIF(excluded.website, ''), outreach_candidates.website),
        city = COALESCE(NULLIF(excluded.city, ''), outreach_candidates.city),
        county = COALESCE(NULLIF(excluded.county, ''), outreach_candidates.county),
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
        updated_at = CURRENT_TIMESTAMP
    `;

    for (let offsetIdx = 0; offsetIdx < recordsToUpsert.length; offsetIdx += BATCH_CHUNK_SIZE) {
      const chunk = recordsToUpsert.slice(offsetIdx, offsetIdx + BATCH_CHUNK_SIZE);
      const placeholders = chunk.map(() => '?').join(', ');
      const { results: existingRows } = await env.DB.prepare(
        `SELECT doc_number FROM outreach_candidates WHERE doc_number IN (${placeholders})`
      ).bind(...chunk.map(r => r.doc_number)).all();

      const existingDocNumbers = new Set((existingRows || []).map(r => r.doc_number));

      const statements = chunk.map((rec) => {
        if (existingDocNumbers.has(rec.doc_number)) {
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
          rec.enrichment_confidence, rec.enrichment_meta, rec.outreach_status, rec.notes
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
