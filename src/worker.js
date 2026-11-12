/**
 * Cloudflare Worker Router for G3Z Creative
 * Handles /api/leads, /api/posthog-config, /api/test-email, /api/crm/*
 * and delegates all other requests to static assets.
 */

import * as leadsApi from '../functions/api/leads.js';
import * as authApi from '../functions/api/crm/auth.js';
import * as crmLeadsApi from '../functions/api/crm/leads.js';
import * as crmLeadDetailApi from '../functions/api/crm/leads/[id].js';
import * as crmNotesApi from '../functions/api/crm/leads/[id]/notes.js';
import * as crmEnrichApi from '../functions/api/crm/leads/[id]/enrich.js';
import * as crmExportApi from '../functions/api/crm/export.js';
import * as crmOutreachApi from '../functions/api/crm/outreach/index.js';
import * as crmOutreachDetailApi from '../functions/api/crm/outreach/[id].js';
import * as crmOutreachActionApi from '../functions/api/crm/outreach/[id]/[action].js';
import * as posthogConfigApi from '../functions/api/posthog-config.js';
import * as testEmailApi from '../functions/api/test-email.js';

function safeDecodeParam(raw) {
  try {
    return { ok: true, value: decodeURIComponent(raw) };
  } catch {
    return { ok: false, value: null };
  }
}

function badRequestResponse(request, message = 'Malformed URL parameter') {
  return new Response(JSON.stringify({ error: message }), {
    status: 400,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...authApi.getCorsHeaders(request)
    }
  });
}

