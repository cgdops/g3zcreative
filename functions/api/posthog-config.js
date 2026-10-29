/**
 * Returns the public PostHog browser configuration from Cloudflare environment
 * bindings. The project key is intentionally public; no private credentials are
 * exposed by this endpoint.
 */
export function onRequestGet({ env }) {
  return Response.json({
    key: env.POSTHOG_KEY ?? null,
    host: env.POSTHOG_HOST ?? null
  }, {
    headers: {
      'Cache-Control': 'public, max-age=300'
    }
  });
}
