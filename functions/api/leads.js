/**
 * Public Lead Ingestion API Endpoint
 * POST /api/leads
 * Handles form submissions from website visitors, pSEO pages, and quick-connect modals.
 */

// Helper to generate unique IDs
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

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Accept',
  'Access-Control-Max-Age': '86400',
};

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  try {
    let body = {};
    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('application/json')) {
      body = await request.json().catch(() => ({}));
    } else if (contentType.includes('application/x-www-form-urlencoded') || contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      for (const [key, value] of formData.entries()) {
        body[key] = typeof value === 'string' ? value.trim() : value;
      }
    }

    // 1. Honeypot anti-spam check
    if (body._gotcha || body.website_url_hp || body.honeypot) {
      // Silently accept bots without saving or erroring
      return new Response(JSON.stringify({ success: true, message: 'Inquiry received' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    const name = (body.name || '').trim();
    const contactInfo = (body.contact_info || body.phone || body.email || '').trim();

    if (!name || !contactInfo) {
      return new Response(JSON.stringify({
        success: false,
        error: 'Please provide your name and phone number or email address.'
      }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
      });
    }

    // Determine email and phone from contact info if not separated
    let email = (body.email || '').trim();
    let phone = (body.phone || '').trim();

    if (!email && contactInfo.includes('@')) {
      email = contactInfo;
    }
    if (!phone && !contactInfo.includes('@')) {
      phone = contactInfo;
    }

    const company = (body.company || '').trim();
    const serviceInterest = (body.service_interest || body.service || 'General Inquiry').trim();
    const message = (body.message || body.notes || '').trim();
    const sourcePage = (body.source_page || body.page || request.headers.get('referer') || '/').trim();
    const utmSource = (body.utm_source || '').trim();
    const utmMedium = (body.utm_medium || '').trim();
    const utmCampaign = (body.utm_campaign || '').trim();
    const referrer = (body.referrer || request.headers.get('referer') || '').trim();
    const userAgent = request.headers.get('user-agent') || 'Unknown';
    const ipCountry = request.cf?.country || request.headers.get('cf-ipcountry') || 'Unknown';

    const leadId = generateId('lead_');

    // 2. Insert lead into D1
    if (env.DB) {
      await env.DB.prepare(`
        INSERT INTO leads (
          id, name, contact_info, email, phone, company,
          service_interest, message, source_page,
          utm_source, utm_medium, utm_campaign, referrer,
          user_agent, ip_country, status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `).bind(
        leadId, name, contactInfo, email, phone, company,
        serviceInterest, message, sourcePage,
        utmSource, utmMedium, utmCampaign, referrer,
        userAgent, ipCountry
      ).run();

      // Insert initial activity note
      const noteId = generateId('note_');
      const noteContent = message
        ? `Lead submitted inquiry from ${sourcePage} for "${serviceInterest}":\n"${message}"`
        : `Lead submitted inquiry from ${sourcePage} for "${serviceInterest}".`;

      await env.DB.prepare(`
        INSERT INTO lead_notes (id, lead_id, author, type, content, created_at)
        VALUES (?, ?, 'System', 'form_submission', ?, CURRENT_TIMESTAMP)
      `).bind(noteId, leadId, noteContent).run();
    } else {
      console.warn('D1 database binding "DB" not found. Lead logged to console:', { leadId, name, contactInfo });
    }

    // 3. Optional Instant Notifications (Discord / Slack / Email Webhook)
    const notificationPayload = {
      leadId,
      name,
      contactInfo,
      email,
      phone,
      company,
      serviceInterest,
      message,
      sourcePage,
      ipCountry,
      timestamp: new Date().toISOString()
    };

    // 3. Instant Email Notification (Resend / SendGrid / Postmark / Webhook)
    const targetEmail = env.NOTIFICATION_EMAIL || 'chris@g3zcreative.com';
    const emailSubject = `🔥 New Lead: ${name} (${serviceInterest})`;
    const leadDetailUrl = `https://g3zcreative.com/lead?id=${leadId}`;

    const emailHtml = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #0b0f17; color: #f8fafc; margin: 0; padding: 20px; }
    .card { background-color: #131b2e; border: 1px solid #1e293b; border-radius: 12px; max-width: 600px; margin: 0 auto; overflow: hidden; }
    .header { background: linear-gradient(135deg, #da104d 0%, #83002b 100%); padding: 24px; text-align: center; color: white; }
    .content { padding: 24px; }
    .lead-name { font-size: 22px; font-weight: 700; color: #ffffff; margin-bottom: 4px; }
    .lead-time { font-size: 13px; color: #94a3b8; margin-bottom: 20px; }
    .info-table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    .info-table td { padding: 10px 12px; border-bottom: 1px solid #1e293b; font-size: 14px; }
    .info-label { color: #94a3b8; width: 120px; font-weight: 600; text-transform: uppercase; font-size: 11px; }
    .info-val { color: #f8fafc; font-weight: 500; }
    .message-box { background: #0f172a; border: 1px solid #1e293b; border-left: 4px solid #da104d; border-radius: 8px; padding: 14px; margin-bottom: 24px; font-size: 14px; line-height: 1.5; color: #e2e8f0; }
    .btn { display: inline-block; padding: 12px 20px; background-color: #da104d; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 700; font-size: 14px; text-align: center; }
    .btn-secondary { background-color: #1e293b; border: 1px solid #334155; }
    .footer { text-align: center; padding: 16px; font-size: 12px; color: #64748b; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1 style="margin: 0; font-size: 20px; color: #ffffff;">G3Z Creative CRM</h1>
      <p style="margin: 4px 0 0; font-size: 13px; color: rgba(255,255,255,0.9);">New Lead Captured</p>
    </div>
    <div class="content">
      <div class="lead-name">${escapeHtml(name)}</div>
      <div class="lead-time">Received on ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} EST</div>
      
      <table class="info-table">
        <tr>
          <td class="info-label">Contact</td>
          <td class="info-val"><strong>${escapeHtml(contactInfo)}</strong></td>
        </tr>
        ${phone ? `<tr><td class="info-label">Phone</td><td class="info-val"><a href="tel:${phone}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(phone)}</a></td></tr>` : ''}
        ${email ? `<tr><td class="info-label">Email</td><td class="info-val"><a href="mailto:${email}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(email)}</a></td></tr>` : ''}
        ${company ? `<tr><td class="info-label">Company</td><td class="info-val">${escapeHtml(company)}</td></tr>` : ''}
        <tr>
          <td class="info-label">Service</td>
          <td class="info-val" style="color: #f472b6; font-weight: 600;">${escapeHtml(serviceInterest)}</td>
        </tr>
        <tr>
          <td class="info-label">Source Page</td>
          <td class="info-val"><a href="https://g3zcreative.com${sourcePage.startsWith('/') ? sourcePage : '/' + sourcePage}" style="color: #38bdf8; text-decoration: none;">${escapeHtml(sourcePage)}</a></td>
        </tr>
        <tr>
          <td class="info-label">Location</td>
          <td class="info-val">${escapeHtml(ipCountry)}</td>
        </tr>
      </table>

      <div style="font-size: 12px; font-weight: 700; color: #94a3b8; text-transform: uppercase; margin-bottom: 6px;">Inquiry Note / Message</div>
      <div class="message-box">${escapeHtml(message || 'No additional message provided.')}</div>

      <div style="text-align: center; margin-top: 24px;">
        <a href="${leadDetailUrl}" class="btn" style="display: block; padding: 14px; font-size: 15px;">👉 View Lead in CRM</a>
      </div>
    </div>
    <div class="footer">
      G3Z Creative In-House CRM &bull; <a href="https://g3zcreative.com/crm" style="color: #64748b; text-decoration: none;">CRM Dashboard</a>
    </div>
  </div>
</body>
</html>`;

    // 1. Resend Email Dispatch (Recommended)
    if (env.RESEND_API_KEY) {
      const fromAddress = env.RESEND_FROM || 'G3Z CRM <notifications@g3zcreative.com>';
      context.waitUntil(
        fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            from: fromAddress,
            to: [targetEmail],
            reply_to: email || undefined,
            subject: emailSubject,
            html: emailHtml
          })
        }).then(async res => {
          if (!res.ok) {
            const err = await res.text();
            console.error('Resend error:', err);
          }
        }).catch(err => console.error('Failed to send Resend email:', err))
      );
    }

    // 2. Postmark Email Dispatch
    if (env.POSTMARK_SERVER_TOKEN) {
      const fromAddress = env.POSTMARK_FROM || 'notifications@g3zcreative.com';
      context.waitUntil(
        fetch('https://api.postmarkapp.com/email', {
          method: 'POST',
          headers: {
            'X-Postmark-Server-Token': env.POSTMARK_SERVER_TOKEN,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            From: fromAddress,
            To: targetEmail,
            ReplyTo: email || undefined,
            Subject: emailSubject,
            HtmlBody: emailHtml
          })
        }).catch(err => console.error('Failed to send Postmark email:', err))
      );
    }

    // 3. SendGrid Email Dispatch
    if (env.SENDGRID_API_KEY) {
      const fromAddress = env.SENDGRID_FROM || 'notifications@g3zcreative.com';
      context.waitUntil(
        fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            personalizations: [{ to: [{ email: targetEmail }] }],
            from: { email: fromAddress, name: 'G3Z Creative CRM' },
            reply_to: email ? { email } : undefined,
            subject: emailSubject,
            content: [{ type: 'text/html', value: emailHtml }]
          })
        }).catch(err => console.error('Failed to send SendGrid email:', err))
      );
    }

    // 4. Generic Webhook Dispatch
    if (env.EMAIL_WEBHOOK_URL) {
      context.waitUntil(
        fetch(env.EMAIL_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: targetEmail,
            subject: emailSubject,
            lead: notificationPayload,
            crm_url: leadDetailUrl,
            html: emailHtml
          })
        }).catch(err => console.error('Failed to send Email Webhook:', err))
      );
    }

    // Discord Webhook integration if DISCORD_WEBHOOK_URL is configured in Cloudflare environment
    if (env.DISCORD_WEBHOOK_URL) {
      context.waitUntil(
        fetch(env.DISCORD_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: 'G3Z Creative CRM',
            avatar_url: 'https://g3zcreative.com/images/favicon.png',
            embeds: [{
              title: `🔥 New Lead: ${name}`,
              color: 0xda104d, // Brand accent color
              fields: [
                { name: 'Contact', value: contactInfo || 'N/A', inline: true },
                { name: 'Service', value: serviceInterest || 'General', inline: true },
                { name: 'Company', value: company || 'N/A', inline: true },
                { name: 'Source Page', value: sourcePage || '/', inline: false },
                { name: 'Message', value: message || '(No message provided)', inline: false }
              ],
              footer: { text: `Country: ${ipCountry} | ID: ${leadId}` },
              timestamp: new Date().toISOString()
            }]
          })
        }).catch(err => console.error('Discord webhook error:', err))
      );
    }

    // Slack Webhook integration if SLACK_WEBHOOK_URL is configured
    if (env.SLACK_WEBHOOK_URL) {
      context.waitUntil(
        fetch(env.SLACK_WEBHOOK_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: `🔥 *New Lead Received*: *${name}* (${contactInfo})\n*Service*: ${serviceInterest}\n*Page*: ${sourcePage}\n*Message*: ${message || 'None'}`
          })
        }).catch(err => console.error('Slack webhook error:', err))
      );
    }

    return new Response(JSON.stringify({
      success: true,
      message: 'Thank you! Christian has received your inquiry and will connect with you shortly.',
      lead_id: leadId
    }), {
      status: 201,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });

  } catch (error) {
    console.error('Error ingesting lead:', error);
    return new Response(JSON.stringify({
      success: false,
      error: 'An unexpected error occurred while submitting your inquiry. Please call or text directly at +1 (786) 967-3699.'
    }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
