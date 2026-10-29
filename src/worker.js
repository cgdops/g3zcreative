/**
 * Cloudflare Worker Router for G3Z Creative
 * Handles /api/leads, /api/crm/* and delegates all other requests to static assets.
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
import * as posthogConfigApi from '../functions/api/posthog-config.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Route API requests
    if (pathname.startsWith('/api/')) {
      const context = { request, env, ctx, params: {} };

      // /api/posthog-config
      if (pathname === '/api/posthog-config' || pathname === '/api/posthog-config/') {
        if (method === 'GET') return posthogConfigApi.onRequestGet(context);
      }

      // /api/leads
      if (pathname === '/api/leads' || pathname === '/api/leads/') {
        if (method === 'OPTIONS') return leadsApi.onRequestOptions(context);
        if (method === 'POST') return leadsApi.onRequestPost(context);
      }

      // /api/crm/auth
      if (pathname === '/api/crm/auth' || pathname === '/api/crm/auth/') {
        if (method === 'OPTIONS') return authApi.onRequestOptions(context);
        if (method === 'GET') return authApi.onRequestGet(context);
        if (method === 'POST') return authApi.onRequestPost(context);
      }

      // /api/crm/export
      if (pathname === '/api/crm/export' || pathname === '/api/crm/export/') {
        if (method === 'GET') return crmExportApi.onRequestGet(context);
      }

      // /api/crm/outreach
      if (pathname === '/api/crm/outreach' || pathname === '/api/crm/outreach/') {
        if (method === 'OPTIONS') return crmOutreachApi.onRequestOptions(context);
        if (method === 'GET') return crmOutreachApi.onRequestGet(context);
        if (method === 'POST') return crmOutreachApi.onRequestPost(context);
      }

      // /api/crm/outreach/:id/:action
      const outreachActionMatch = pathname.match(/^\/api\/crm\/outreach\/([^\/]+)\/([^\/]+)\/?$/);
      if (outreachActionMatch) {
        context.params.id = decodeURIComponent(outreachActionMatch[1]);
        context.params.action = outreachActionMatch[2];
        if (method === 'OPTIONS') return crmOutreachDetailApi.onRequestOptions(context);
        if (method === 'POST') return crmOutreachDetailApi.onRequestPost(context);
      }

      // /api/crm/outreach/:id
      const outreachMatch = pathname.match(/^\/api\/crm\/outreach\/([^\/]+)\/?$/);
      if (outreachMatch) {
        context.params.id = decodeURIComponent(outreachMatch[1]);
        if (method === 'OPTIONS') return crmOutreachDetailApi.onRequestOptions(context);
        if (method === 'GET') return crmOutreachDetailApi.onRequestGet(context);
        if (method === 'POST') return crmOutreachDetailApi.onRequestPost(context);
        if (method === 'PATCH') return crmOutreachDetailApi.onRequestPatch(context);
        if (method === 'DELETE') return crmOutreachDetailApi.onRequestDelete(context);
      }

      // /api/crm/leads
      if (pathname === '/api/crm/leads' || pathname === '/api/crm/leads/') {
        if (method === 'OPTIONS') return crmLeadsApi.onRequestOptions(context);
        if (method === 'GET') return crmLeadsApi.onRequestGet(context);
        if (method === 'POST') return crmLeadsApi.onRequestPost(context);
      }

      // /api/crm/leads/:id/notes
      const notesMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/notes\/?$/);
      if (notesMatch) {
        context.params.id = notesMatch[1];
        if (method === 'OPTIONS') return crmNotesApi.onRequestOptions(context);
        if (method === 'POST') return crmNotesApi.onRequestPost(context);
      }

      // /api/crm/leads/:id/enrich
      const enrichMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/enrich\/?$/);
      if (enrichMatch) {
        context.params.id = enrichMatch[1];
        if (method === 'OPTIONS') return crmEnrichApi.onRequestOptions(context);
        if (method === 'POST') return crmEnrichApi.onRequestPost(context);
      }

      // /api/crm/leads/:id
      const leadMatch = pathname.match(/^\/api\/crm\/leads\/([^\/]+)\/?$/);
      if (leadMatch) {
        context.params.id = leadMatch[1];
        if (method === 'OPTIONS') return crmLeadDetailApi.onRequestOptions(context);
        if (method === 'GET') return crmLeadDetailApi.onRequestGet(context);
        if (method === 'PATCH') return crmLeadDetailApi.onRequestPatch(context);
        if (method === 'DELETE') return crmLeadDetailApi.onRequestDelete(context);
      }

      return new Response(JSON.stringify({ error: 'Endpoint not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
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
