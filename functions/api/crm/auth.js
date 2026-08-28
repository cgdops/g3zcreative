/**
 * CRM Authentication & Session Verification
 * POST /api/crm/auth (Login)
 * GET /api/crm/auth (Check session status)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
  'Access-Control-Allow-Credentials': 'true',
};

export function checkAuth(request, env) {
  // 1. Cloudflare Access / Zero Trust header
  const cfAccessEmail = request.headers.get('cf-access-authenticated-user-email');
  if (cfAccessEmail) {
    return { authenticated: true, user: cfAccessEmail, method: 'cf-access' };
  }

  const expectedPasscode = env.CRM_PASSCODE || 'g3z2026';

  // 2. Check X-CRM-Key header
  const authHeader = request.headers.get('x-crm-key') || request.headers.get('authorization')?.replace(/^Bearer\s+/i, '');
  if (authHeader && authHeader === expectedPasscode) {
    return { authenticated: true, user: 'Christian (Admin)', method: 'api-key' };
  }

  // 3. Check Cookie
  const cookieHeader = request.headers.get('cookie') || '';
  const match = cookieHeader.match(/g3z_crm_auth=([^;]+)/);
  if (match && decodeURIComponent(match[1]) === expectedPasscode) {
    return { authenticated: true, user: 'Christian (Admin)', method: 'cookie' };
  }

  return { authenticated: false, user: null };
}

export async function onRequestOptions() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = checkAuth(request, env);
  return new Response(JSON.stringify(auth), {
    status: auth.authenticated ? 200 : 401,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const body = await request.json().catch(() => ({}));
    const passcode = (body.passcode || body.password || '').trim();
    const expectedPasscode = env.CRM_PASSCODE || 'g3z2026';

    if (passcode === expectedPasscode) {
      // Set secure cookie valid for 30 days
      const cookieVal = encodeURIComponent(expectedPasscode);
      const isHttps = request.url.startsWith('https:');
      const cookieHeader = `g3z_crm_auth=${cookieVal}; Path=/; Max-Age=2592000; SameSite=Lax${isHttps ? '; Secure' : ''}`;

      return new Response(JSON.stringify({
        authenticated: true,
        user: 'Christian (Admin)',
        token: passcode
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
          'Set-Cookie': cookieHeader,
          ...CORS_HEADERS
        }
      });
    }

    return new Response(JSON.stringify({
      authenticated: false,
      error: 'Invalid passcode. Please try again.'
    }), {
      status: 401,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  } catch (error) {
    return new Response(JSON.stringify({ authenticated: false, error: error.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS }
    });
  }
}
