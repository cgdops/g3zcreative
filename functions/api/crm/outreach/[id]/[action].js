/**
 * Cloudflare Pages Function route for /api/crm/outreach/:id/:action
 * Supports POST /api/crm/outreach/:id/enrich, /promote, and /send_email
 * with strict POST, OPTIONS preflight handling.
 */

import { handleCorsOptions } from '../../auth.js';

export async function onRequestOptions(context) {
  return handleCorsOptions(context.request, 'POST, OPTIONS');
}

export { onRequestPost } from '../[id].js';
