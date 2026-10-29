/**
 * CRM Outreach Candidate Detail, Enrichment, Email Dispatch & Pipeline Promotion API
 * GET    /api/crm/outreach/:id - Fetch candidate + rendered templates
 * PATCH  /api/crm/outreach/:id - Update candidate (email, phone, website, status, notes)
 * DELETE /api/crm/outreach/:id - Delete candidate
 * POST   /api/crm/outreach/:id - Execute action: 'enrich' | 'send_email' | 'promote'
 */

import { checkAuth } from '../auth.js';
import {
  enrichOutreachCandidate,
  renderOutreachTemplate,
  OUTREACH_TEMPLATES
} from '../_sunbiz.js';
import { ensureOutreachSchema } from './index.js';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

function generateId(prefix = 'lead_') {
  const timestamp = Date.now().toString(36);
  const randomStr = Math.random().toString(36).substring(2, 8);
  return `${prefix}${timestamp}_${randomStr}`;
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

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env, params } = context;
  const auth = checkAuth(request, env);
  if (!auth.authenticated) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database not available' }, 500);

  await ensureOutreachSchema(env.DB);
  const candidate = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(params.id).first();
  if (!candidate) return json({ error: 'Candidate not found' }, 404);

  const renderedTemplates = {};
  for (const key of Object.keys(OUTREACH_TEMPLATES)) {
    renderedTemplates[key] = {
      ...OUTREACH_TEMPLATES[key],
      ...renderOutreachTemplate(key, candidate)
    };
  }

  return json({ candidate, renderedTemplates });
}