function methodNotAllowedResponse(request, allowedMethods) {
  return new Response(JSON.stringify({ error: 'Method not allowed' }), {
    status: 405,
    headers: {
      'Content-Type': 'application/json',
      'Allow': allowedMethods,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...authApi.getCorsHeaders(request, allowedMethods)
    }
  });
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Route API requests
    if (pathname.startsWith('/api/')) {
      const context = {
        request,
        env,
        ctx,
        params: {},
        waitUntil: (p) =>
          ctx && typeof ctx.waitUntil === 'function' ? ctx.waitUntil(p) : Promise.resolve(p),
        passThroughOnException: () => {
          if (ctx && typeof ctx.passThroughOnException === 'function') {
            ctx.passThroughOnException();
          }
        }
      };

      // /api/posthog-config
      if (pathname === '/api/posthog-config' || pathname === '/api/posthog-config/') {
        if (method === 'OPTIONS') {
          return new Response(null, {
            status: 204,
            headers: { 'Allow': 'GET, OPTIONS', 'X-Content-Type-Options': 'nosniff' }
          });
        }
        if (method === 'GET') return posthogConfigApi.onRequestGet(context);
        return methodNotAllowedResponse(request, 'GET, OPTIONS');
      }

      // /api/leads
      if (pathname === '/api/leads' || pathname === '/api/leads/') {
        if (method === 'OPTIONS') return leadsApi.onRequestOptions(context);
        if (method === 'POST') return leadsApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'POST, OPTIONS');
      }

      // /api/test-email (POST and OPTIONS only — no GET dispatch)
      if (pathname === '/api/test-email' || pathname === '/api/test-email/') {
        if (method === 'OPTIONS') return testEmailApi.onRequestOptions(context);
        if (method === 'POST') return testEmailApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'POST, OPTIONS');
      }

      // /api/crm/auth
      if (pathname === '/api/crm/auth' || pathname === '/api/crm/auth/') {
        if (method === 'OPTIONS') return authApi.onRequestOptions(context);
        if (method === 'GET') return authApi.onRequestGet(context);
        if (method === 'POST') return authApi.onRequestPost(context);
        if (method === 'DELETE') return authApi.onRequestDelete(context);
        return methodNotAllowedResponse(request, 'GET, POST, DELETE, OPTIONS');
      }

      // /api/crm/export
      if (pathname === '/api/crm/export' || pathname === '/api/crm/export/') {
        if (method === 'OPTIONS') {
          return typeof crmExportApi.onRequestOptions === 'function'
            ? crmExportApi.onRequestOptions(context)
            : authApi.handleCorsOptions(request, 'GET, OPTIONS');
        }
        if (method === 'GET') return crmExportApi.onRequestGet(context);
        return methodNotAllowedResponse(request, 'GET, OPTIONS');
      }

      // /api/crm/outreach
      if (pathname === '/api/crm/outreach' || pathname === '/api/crm/outreach/') {
        if (method === 'OPTIONS') return crmOutreachApi.onRequestOptions(context);
        if (method === 'GET') return crmOutreachApi.onRequestGet(context);
        if (method === 'POST') return crmOutreachApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'GET, POST, OPTIONS');
      }

      // /api/crm/outreach/:id/:action
      const outreachActionMatch = pathname.match(/^\/api\/crm\/outreach\/([^\/]+)\/([^\/]+)\/?$/);
      if (outreachActionMatch) {
        const decodedId = safeDecodeParam(outreachActionMatch[1]);
        const decodedAction = safeDecodeParam(outreachActionMatch[2]);
        if (!decodedId.ok || !decodedAction.ok) return badRequestResponse(request);
        context.params.id = decodedId.value;
        context.params.action = decodedAction.value;
        if (method === 'OPTIONS') return crmOutreachActionApi.onRequestOptions(context);
        if (method === 'POST') return crmOutreachActionApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'POST, OPTIONS');
      }

      // /api/crm/outreach/:id
      const outreachMatch = pathname.match(/^\/api\/crm\/outreach\/([^\/]+)\/?$/);
      if (outreachMatch) {
        const decodedId = safeDecodeParam(outreachMatch[1]);
        if (!decodedId.ok) return badRequestResponse(request);
        context.params.id = decodedId.value;
        if (method === 'OPTIONS') return crmOutreachDetailApi.onRequestOptions(context);
        if (method === 'GET') return crmOutreachDetailApi.onRequestGet(context);
        if (method === 'POST') return crmOutreachDetailApi.onRequestPost(context);
        if (method === 'PATCH') return crmOutreachDetailApi.onRequestPatch(context);
        if (method === 'DELETE') return crmOutreachDetailApi.onRequestDelete(context);
        return methodNotAllowedResponse(request, 'GET, POST, PATCH, DELETE, OPTIONS');
      }

      // /api/crm/leads
      if (pathname === '/api/crm/leads' || pathname === '/api/crm/leads/') {
        if (method === 'OPTIONS') return crmLeadsApi.onRequestOptions(context);
        if (method === 'GET') return crmLeadsApi.onRequestGet(context);
        if (method === 'POST') return crmLeadsApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'GET, POST, OPTIONS');
      }

      // /api/crm/leads/:id/notes
      const notesMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/notes\/?$/);
      if (notesMatch) {
        const decodedId = safeDecodeParam(notesMatch[1]);
        if (!decodedId.ok) return badRequestResponse(request);
        context.params.id = decodedId.value;
        if (method === 'OPTIONS') return crmNotesApi.onRequestOptions(context);
        if (method === 'POST') return crmNotesApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'POST, OPTIONS');
      }

      // /api/crm/leads/:id/enrich
      const enrichMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/enrich\/?$/);
      if (enrichMatch) {
        const decodedId = safeDecodeParam(enrichMatch[1]);
        if (!decodedId.ok) return badRequestResponse(request);
        context.params.id = decodedId.value;
        if (method === 'OPTIONS') return crmEnrichApi.onRequestOptions(context);
        if (method === 'POST') return crmEnrichApi.onRequestPost(context);
        return methodNotAllowedResponse(request, 'POST, OPTIONS');
      }

      // /api/crm/leads/:id
      const leadMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/?$/);
      if (leadMatch) {
        const decodedId = safeDecodeParam(leadMatch[1]);
        if (!decodedId.ok) return badRequestResponse(request);
        context.params.id = decodedId.value;
        if (method === 'OPTIONS') return crmLeadDetailApi.onRequestOptions(context);
        if (method === 'GET') return crmLeadDetailApi.onRequestGet(context);
        if (method === 'PATCH') return crmLeadDetailApi.onRequestPatch(context);
        if (method === 'DELETE') return crmLeadDetailApi.onRequestDelete(context);
        return methodNotAllowedResponse(request, 'GET, PATCH, DELETE, OPTIONS');
      }

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          'X-Content-Type-Options': 'nosniff',
          ...authApi.getCorsHeaders(request)
        }
      });
    }

    // 2. Delegate all other requests to static assets
    if (env.ASSETS) {
      const assetResponse = await env.ASSETS.fetch(request);
      const contentType = assetResponse.headers.get('content-type') || '';

      if (!contentType.includes('text/html')) return assetResponse;

      const html = await assetResponse.text();
      const headers = new Headers(assetResponse.headers);
      headers.delete('content-length');
      return new Response(html.replace('<head>', '<head><script src="/js/posthog.js" defer></script>'), {
        status: assetResponse.status,
        statusText: assetResponse.statusText,
        headers
      });
    }

    return new Response('Not Found', { status: 404 });
  }
};
