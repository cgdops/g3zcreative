/**
 * Sunbiz Outreach Candidates API
 * GET  /api/crm/outreach - Fetch outreach candidates, filters, KPI counts, and CRO templates
 * POST /api/crm/outreach - Add single candidate or bulk import Sunbiz .txt / .csv / JSON records
 */

import { checkAuth } from '../auth.js';
import {
  buildCandidateRecord,
  parseSunbizBulkText,
  enrichOutreachCandidate,
  OUTREACH_TEMPLATES
} from '../_sunbiz.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
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
      lead_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `).run();
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) {
    return json({
      candidates: [],
      counts: { total: 0, uncontacted: 0, has_email: 0, has_phone: 0, high_priority: 0, emailed: 0 },
      templates: OUTREACH_TEMPLATES,
      error: 'D1 database binding "DB" is not configured.'
    });
  }

  try {
    await ensureOutreachSchema(env.DB);

    const url = new URL(request.url);
    const search = (url.searchParams.get('q') || '').trim();
    const status = (url.searchParams.get('status') || 'active').trim(); // 'active' = uncontacted, or 'all', 'uncontacted', 'emailed', 'promoted', 'dismissed'
    const niche = (url.searchParams.get('niche') || 'all').trim();
    const city = (url.searchParams.get('city') || 'all').trim();
    const contactFilter = (url.searchParams.get('contact') || 'all').trim(); // 'all', 'has_email', 'has_phone', 'has_any', 'needs_enrichment'
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '150', 10), 500);
    const offset = parseInt(url.searchParams.get('offset') || '0', 10);

    const conditions = [];
    const params = [];

    if (status === 'active') {
      conditions.push("outreach_status != 'dismissed'");
    } else if (status && status !== 'all') {
      conditions.push('outreach_status = ?');
      params.push(status);
    }

    if (niche && niche !== 'all') {
      conditions.push('niche = ?');
      params.push(niche);
    }

    if (city && city !== 'all') {
      conditions.push('city = ?');
      params.push(city);
    }

    if (contactFilter === 'has_email') {
      conditions.push("email IS NOT NULL AND email != ''");
    } else if (contactFilter === 'has_phone') {
      conditions.push("phone IS NOT NULL AND phone != ''");
    } else if (contactFilter === 'has_any') {
      conditions.push("((email IS NOT NULL AND email != '') OR (phone IS NOT NULL AND phone != ''))");
    } else if (contactFilter === 'needs_enrichment') {
      conditions.push("(email IS NULL OR email = '') AND enrichment_status = 'unattempted'");
    }

    if (search) {
      conditions.push('(business_name LIKE ? OR business_name_clean LIKE ? OR founder_name LIKE ? OR city LIKE ? OR niche LIKE ? OR doc_number LIKE ? OR email LIKE ? OR phone LIKE ?)');
      const term = `%${search}%`;
      params.push(term, term, term, term, term, term, term, term);
    }

    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const query = `
      SELECT * FROM outreach_candidates
      ${whereClause}
      ORDER BY
        CASE WHEN outreach_status = 'uncontacted' THEN 0 ELSE 1 END ASC,
        CASE WHEN email IS NOT NULL AND email != '' THEN 0 ELSE 1 END ASC,
        score DESC,
        filing_date DESC
      LIMIT ? OFFSET ?
    `;

    const { results: candidates } = await env.DB.prepare(query).bind(...params, limit, offset).all();

    const countQuery = `
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN outreach_status = 'uncontacted' THEN 1 ELSE 0 END) as uncontacted_count,
        SUM(CASE WHEN email IS NOT NULL AND email != '' THEN 1 ELSE 0 END) as has_email_count,
        SUM(CASE WHEN phone IS NOT NULL AND phone != '' THEN 1 ELSE 0 END) as has_phone_count,
        SUM(CASE WHEN score >= 80 AND outreach_status = 'uncontacted' THEN 1 ELSE 0 END) as high_priority_count,
        SUM(CASE WHEN outreach_status IN ('emailed', 'promoted') THEN 1 ELSE 0 END) as emailed_count
      FROM outreach_candidates
      WHERE outreach_status != 'dismissed'
    `;
    const countRow = await env.DB.prepare(countQuery).first();

    // Distinct cities & niches for dynamic filter dropdowns
    const { results: cityRows } = await env.DB.prepare(
      "SELECT DISTINCT city FROM outreach_candidates WHERE city IS NOT NULL AND city != '' AND outreach_status != 'dismissed' ORDER BY city ASC"
    ).all();
    const { results: nicheRows } = await env.DB.prepare(
      "SELECT DISTINCT niche FROM outreach_candidates WHERE niche IS NOT NULL AND niche != '' AND outreach_status != 'dismissed' ORDER BY niche ASC"
    ).all();

    return json({
      candidates: candidates || [],
      counts: {
        total: countRow?.total || 0,
        uncontacted: countRow?.uncontacted_count || 0,
        has_email: countRow?.has_email_count || 0,
        has_phone: countRow?.has_phone_count || 0,
        high_priority: countRow?.high_priority_count || 0,
        emailed: countRow?.emailed_count || 0
      },
      facets: {
        cities: (cityRows || []).map(r => r.city),
        niches: (nicheRows || []).map(r => r.niche)
      },
      templates: OUTREACH_TEMPLATES
    });
  } catch (err) {
    console.error('Error fetching outreach candidates:', err);
    return json({ error: err.message }, 500);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) {
    return json({ error: 'D1 database binding "DB" is missing.' }, 500);
  }

  try {
    await ensureOutreachSchema(env.DB);
    const body = await request.json().catch(() => ({}));

    const requireSouthFlorida = body.require_south_fl !== false;
    const excludeShells = body.exclude_shells !== false;
    const autoEnrichTop = body.auto_enrich_top !== false; // Smart Hybrid default: true

    let recordsToInsert = [];

    if (typeof body.raw_text === 'string' && body.raw_text.trim()) {
      recordsToInsert = parseSunbizBulkText(body.raw_text, {
        requireSouthFlorida,
        excludeShells
      });
    } else if (Array.isArray(body.candidates)) {
      for (const item of body.candidates) {
        const rec = buildCandidateRecord(item, { requireSouthFlorida, excludeShells });
        if (rec) recordsToInsert.push(rec);
      }
    } else if (body.business_name || body.company) {
      // Single manual candidate creation — allow any city if explicitly added
      const rec = buildCandidateRecord(body, { requireSouthFlorida: false, excludeShells: false });
      if (!rec) {
        return json({ error: 'Business name and founder name are required.' }, 400);
      }
      recordsToInsert.push(rec);
    } else {
      return json({ error: 'Provide raw_text, candidates[], or a single candidate object.' }, 400);
    }

    let inserted = 0;
    let updated = 0;
    let autoEnriched = 0;
    const insertedRecords = [];

    for (const rec of recordsToInsert) {
      const existing = await env.DB.prepare('SELECT id, email, phone, outreach_status FROM outreach_candidates WHERE doc_number = ?')
        .bind(rec.doc_number)
        .first();

      if (existing) {
        await env.DB.prepare(`
          UPDATE outreach_candidates
          SET email = COALESCE(?, email),
              phone = COALESCE(?, phone),
              website = COALESCE(?, website),
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `).bind(rec.email, rec.phone, rec.website, existing.id).run();
        updated++;
        continue;
      }

      await env.DB.prepare(`
        INSERT INTO outreach_candidates (
          id, doc_number, business_name, business_name_clean, entity_type, filing_date,
          founder_name, founder_first_name, founder_last_name, founder_title, secondary_officers,
          registered_agent, principal_address, mailing_address, city, state, zip, county,
          niche, score, email, phone, website, enrichment_status, enrichment_source,
          enrichment_confidence, enrichment_meta, outreach_status, notes,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        rec.id, rec.doc_number, rec.business_name, rec.business_name_clean, rec.entity_type, rec.filing_date,
        rec.founder_name, rec.founder_first_name, rec.founder_last_name, rec.founder_title, rec.secondary_officers,
        rec.registered_agent, rec.principal_address, rec.mailing_address, rec.city, rec.state, rec.zip, rec.county,
        rec.niche, rec.score, rec.email, rec.phone, rec.website, rec.enrichment_status, rec.enrichment_source,
        rec.enrichment_confidence, rec.enrichment_meta, rec.outreach_status, rec.notes
      ).run();

      inserted++;
      insertedRecords.push(rec);
    }

    // Smart Hybrid Enrichment: Auto-enrich top-scoring niches (score >= 80) up to 5 per synchronous batch
    // so Worker subrequest limits are respected; remaining can be enriched on-click or via batch button.
    const hasAnyEnrichmentProvider = Boolean(
      env.ENRICHMENT_API_KEY || env.APOLLO_API_KEY || env.PDL_API_KEY || (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
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

    return json({
      success: true,
      parsed: recordsToInsert.length,
      inserted,
      updated,
      auto_enriched: autoEnriched
    }, 201);
  } catch (err) {
    console.error('Error importing outreach candidates:', err);
    return json({ error: err.message }, 500);
  }
}
