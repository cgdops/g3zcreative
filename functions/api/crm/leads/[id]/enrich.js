/**
 * CRM Lead Enrichment API
 * POST /api/crm/leads/:id/enrich - Look up the lead's work email via the
 * configured provider and record the result as a suggestion.
 *
 * This never writes leads.email. The result is stored on the enrichment record
 * and surfaced in the UI for confirmation; accepting it is a normal PATCH.
 */

import { checkAuth } from '../../auth.js';
import { enrichLead, normalizeDomain } from '../../_enrich.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

// Don't re-bill the provider for a lead we already resolved recently.
const REENRICH_AFTER_DAYS = 30;

function generateId(prefix = 'enr_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
}

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const leadId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) {
    return json({ error: 'Unauthorized' }, 401);
  }

  if (!env.DB) {
    return json({ error: 'Database not available' }, 500);
  }

  const lead = await env.DB.prepare('SELECT * FROM leads WHERE id = ?').bind(leadId).first();
  if (!lead) {
    return json({ error: 'Lead not found' }, 404);
  }

  const body = await request.json().catch(() => ({}));
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
        return json({ success: true, cached: true, enrichment: previous });
      }
    }
  }

  // A domain passed in the request wins, and is persisted for next time.
  const requestedDomain = normalizeDomain(body.company_domain);
  if (requestedDomain && requestedDomain !== lead.company_domain) {
    await env.DB.prepare('UPDATE leads SET company_domain = ? WHERE id = ?')
      .bind(requestedDomain, leadId).run();
    lead.company_domain = requestedDomain;
  }

  if (!lead.company_domain && !lead.company) {
    return json({
      error: 'This lead has no company or domain. Add one before enriching.'
    }, 400);
  }

  await env.DB.prepare("UPDATE leads SET enrichment_status = 'pending' WHERE id = ?")
    .bind(leadId).run();

  let result;
  try {
    result = await enrichLead({
      name: lead.name,
      company: lead.company,
      companyDomain: lead.company_domain
    }, env);
  } catch (error) {
    const enrichmentId = generateId();
    await env.DB.prepare(`
      INSERT INTO lead_enrichments (id, lead_id, provider, status, company_domain, error, created_at)
      VALUES (?, ?, ?, 'failed', ?, ?, CURRENT_TIMESTAMP)
    `).bind(
      enrichmentId, leadId, env.ENRICHMENT_PROVIDER || 'hunter',
      lead.company_domain || null, error.message
    ).run();

    await env.DB.prepare(
      "UPDATE leads SET enrichment_status = 'failed', enriched_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).bind(leadId).run();

    await addTimelineNote(env, leadId, auth, `Enrichment failed: ${error.message}`);

    // A missing name/domain is the user's to fix, not a server fault.
    return json({ error: error.message }, error.userError ? 400 : 502);
  }

  const enrichmentId = generateId();
  await env.DB.prepare(`
    INSERT INTO lead_enrichments (
      id, lead_id, provider, status, email, confidence, verification,
      job_title, linkedin_url, company_domain, raw_response, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
  `).bind(
    enrichmentId, leadId, result.provider, result.status,
    result.email, result.confidence, result.verification,
    result.jobTitle, result.linkedinUrl, result.domain,
    JSON.stringify(result.raw || {})
  ).run();

  await env.DB.prepare(`
    UPDATE leads
    SET enrichment_status = ?, enrichment_confidence = ?, enrichment_source = ?,
        company_domain = ?, enriched_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).bind(
    result.status, result.confidence, result.provider, result.domain, leadId
  ).run();

  const noteText = result.status === 'found'
    ? `Enrichment found ${result.email} at ${result.domain} (${result.confidence ?? '?'}% confidence${result.verification ? `, ${result.verification}` : ''}). Not applied — confirm before use.`
    : `Enrichment found no email for this lead at ${result.domain}.`;
  await addTimelineNote(env, leadId, auth, noteText);

  const enrichment = await env.DB.prepare('SELECT * FROM lead_enrichments WHERE id = ?')
    .bind(enrichmentId).first();

  return json({ success: true, cached: false, enrichment });
}

async function addTimelineNote(env, leadId, auth, content) {
  const noteId = generateId('note_');
  await env.DB.prepare(`
    INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
    VALUES (?, ?, ?, 'enrichment', ?, CURRENT_TIMESTAMP)
  `).bind(noteId, leadId, auth.user || 'Christian', content).run();
}
