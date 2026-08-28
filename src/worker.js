/**
 * Cloudflare Worker Router for G3Z Creative
 * Handles /api/leads, /api/crm/* and delegates all other requests to static assets.
 */

import * as leadsApi from '../functions/api/leads.js';
import * as authApi from '../functions/api/crm/auth.js';
import * as crmLeadsApi from '../functions/api/crm/leads.js';
import * as crmLeadDetailApi from '../functions/api/crm/leads/[id].js';
import * as crmNotesApi from '../functions/api/crm/leads/[id]/notes.js';
import * as crmExportApi from '../functions/api/crm/export.js';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    const method = request.method.toUpperCase();

    // 1. Route API requests
    if (pathname.startsWith('/api/')) {
      const context = { request, env, ctx, params: {} };

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
      return env.ASSETS.fetch(request);
    }

    return new Response('Not Found', { status: 404 });
  }
};
