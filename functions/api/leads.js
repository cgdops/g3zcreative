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
