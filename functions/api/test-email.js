export async function onRequest(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const passcode = url.searchParams.get('passcode');

  if (passcode !== (env.CRM_PASSCODE || 'g3z2026')) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const resendKey = env.RESEND_API_KEY;
  if (!resendKey) {
    return new Response(JSON.stringify({
      error: 'RESEND_API_KEY is not defined in Cloudflare environment variables.',
      envKeysAvailable: Object.keys(env).filter(k => !k.startsWith('__'))
    }, null, 2), {
      status: 400,
      headers: { 'Content-Type': 'application/json' }
    });
  }

  const maskedKey = resendKey.substring(0, 5) + '...' + resendKey.substring(resendKey.length - 4);
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

    return new Response(JSON.stringify({
      success: res.ok,
      resendStatus,
      maskedKey,
      fromAddress,
      targetEmail,
      resendResponse: resendBody
    }, null, 2), {
      status: res.ok ? 200 : 400,
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message, stack: err.stack }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
}