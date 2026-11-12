/**
 * CRM Authentication, HMAC-SHA256 Session Management, Rate Limiting, CSRF & Strict Origin CORS
 * GET     /api/crm/auth (Check session status — always 200 { authenticated, user })
 * POST    /api/crm/auth (Verify passcode in constant time, rate-limit failures & set HttpOnly signed cookie)
 * DELETE  /api/crm/auth (Expire session cookie server-side)
 * OPTIONS /api/crm/auth (Strict Origin-validated CORS preflight)
 */

const SESSION_COOKIE_NAME = 'g3z_crm_auth';
const SESSION_MAX_AGE_SECONDS = 2592000; // 30 days
const AUTH_METHODS = 'GET, POST, DELETE, OPTIONS';
const ALLOWED_PROD_ORIGINS = new Set([
  'https://g3zcreative.com',
  'https://www.g3zcreative.com'
]);

const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes (900 seconds)
const RATE_LIMIT_MAX_FAILURES = 10;
const RATE_LIMIT_MAX_KEYS = 2000;
const failedAuthByIp = new Map();

const encoder = new TextEncoder();
const utf8Decoder = new TextDecoder('utf-8', { fatal: true });

/**
 * Extract client IP from Cloudflare or proxy headers for isolate-level brute-force rate limiting.
 */
function getClientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp && cfIp.trim()) return cfIp.trim();
  const xff = request.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first;
  }
  return 'local';
}

/**
 * Check sliding-window failure count for `ip` without incrementing.
 */
function checkRateLimitForIp(ip, nowMs = Date.now()) {
  const entry = failedAuthByIp.get(ip);
  if (!entry) {
    return { limited: false, remainingSec: 0, failures: 0 };
  }
  const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;
  const recent = entry.filter((ts) => ts > cutoff);
  if (recent.length === 0) {
    failedAuthByIp.delete(ip);
    return { limited: false, remainingSec: 0, failures: 0 };
  }
  if (recent.length !== entry.length) {
    failedAuthByIp.set(ip, recent);
  }
  if (recent.length >= RATE_LIMIT_MAX_FAILURES) {
    const oldestInWindow = recent[0];
    const remainingSec = Math.max(
      1,
      Math.ceil((oldestInWindow + RATE_LIMIT_WINDOW_MS - nowMs) / 1000)
    );
    return { limited: true, remainingSec, failures: recent.length };
  }
  return { limited: false, remainingSec: 0, failures: recent.length };
}

/**
 * Record a failed passcode or API-key attempt for `ip` (bounded to RATE_LIMIT_MAX_KEYS entries).
 */
function recordAuthFailureForIp(ip, nowMs = Date.now()) {
  const cutoff = nowMs - RATE_LIMIT_WINDOW_MS;
  if (!failedAuthByIp.has(ip) && failedAuthByIp.size >= RATE_LIMIT_MAX_KEYS) {
    for (const [key, timestamps] of failedAuthByIp.entries()) {
      if (!timestamps.some((ts) => ts > cutoff)) {
        failedAuthByIp.delete(key);
      }
    }
    if (failedAuthByIp.size >= RATE_LIMIT_MAX_KEYS) {
      const oldestKey = failedAuthByIp.keys().next().value;
      if (oldestKey !== undefined) {
        failedAuthByIp.delete(oldestKey);
      }
    }
  }
  const existing = (failedAuthByIp.get(ip) || []).filter((ts) => ts > cutoff);
  existing.push(nowMs);
  failedAuthByIp.set(ip, existing);
}

/**
 * Clear failure counter for `ip` upon valid login.
 */
function clearAuthFailuresForIp(ip) {
  failedAuthByIp.delete(ip);
}

/**
 * Reset in-memory failed-auth map (exported for deterministic test isolation).
 */
export function resetAuthRateLimiter() {
  failedAuthByIp.clear();
}

/**
 * Extract trimmed CRM passcode from environment bindings.
 * Returns null if unset, non-string, or whitespace-only (fail-closed).
 */
