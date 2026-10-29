(() => {
  'use strict';

  const configEndpoint = '/api/posthog-config';
  const isDevelopment = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const logsEnvironment = isDevelopment ? 'development' : 'production';

  fetch(configEndpoint)
    .then((response) => response.ok ? response.json() : {})
    .then((config) => {
      if (!config.key) {
        if (isDevelopment) {
          throw new Error('POSTHOG_KEY variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_KEY is configured');
        }
        return;
      }

      if (!config.host) {
        if (isDevelopment) {
          throw new Error('POSTHOG_HOST variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once POSTHOG_HOST is configured');
        }
        return;
      }

      const script = document.createElement('script');
      script.async = true;
      script.src = `${config.host.replace('.i.posthog.com', '-assets.i.posthog.com')}/static/array.js`;
      script.onload = () => {
        window.posthog.init(config.key, {
          api_host: config.host,
          defaults: '2026-08-30',
          capture_exceptions: {
            capture_unhandled_errors: true,
            capture_unhandled_rejections: true,
            capture_console_errors: false
          },
          logs: {
            serviceName: 'g3zcreative-web',
            environment: logsEnvironment
          }
        });
        window.posthog.logger.info('PostHog web logger initialized', {
          component: 'posthog_initializer',
          environment: logsEnvironment
        });
        document.dispatchEvent(new CustomEvent('posthog:ready', { detail: window.posthog }));
      };
      document.head.appendChild(script);
    })
    .catch((error) => {
      if (isDevelopment) throw error;
    });
})();
