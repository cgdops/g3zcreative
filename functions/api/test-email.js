/**
 * CRM Admin Resend Diagnostic Endpoint
 * POST /api/test-email (POST only — protected against top-level navigation CSRF)
 * Requires authenticated CRM session cookie (with Origin/Sec-Fetch-Site CSRF verification)
 * or X-CRM-Key / Bearer header.
 */

import {
  checkAuth,
  getCorsHeaders,
  handleCorsOptions,
  verifyCsrf
} from './crm/auth.js';

const TEST_EMAIL_METHODS = 'POST, OPTIONS';

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, TEST_EMAIL_METHODS);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const auth = await checkAuth(request, env);
  const csrf = verifyCsrf(request, auth.authenticated ? auth : null);
  if (!csrf.ok) {
    return new Response(JSON.stringify({ error: csrf.error }), {
      status: csrf.status,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Vary': 'Origin'
      }
    });
  }

  const corsHeaders = getCorsHeaders(request, TEST_EMAIL_METHODS);
  const baseHeaders = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...corsHeaders
  };

  if (auth.misconfigured) {
    return new Response(
      JSON.stringify({ error: 'CRM authentication is not configured.' }),
      { status: 503, headers: baseHeaders }
    );
  }

  if (!auth.authenticated) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: baseHeaders }
    );
  }

  const resendKey = typeof env.RESEND_API_KEY === 'string' ? env.RESEND_API_KEY.trim() : '';
  if (!resendKey) {
    return new Response(
      JSON.stringify({
        error: 'RESEND_API_KEY is not defined in Cloudflare environment variables.'
      }),
      { status: 400, headers: baseHeaders }
    );
  }

  const fromAddress = env.RESEND_FROM || 'G3Z CRM <notifications@g3zcreative.com>';
  const targetEmail = env.NOTIFICATION_EMAIL || 'chris@g3zcreative.com';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [targetEmail],
        subject: '🧪 G3Z CRM Test Email Verification',
        html: '<div style="font-family:sans-serif; padding:20px; background:#0b0f17; color:white; border-radius:8px;"><h2>🧪 Test Notification</h2><p>If you received this, your Resend email setup on G3Z CRM is 100% active and functioning!</p></div>'
      })
    });

    const resendStatus = res.status;
    const resendBody = await res.json().catch(() => ({}));

    return new Response(
      JSON.stringify(
        {
          success: res.ok,
          resendStatus,
          fromAddress,
          targetEmail,
          resendResponse: resendBody
        },
        null,
        2
      ),
      {
        status: res.ok ? 200 : 400,
        headers: baseHeaders
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ error: 'Failed to send test email via Resend.' }),
      { status: 500, headers: baseHeaders }
    );
  }
}

export async function onRequest(context) {
  const method = context.request.method.toUpperCase();
  if (method === 'OPTIONS') return onRequestOptions(context);
  if (method === 'POST') return onRequestPost(context);
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': TEST_EMAIL_METHODS,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(context.request, TEST_EMAIL_METHODS)
    }
  });
}
