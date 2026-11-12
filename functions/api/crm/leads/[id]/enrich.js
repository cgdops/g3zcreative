/**
 * CRM Lead Enrichment API
 * POST /api/crm/leads/:id/enrich - Look up the lead's email/phone/domain via
 * the multi-provider enrichment waterfall (DataForSEO SERP, People Data Labs,
 * Hunter.io, Apollo.io, plus DNS MX verification) and record the result.
 *
 * This never writes leads.email directly without user confirmation when an
 * email is found. The result is stored on the enrichment record and surfaced
 * in the UI for confirmation; accepting it is a normal PATCH.
 */

import { checkAuth, verifyCsrf, getCorsHeaders, handleCorsOptions } from '../../auth.js';
import { enrichLead, isValidCompanyDomain, normalizeDomain, splitName } from '../../_enrich.js';
import {
  cleanBusinessName,
  enrichOutreachCandidate,
  normalizeSouthFlCity,
  matchSouthFloridaLocation
} from '../../_sunbiz.js';

const ALLOWED_METHODS = 'POST, OPTIONS';

// Don't re-bill providers for a lead we already resolved recently.
const REENRICH_AFTER_DAYS = 30;

function generateId(prefix = 'enr_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

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

async function readJsonObject(request, auth, { allowEmpty = true } = {}) {
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

/**
 * Parse address/city/zip/title hints out of a Sunbiz-promoted lead.message if no
 * outreach_candidates row is linked.
 * Example: "Sunbiz Doc#: L26000561337 (FL LLC) | Filing Date: 2026-11-04 | Founder: Lazaro A Brito (AMBR) | Address: 12324 Sw 18 Th Terra, Miami, FL 33175"
 */
function parseSunbizLeadHints(message) {
  const text = String(message || '');
  const hints = { principal_address: '', city: '', zip: '', founder_title: 'Founder' };

  const titleMatch = text.match(/Founder:\s*[^(|]+\(([^)]+)\)/i);
  if (titleMatch) hints.founder_title = titleMatch[1].trim();

  const addrMatch = text.match(/Address:\s*([^,|]+),\s*([^,|]+),\s*FL\s*(\d{5})?/i);
  if (addrMatch) {
    hints.principal_address = addrMatch[1].trim();
    hints.zip = (addrMatch[3] || '').trim();
    hints.city = normalizeSouthFlCity(addrMatch[2].trim(), hints.zip);
    return hints;
  }

  const cityMatch = text.match(/City:\s*([^,|]+)(?:,\s*FL)?/i);
  if (cityMatch) {
    hints.city = normalizeSouthFlCity(cityMatch[1].trim(), hints.zip);
  }
  return hints;
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, ALLOWED_METHODS);
}

export async function onRequestPost(context) {
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

  const parsedBody = await readJsonObject(request, auth, { allowEmpty: true });
  if (!parsedBody.ok) {
    return json(request, { error: parsedBody.error }, parsedBody.status);
  }

  if (!env.DB) {
    return json(request, { error: 'Database not available' }, 500);
  }

  try {
    const body = parsedBody.body;
    if (body.company_domain !== undefined && body.company_domain !== null && typeof body.company_domain === 'object') {
      return json(request, { error: 'Invalid non-primitive value for company_domain.' }, 400);
    }

    const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
    if (!lead) {
      return json(request, { error: 'Lead not found' }, 404);
    }

    const force = body.force === true;

    // Reuse a recent successful result rather than paying for it again.
    if (!force && lead.enrichment_status === 'found' && lead.enriched_at) {
      const enrichedAt = new Date(String(lead.enriched_at).replace(' ', 'T') + 'Z');
      const ageDays = (Date.now() - enrichedAt.getTime()) / 86400000;
      if (Number.isFinite(ageDays) && ageDays < REENRICH_AFTER_DAYS) {
        const previous = await env.DB.prepare(
          "SELECT * FROM lead_enrichments WHERE lead_id = ? AND status = 'found' ORDER BY created_at DESC LIMIT 1"
        ).bind(leadId).first();

        if (previous) {
          return json(request, { success: true, cached: true, enrichment: previous });
        }
      }
    }

    // A valid domain passed in the request wins, and is persisted for next time.
    const requestedDomain = normalizeDomain(body.company_domain);
    const validRequestedDomain = isValidCompanyDomain(requestedDomain) ? requestedDomain : '';
    if (validRequestedDomain && validRequestedDomain !== lead.company_domain) {
      await env.DB.prepare('UPDATE leads SET company_domain = ? WHERE id = ?')
        .bind(validRequestedDomain, leadId).run();
      lead.company_domain = validRequestedDomain;
    }

    if (!lead.company_domain && !lead.company && !lead.name) {
      return json(request, {
        error: 'This lead has no name, company, or domain. Add one before enriching.'
      }, 400);
    }

    const hasProvider = Boolean(
      env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API ||
      env.APOLLO_API_KEY || env.APOLLO_API ||
      env.PDL_API_KEY || env.PDL_API ||
      (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
    );

    if (!hasProvider) {
      return json(request, {
        error: 'No enrichment API keys configured (PDL_API_KEY, APOLLO_API_KEY, ENRICHMENT_API_KEY, or DATAFORSEO_LOGIN).'
      }, 400);
    }

    await env.DB.prepare("UPDATE leads SET enrichment_status = 'pending' WHERE id = ?")
      .bind(leadId).run();

    // Check if this lead was promoted from outreach_candidates so we can use its full address/city metadata
    let linkedCandidate = null;
    try {
      linkedCandidate = await env.DB.prepare(
        'SELECT * FROM outreach_candidates WHERE lead_id = ? LIMIT 1'
      ).bind(leadId).first();
    } catch (_) {
      // outreach_candidates table might not exist in older environments
    }

    const parsedHints = parseSunbizLeadHints(lead.message);
    const nameSplit = splitName(lead.name);
    const effectiveDomain = isValidCompanyDomain(lead.company_domain) ? normalizeDomain(lead.company_domain) : '';

    let finalResult = {
      provider: 'waterfall',
      status: 'not_found',
      email: null,
      phone: lead.phone || null,
      confidence: null,
      verification: null,
      jobTitle: linkedCandidate?.founder_title || parsedHints.founder_title || null,
      linkedinUrl: null,
      domain: effectiveDomain || null,
      raw: {}
    };

    try {
      // 1. If a specific valid company_domain is known and Hunter key is configured, try direct Hunter lookup first
      const hunterKey = env.ENRICHMENT_API_KEY || env.HUNTER_API_KEY || env.HUNTER_API;
      if (effectiveDomain && hunterKey && nameSplit.ok) {
        try {
          const hunterRes = await enrichLead({
            name: lead.name,
            firstName: nameSplit.firstName,
            lastName: nameSplit.lastName,
            company: lead.company,
            companyDomain: effectiveDomain
          }, { ...env, ENRICHMENT_API_KEY: hunterKey });

          if (hunterRes.status === 'found' && hunterRes.email) {
            finalResult = {
              provider: 'hunter',
              status: 'found',
              email: hunterRes.email,
              phone: lead.phone || null,
              confidence: hunterRes.confidence,
              verification: hunterRes.verification,
              jobTitle: hunterRes.jobTitle || finalResult.jobTitle,
              linkedinUrl: hunterRes.linkedinUrl,
              domain: hunterRes.domain || effectiveDomain,
              raw: hunterRes.raw || {}
            };
          }
        } catch (_) {
          // Fall through to full multi-provider waterfall
        }
      }

      // 2. Run the 4-stage multi-provider waterfall (DataForSEO SERP -> PDL -> Hunter -> Apollo -> DNS MX check)
      if (finalResult.status !== 'found') {
        const effectiveZip = linkedCandidate?.zip || parsedHints.zip || '';
        const effectiveCity = normalizeSouthFlCity(linkedCandidate?.city || parsedHints.city || '', effectiveZip);
        const inferredCounty = effectiveCity
          ? matchSouthFloridaLocation(effectiveCity, effectiveZip).county
          : '';

        const candidateInput = {
          founder_name: lead.name || linkedCandidate?.founder_name || '',
          founder_first_name: linkedCandidate?.founder_first_name || (nameSplit.ok ? nameSplit.firstName : ''),
          founder_last_name: linkedCandidate?.founder_last_name || (nameSplit.ok ? nameSplit.lastName : ''),
          founder_title: linkedCandidate?.founder_title || parsedHints.founder_title || 'Founder',
          business_name_clean: cleanBusinessName(lead.company || linkedCandidate?.business_name_clean || ''),
          principal_address: linkedCandidate?.principal_address || parsedHints.principal_address || '',
          city: effectiveCity,
          zip: effectiveZip,
          county: linkedCandidate?.county || inferredCounty || '',
          niche: linkedCandidate?.niche || 'Local Business',
          email: null, // Force fresh email lookup
          phone: lead.phone || linkedCandidate?.phone || null,
          website: effectiveDomain || linkedCandidate?.website || ''
        };

        const waterfall = await enrichOutreachCandidate(candidateInput, env);
        finalResult = {
          provider: waterfall.source || 'waterfall',
          status: waterfall.email ? 'found' : 'not_found',
          email: waterfall.email || null,
          phone: waterfall.phone || lead.phone || null,
          confidence: waterfall.confidence || null,
          verification: waterfall.meta?.verification || null,
          jobTitle: waterfall.meta?.job_title || finalResult.jobTitle,
          linkedinUrl: waterfall.meta?.linkedin_url || null,
          domain: waterfall.website || effectiveDomain || null,
          raw: waterfall.meta || {}
        };
      }
    } catch (error) {
      console.error('Lead enrichment waterfall error:', error);
      const safeErrorMsg = error?.userError
        ? String(error.message)
        : 'Enrichment provider request failed.';
      const enrichmentId = generateId();
      await env.DB.prepare(`
        INSERT INTO lead_enrichments (id, lead_id, provider, status, company_domain, error, created_at)
        VALUES (?, ?, ?, 'failed', ?, ?, CURRENT_TIMESTAMP)
      `).bind(
        enrichmentId, leadId, 'waterfall',
        lead.company_domain || null, safeErrorMsg
      ).run();

      await env.DB.prepare(
        "UPDATE leads SET enrichment_status = 'failed', enriched_at = CURRENT_TIMESTAMP WHERE id = ?"
      ).bind(leadId).run();

      await addTimelineNote(env, leadId, auth, `Enrichment failed: ${safeErrorMsg}`);

      return json(request, { error: safeErrorMsg }, error?.userError ? 400 : 502);
    }

    const enrichmentId = generateId();
    await env.DB.prepare(`
      INSERT INTO lead_enrichments (
        id, lead_id, provider, status, email, confidence, verification,
        job_title, linkedin_url, company_domain, raw_response, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      enrichmentId, leadId, finalResult.provider, finalResult.status,
      finalResult.email, finalResult.confidence, finalResult.verification,
      finalResult.jobTitle, finalResult.linkedinUrl, finalResult.domain,
      JSON.stringify(finalResult.raw || {})
    ).run();

    // Persist discovered domain or phone if the lead was missing them; keep email as suggestion until confirmed
    await env.DB.prepare(`
      UPDATE leads
      SET enrichment_status = ?,
          enrichment_confidence = ?,
          enrichment_source = ?,
          company_domain = COALESCE(?, NULLIF(company_domain, '')),
          phone = COALESCE(NULLIF(phone, ''), ?),
          enriched_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      finalResult.status,
      finalResult.confidence,
      finalResult.provider,
      finalResult.domain,
      finalResult.phone,
      leadId
    ).run();

    const attemptsSummary = Array.isArray(finalResult.raw?.attempts)
      ? finalResult.raw.attempts.map(a => `${a.provider}: ${a.status || (a.foundWebsite || a.foundPhone ? 'found' : 'no match')}`).join(', ')
      : finalResult.provider;

    const noteText = finalResult.status === 'found'
      ? `Enrichment found ${finalResult.email}${finalResult.domain ? ` (${finalResult.domain})` : ''} via ${finalResult.provider} (${finalResult.confidence ?? '?'}% confidence). Not applied — confirm before use.`
      : `Enrichment checked ${attemptsSummary || 'all providers'} — no public email indexed yet for ${lead.name || 'this lead'} (${lead.company || 'newly filed LLC'}).`;
    await addTimelineNote(env, leadId, auth, noteText);

    const enrichment = await env.DB.prepare('SELECT * FROM lead_enrichments WHERE id = ?')
      .bind(enrichmentId).first();

    return json(request, {
      success: true,
      cached: false,
      enrichment: {
        ...enrichment,
        phone: finalResult.phone,
        attempts: finalResult.raw?.attempts || []
      }
    });
  } catch (error) {
    console.error('Error enriching lead:', error);
    return json(request, { error: 'Failed to enrich lead.' }, 500);
  }
}

async function addTimelineNote(env, leadId, auth, content) {
  const noteId = generateId('note_');
  await env.DB.prepare(`
    INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
    VALUES (?, ?, ?, 'enrichment', ?, CURRENT_TIMESTAMP)
  `).bind(noteId, leadId, auth.user || 'Christian', content).run();
}
