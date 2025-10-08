export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerOTel } = await import('@vercel/otel');
    const { HttpInstrumentation } = await import('@opentelemetry/instrumentation-http');

    registerOTel({
      serviceName: 'liquidium-staking',
      instrumentations: [new HttpInstrumentation()],
    });
  }
}

export const onRequestError = async (err: Error, request: Request) => {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    try {
      const { getPostHogServer } = require('./src/app/posthog-server');
      const posthog = await getPostHogServer();

      let distinctId: string | undefined;
      const cookieHeader = request.headers.get('cookie');
      if (cookieHeader) {
        const match = cookieHeader.match(/ph_phc_.*?_posthog=([^;]+)/);
        if (match && match[1]) {
          try {
            const decoded = decodeURIComponent(match[1]);
            const data = JSON.parse(decoded);
            if (data?.distinct_id && typeof data.distinct_id === 'string') {
              distinctId = data.distinct_id;
            }
          } catch {
            // ignore cookie parse errors
          }
        }
      }

      await posthog.captureException(err, distinctId);
    } catch {
      // Avoid throwing from the error handler
    }
  }
};