function getConfiguredPasscode(env) {
  if (!env || typeof env.CRM_PASSCODE !== 'string') {
    return null;
  }
  const trimmed = env.CRM_PASSCODE.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Encode Uint8Array bytes to canonical RFC 4648 Base64URL (unpadded).
 */
function bytesToBase64Url(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary)
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Strictly decode canonical RFC 4648 Base64URL string to Uint8Array, or return null if malformed
 * or non-canonical (eliminates trailing padding bit malleability).
 */
function base64UrlToBytes(b64url) {
  if (typeof b64url !== 'string' || b64url.length === 0 || b64url.length % 4 === 1) {
    return null;
  }
  if (!/^[A-Za-z0-9\-_]+$/.test(b64url)) {
    return null;
  }
  try {
    const base64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
    const padLen = (4 - (base64.length % 4)) % 4;
    const padded = base64 + '='.repeat(padLen);
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    if (bytesToBase64Url(bytes) !== b64url) {
      return null;
    }
    return bytes;
  } catch {
    return null;
  }
}

/**
 * Constant-time string comparison using Web Crypto HMAC-SHA256 digest normalization.
 * Hashing both inputs normalizes byte length to 32 bytes so secret length is never leaked.
 */
export async function timingSafeEqualStr(a, b, secretKeyMaterial = 'g3z-crm-timing-safe-v1') {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const keyBytes = encoder.encode(`g3z-crm-timing-v1:${String(secretKeyMaterial || 'default')}`);
  const key = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );

  const [sigA, sigB] = await Promise.all([
    crypto.subtle.sign('HMAC', key, encoder.encode(a)),
    crypto.subtle.sign('HMAC', key, encoder.encode(b))
  ]);

  const d1 = new Uint8Array(sigA);
  const d2 = new Uint8Array(sigB);
  if (d1.byteLength !== 32 || d2.byteLength !== 32) {
    return false;
  }

  let diff = 0;
  for (let i = 0; i < 32; i++) {
    diff |= d1[i] ^ d2[i];
  }
  return diff === 0;
}

/**
 * Derive Web Crypto HMAC-SHA256 key for session signing/verification.
 */
async function importSessionHmacKey(passcode, usages) {
  const keyMaterial = encoder.encode(`g3z-crm-session-v1:${passcode.trim()}`);
  return crypto.subtle.importKey(
    'raw',
    keyMaterial,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    usages
  );
}

/**
 * Mint an HMAC-SHA256 signed session token: <payloadB64Url>.<sigB64Url>
 */
export async function issueSessionToken(
  passcode,
  sub = 'Christian (Admin)',
  ttlSeconds = SESSION_MAX_AGE_SECONDS
) {
  const nowSec = Math.floor(Date.now() / 1000);
  const payload = {
    sub,
    iat: nowSec,
    exp: nowSec + ttlSeconds,
    v: 1
  };
  const payloadB64Url = bytesToBase64Url(encoder.encode(JSON.stringify(payload)));
  const cryptoKey = await importSessionHmacKey(passcode, ['sign']);
  const sigBuf = await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(payloadB64Url));
  const sigB64Url = bytesToBase64Url(new Uint8Array(sigBuf));
  return `${payloadB64Url}.${sigB64Url}`;
}

/**
 * Verify an HMAC-SHA256 signed session token and validate expiration/lifetime claims.
 * Returns the parsed payload object if valid, or null otherwise.
 */