export async function onRequestPatch(context) {
  const { request, env, params } = context;
  const candidateId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database not available' }, 500);

  await ensureOutreachSchema(env.DB);
  const existing = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
  if (!existing) return json({ error: 'Candidate not found' }, 404);

  const body = await request.json().catch(() => ({}));
  const allowedFields = [
    'business_name_clean', 'founder_name', 'founder_first_name', 'founder_last_name',
    'founder_title', 'city', 'zip', 'niche', 'score', 'email', 'phone', 'website',
    'outreach_status', 'notes'
  ];

  const updates = [];
  const values = [];

  for (const field of allowedFields) {
    if (body[field] !== undefined) {
      updates.push(`${field} = ?`);
      values.push(typeof body[field] === 'string' ? body[field].trim() : body[field]);
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
    return json({ success: true, candidate: existing });
  }

  updates.push('updated_at = CURRENT_TIMESTAMP');
  values.push(candidateId);

  await env.DB.prepare(`UPDATE outreach_candidates SET ${updates.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();

  const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
  return json({ success: true, candidate: updated });
}

export async function onRequestDelete(context) {
  const { request, env, params } = context;
  const auth = checkAuth(request, env);
  if (!auth.authenticated) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database not available' }, 500);

  await ensureOutreachSchema(env.DB);
  await env.DB.prepare('DELETE FROM outreach_candidates WHERE id = ?').bind(params.id).run();
  return json({ success: true });
}

export async function onRequestPost(context) {
  const { request, env, params } = context;
  const candidateId = params.id;

  const auth = checkAuth(request, env);
  if (!auth.authenticated) return json({ error: 'Unauthorized' }, 401);
  if (!env.DB) return json({ error: 'Database not available' }, 500);

  await ensureOutreachSchema(env.DB);
  const candidate = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
  if (!candidate) return json({ error: 'Candidate not found' }, 404);

  const body = await request.json().catch(() => ({}));
  const action = params.action || body.action || 'enrich';

  // -------------------------------------------------------------------------
  // Action 1: Run Automated Contact Enrichment Waterfall
  // -------------------------------------------------------------------------
  if (action === 'enrich') {
    const hasProvider = Boolean(
      env.ENRICHMENT_API_KEY || env.APOLLO_API_KEY || env.PDL_API_KEY || (env.DATAFORSEO_LOGIN && env.DATAFORSEO_PASSWORD)
    );

    if (!hasProvider) {
      return json({
        error: 'No enrichment API keys configured (APOLLO_API_KEY, PDL_API_KEY, ENRICHMENT_API_KEY, or DATAFORSEO_LOGIN). Use the 1-click research links on the card or add an API key to your environment.',
        userError: true
      }, 400);
    }

    await env.DB.prepare("UPDATE outreach_candidates SET enrichment_status = 'pending' WHERE id = ?")
      .bind(candidateId)
      .run();

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
      candidateId
    ).run();

    const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    return json({
      success: true,
      enrichment: enr,
      candidate: updated
    });
  }

  // -------------------------------------------------------------------------
  // Action 2: Promote Candidate to Active Kanban Pipeline
  // -------------------------------------------------------------------------
  if (action === 'promote') {
    const targetStage = body.status || 'contacted';
    const promoted = await promoteCandidateToLead(env.DB, candidate, {
      status: targetStage,
      noteType: 'note',
      noteContent: body.note || `Promoted from Sunbiz Outreach (${candidate.doc_number} — Filed ${candidate.filing_date} in ${candidate.city}).`
    });

    const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    return json({
      success: true,
      lead_id: promoted.leadId,
      candidate: updated
    });
  }

  // -------------------------------------------------------------------------
  // Action 3: Send CRO Outreach Email + Auto-Promote to "Contacted" on Kanban
  // -------------------------------------------------------------------------
  if (action === 'send_email' || action === 'send-email') {
    const toEmail = String(body.to || candidate.email || '').trim();
    const subject = String(body.subject || '').trim();
    const emailBody = String(body.body || '').trim();
    const mode = body.mode || 'send'; // 'send' (API dispatch) or 'log_only' (opened in mail client)

    if (!toEmail || !toEmail.includes('@')) {
      return json({ error: 'A valid recipient email address is required.' }, 400);
    }
    if (!subject || !emailBody) {
      return json({ error: 'Subject and email body are required.' }, 400);
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
        return json({
          error: dispatchResult.error,
          canFallbackToMailto: true
        }, 400);
      }
      dispatchProvider = dispatchResult.provider;
    }

    // Promote to CRM Kanban Pipeline under 'contacted' and log outbound email in lead_notes
    const promoted = await promoteCandidateToLead(env.DB, candidate, {
      status: 'contacted',
      outreachStatus: 'emailed',
      lastSubject: subject,
      noteType: 'email',
      noteContent: `Outbound Sunbiz Outreach Email sent to ${toEmail} (${dispatchProvider}):\nSubject: ${subject}\n\n${emailBody}`
    });

    const updated = await env.DB.prepare('SELECT * FROM outreach_candidates WHERE id = ?').bind(candidateId).first();
    return json({
      success: true,
      provider: dispatchProvider,
      lead_id: promoted.leadId,
      candidate: updated
    });
  }

  return json({ error: `Unknown action: ${action}` }, 400);
}

/**
 * Promote an outreach candidate into the main `leads` table (or update if already linked)
 * and log a timeline note in `lead_notes`.
 */
async function promoteCandidateToLead(db, candidate, opts) {
  let leadId = candidate.lead_id;
  const existingLead = leadId
    ? await db.prepare('SELECT id FROM leads WHERE id = ?').bind(leadId).first()
    : null;

  const contactInfo = candidate.email || candidate.phone || `${candidate.city}, FL (${candidate.doc_number})`;
  const serviceInterest = `Day-1 Launchpad (${candidate.niche || 'Local Business'})`;
  const sourcePage = `Sunbiz (${candidate.doc_number})`;
  const contextMessage = [
    `Sunbiz Doc#: ${candidate.doc_number} (${candidate.entity_type || 'FL LLC'})`,
    `Filing Date: ${candidate.filing_date || 'Recent'}`,
    `Founder: ${candidate.founder_name} (${candidate.founder_title || 'MGR'})`,
    candidate.principal_address ? `Address: ${candidate.principal_address}, ${candidate.city}, FL ${candidate.zip || ''}` : `City: ${candidate.city}, FL`
  ].join(' | ');

  if (!existingLead) {
    leadId = generateId('lead_');
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
      opts.status || 'contacted',
      1500 // Default estimated starter package value ($1,500)
    ).run();
  } else {
    await db.prepare(`
      UPDATE leads
      SET contact_info = COALESCE(?, contact_info),
          email = COALESCE(?, email),
          phone = COALESCE(?, phone),
          status = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).bind(
      candidate.email || candidate.phone || null,
      candidate.email || null,
      candidate.phone || null,
      opts.status || 'contacted',
      leadId
    ).run();
  }

  // Record timeline note
  const noteId = generateId('note_');
  await db.prepare(`
    INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
    VALUES (?, ?, 'Christian', ?, ?, CURRENT_TIMESTAMP)
  `).bind(noteId, leadId, opts.noteType || 'email', opts.noteContent).run();

  // Update outreach_candidates record
  const nextOutreachStatus = opts.outreachStatus || 'promoted';
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

  return { leadId };
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
      const errText = await res.text();
      return { ok: false, error: `Resend error (${res.status}): ${errText}` };
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
      const errText = await res.text();
      return { ok: false, error: `Postmark error (${res.status}): ${errText}` };
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
      const errText = await res.text();
      return { ok: false, error: `SendGrid error (${res.status}): ${errText}` };
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
