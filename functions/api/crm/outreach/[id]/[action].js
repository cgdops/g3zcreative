/**
 * Cloudflare Pages Function route for /api/crm/outreach/:id/:action
 * Supports POST /api/crm/outreach/:id/enrich, /promote, and /send_email
 * by delegating to the parent [id].js handler (which reads params.id and params.action).
 */

export { onRequestOptions, onRequestPost } from '../[id].js';