export async function verifySessionToken(token, passcode) {
  if (
    typeof token !== 'string' ||
    token.length === 0 ||
    token.length > 2048 ||
    typeof passcode !== 'string' ||
    !passcode.trim()
  ) {
    return null;
  }

  const parts = token.split('.');
  if (parts.length !== 2) {
    return null;
  }

  const [payloadB64Url, sigB64Url] = parts;
  if (!payloadB64Url || !sigB64Url) {
    return null;
  }

  const sigBytes = base64UrlToBytes(sigB64Url);
  if (!sigBytes || sigBytes.byteLength !== 32) {
    return null;
  }

  const payloadBytes = base64UrlToBytes(payloadB64Url);
  if (!payloadBytes) {
    return null;
  }

  const cryptoKey = await importSessionHmacKey(passcode, ['verify']);
  const isValidSig = await crypto.subtle.verify(
    'HMAC',
    cryptoKey,
    sigBytes,
    encoder.encode(payloadB64Url)
  );
  if (!isValidSig) {
    return null;
  }

  try {
    const jsonText = utf8Decoder.decode(payloadBytes);
    const payload = JSON.parse(jsonText);
    const nowSec = Math.floor(Date.now() / 1000);

    if (
      !payload ||
      typeof payload !== 'object' ||
      payload.v !== 1 ||
      typeof payload.sub !== 'string' ||
      !payload.sub.trim() ||
      typeof payload.iat !== 'number' ||
      !Number.isFinite(payload.iat) ||
      payload.iat <= 0 ||
      payload.iat > nowSec + 60 ||
      typeof payload.exp !== 'number' ||
      !Number.isFinite(payload.exp) ||
      payload.exp <= nowSec ||
      payload.exp <= payload.iat ||
      payload.exp - payload.iat > SESSION_MAX_AGE_SECONDS + 60
    ) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Parse Cookie header and extract decoded values matching `cookieName` (bounded to 4 entries).
 */
function extractCookieValues(cookieHeader, cookieName) {
  if (!cookieHeader || typeof cookieHeader !== 'string') {
    return [];
  }
  const values = [];
  const pairs = cookieHeader.split(';');
  for (const rawPair of pairs) {
    const eqIdx = rawPair.indexOf('=');
    if (eqIdx === -1) continue;
    const name = rawPair.slice(0, eqIdx).trim();
    if (name !== cookieName) continue;
    let rawVal = rawPair.slice(eqIdx + 1).trim();
    if (rawVal.length >= 2 && rawVal.startsWith('"') && rawVal.endsWith('"')) {
      rawVal = rawVal.slice(1, -1);
    }
    try {
      values.push(decodeURIComponent(rawVal));
    } catch {
      values.push(rawVal);
    }
    if (values.length >= 4) break;
  }
  return values;
}

/**
 * Verify request authentication via X-CRM-Key, Authorization Bearer, or signed HttpOnly cookie.
 * Fails closed immediately if env.CRM_PASSCODE is unset or empty.
 * Applies per-IP brute-force rate limiting to failed header credential attempts.
 */
export async function checkAuth(request, env) {
  const expectedPasscode = getConfiguredPasscode(env);
  if (!expectedPasscode) {
    return { authenticated: false, user: null, misconfigured: true };
  }

  const rawCrmKey = request.headers.get('x-crm-key');
  const authHeader = request.headers.get('authorization');
  const hasExplicitKeyOrBearer = Boolean(
    (rawCrmKey && rawCrmKey.trim().length > 0) ||
      (authHeader && /^Bearer\s+\S+/i.test(authHeader))
  );

  if (hasExplicitKeyOrBearer) {
    const clientIp = getClientIp(request);
    const rl = checkRateLimitForIp(clientIp);
    if (rl.limited) {
      return {
        authenticated: false,
        user: null,
        rateLimited: true,
        retryAfter: rl.remainingSec
      };
    }

    // 1. Check X-CRM-Key header (raw API key or signed session token)
    if (rawCrmKey && rawCrmKey.trim().length > 0 && rawCrmKey.length <= 2048) {
      const candidateKey = rawCrmKey.trim();
      const isApiKey = await timingSafeEqualStr(
        candidateKey,
        expectedPasscode,
        `apikey:${expectedPasscode}`
      );
      if (isApiKey) {
        return { authenticated: true, user: 'Christian (Admin)', method: 'api-key' };
      }
      const tokenPayload = await verifySessionToken(candidateKey, expectedPasscode);
      if (tokenPayload) {
        return { authenticated: true, user: tokenPayload.sub, method: 'bearer-token' };
      }
    }

    // 2. Check Authorization: Bearer <token-or-key>
    if (authHeader && authHeader.length <= 2100) {
      const bearerMatch = authHeader.match(/^Bearer\s+(\S+)$/i);
      if (bearerMatch) {
        const bearerVal = bearerMatch[1].trim();
        const tokenPayload = await verifySessionToken(bearerVal, expectedPasscode);
        if (tokenPayload) {
          return { authenticated: true, user: tokenPayload.sub, method: 'bearer-token' };
        }
        const isApiKey = await timingSafeEqualStr(
          bearerVal,
          expectedPasscode,
          `apikey:${expectedPasscode}`
        );
        if (isApiKey) {
          return { authenticated: true, user: 'Christian (Admin)', method: 'api-key' };
        }
      }
    }

    // Explicit header credential failed verification — record failed attempt
    recordAuthFailureForIp(clientIp);
  }

  // 3. Check HMAC-SHA256 signed session cookie (raw passcode is NEVER accepted in cookies)
  const cookieHeader = request.headers.get('cookie') || '';
  const cookieCandidates = extractCookieValues(cookieHeader, SESSION_COOKIE_NAME);
  for (const cookieToken of cookieCandidates) {
    const payload = await verifySessionToken(cookieToken, expectedPasscode);
    if (payload) {
      return { authenticated: true, user: payload.sub, method: 'cookie' };
    }
  }

  return { authenticated: false, user: null };
}

/**
 * Validate request Origin header against same-origin, canonical g3zcreative.com domains,
 * or localhost/127.0.0.1 strictly when serving on localhost/127.0.0.1.
 */
export function isOriginAllowed(request) {
  const origin = request.headers.get('Origin');
  if (!origin) {
    return { hasOrigin: false, allowed: true, origin: null };
  }

  try {
    const reqUrl = new URL(request.url);
    const originUrl = new URL(origin);
    const normalizedOrigin = originUrl.origin;

    if (origin !== normalizedOrigin) {
      return { hasOrigin: true, allowed: false, origin };
    }

    if (normalizedOrigin === reqUrl.origin || ALLOWED_PROD_ORIGINS.has(normalizedOrigin)) {
      return { hasOrigin: true, allowed: true, origin: normalizedOrigin };
    }

    const isLocalHostTarget =
      reqUrl.hostname === 'localhost' || reqUrl.hostname === '127.0.0.1';
    const isLocalOrigin =
      (originUrl.protocol === 'http:' || originUrl.protocol === 'https:') &&
      (originUrl.hostname === 'localhost' || originUrl.hostname === '127.0.0.1');

    if (isLocalHostTarget && isLocalOrigin) {
      return { hasOrigin: true, allowed: true, origin: normalizedOrigin };
    }

    return { hasOrigin: true, allowed: false, origin };
  } catch {
    return { hasOrigin: true, allowed: false, origin };
  }
}

/**
 * Verify CSRF safety for state-changing requests:
 * - Always rejects disallowed Origin headers.
 * - For cookie-authenticated or pre-auth (`/api/crm/auth` POST/DELETE) requests, requires
 *   `(originCheck.hasOrigin && originCheck.allowed) || secFetchSite === 'same-origin'`
 *   AND `secFetchSite !== 'cross-site'`, blocking cross-site/cross-subdomain simple POSTs
 *   that strip or omit Origin.
 */
export function verifyCsrf(request, authResult = null) {
  const originCheck = isOriginAllowed(request);
  if (originCheck.hasOrigin && !originCheck.allowed) {
    return { ok: false, status: 403, error: 'Cross-origin request forbidden.' };
  }

  if (!authResult || authResult.method === 'cookie') {
    const secFetchSite = (request.headers.get('Sec-Fetch-Site') || '').trim().toLowerCase();
    if (secFetchSite === 'cross-site') {
      return { ok: false, status: 403, error: 'Cross-site request forbidden.' };
    }
    const hasTrustedOrigin = originCheck.hasOrigin && originCheck.allowed;
    const isSameOriginFetch = secFetchSite === 'same-origin';
    if (!hasTrustedOrigin && !isSameOriginFetch) {
      return {
        ok: false,
        status: 403,
        error: 'Missing trusted Origin header for state-changing request.'
      };
    }
  }

  return { ok: true };
}

/**
 * Build strict CORS response headers. Never emits wildcard `*` or untrusted credentials.
 */
export function getCorsHeaders(request, methods = 'GET, POST, PATCH, DELETE, OPTIONS') {
  const { hasOrigin, allowed, origin } = isOriginAllowed(request);
  if (hasOrigin && allowed && origin) {
    return {
      'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'Content-Type, X-CRM-Key, Authorization',
      'Vary': 'Origin'
    };
  }
  return { 'Vary': 'Origin' };
}

/**
 * Handle CORS preflight OPTIONS requests, rejecting disallowed cross-origin preflights with 403.
 */
export function handleCorsOptions(request, methods = 'GET, POST, PATCH, DELETE, OPTIONS') {
  const { hasOrigin, allowed } = isOriginAllowed(request);
  if (hasOrigin && !allowed) {
    return new Response(null, {
      status: 403,
      headers: {
        'Vary': 'Origin',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
  return new Response(null, {
    status: 204,
    headers: {
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(request, methods)
    }
  });
}

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, AUTH_METHODS);
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const auth = await checkAuth(request, env);
  const body = auth.authenticated
    ? { authenticated: true, user: auth.user }
    : { authenticated: false, user: null };

  return new Response(JSON.stringify(body), {
    status: 200,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...getCorsHeaders(request, AUTH_METHODS)
    }
  });
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const csrf = verifyCsrf(request);
  if (!csrf.ok) {
    return new Response(
      JSON.stringify({ authenticated: false, error: csrf.error }),
      {
        status: csrf.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Vary': 'Origin'
        }
      }
    );
  }

  const expectedPasscode = getConfiguredPasscode(env);
  if (!expectedPasscode) {
    return new Response(
      JSON.stringify({ authenticated: false, error: 'CRM authentication is not configured.' }),
      {
        status: 503,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...getCorsHeaders(request, AUTH_METHODS)
        }
      }
    );
  }

  const clientIp = getClientIp(request);
  const rl = checkRateLimitForIp(clientIp);
  if (rl.limited) {
    return new Response(
      JSON.stringify({
        authenticated: false,
        error: 'Too many failed authentication attempts. Please try again later.'
      }),
      {
        status: 429,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Retry-After': String(rl.remainingSec),
          ...getCorsHeaders(request, AUTH_METHODS)
        }
      }
    );
  }

  try {
    let body = {};
    try {
      const parsed = await request.json();
      if (parsed && typeof parsed === 'object') {
        body = parsed;
      }
    } catch {
      body = {};
    }

    const rawPasscode =
      typeof body.passcode === 'string'
        ? body.passcode
        : typeof body.password === 'string'
          ? body.password
          : '';
    const candidate = rawPasscode.trim();
    const boundedCandidate = candidate.slice(0, 1024);

    const hashesMatch = await timingSafeEqualStr(
      boundedCandidate,
      expectedPasscode,
      `login:${expectedPasscode}`
    );
    const isValid = candidate.length > 0 && candidate.length <= 1024 && hashesMatch;

    if (isValid) {
      clearAuthFailuresForIp(clientIp);
      const token = await issueSessionToken(expectedPasscode, 'Christian (Admin)', SESSION_MAX_AGE_SECONDS);
      const cookieHeader = `${SESSION_COOKIE_NAME}=${token}; Path=/; Max-Age=${SESSION_MAX_AGE_SECONDS}; HttpOnly; Secure; SameSite=Lax`;

      return new Response(
        JSON.stringify({
          authenticated: true,
          user: 'Christian (Admin)'
        }),
        {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-store',
            'X-Content-Type-Options': 'nosniff',
            'Set-Cookie': cookieHeader,
            ...getCorsHeaders(request, AUTH_METHODS)
          }
        }
      );
    }

    recordAuthFailureForIp(clientIp);

    return new Response(
      JSON.stringify({
        authenticated: false,
        error: 'Invalid passcode. Please try again.'
      }),
      {
        status: 401,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...getCorsHeaders(request, AUTH_METHODS)
        }
      }
    );
  } catch {
    return new Response(
      JSON.stringify({ authenticated: false, error: 'Authentication service error.' }),
      {
        status: 500,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...getCorsHeaders(request, AUTH_METHODS)
        }
      }
    );
  }
}

export async function onRequestDelete(context) {
  const { request } = context;

  const csrf = verifyCsrf(request);
  if (!csrf.ok) {
    return new Response(
      JSON.stringify({ authenticated: false, error: csrf.error }),
      {
        status: csrf.status,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          'Vary': 'Origin'
        }
      }
    );
  }

  const expireCookie = `${SESSION_COOKIE_NAME}=; Path=/; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; Secure; SameSite=Lax`;

  return new Response(
    JSON.stringify({
      authenticated: false,
      user: null,
      loggedOut: true
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
        'Set-Cookie': expireCookie,
        ...getCorsHeaders(request, AUTH_METHODS)
      }
    }
  );
}
