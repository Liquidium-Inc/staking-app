import { PostHog } from 'posthog-node';

let posthogSingleton: PostHog | null = null;

export async function getPostHogServer(): Promise<PostHog> {
  if (!posthogSingleton) {
    const apiKey = process.env.NEXT_PUBLIC_POSTHOG_KEY;
    if (!apiKey) {
      throw new Error('NEXT_PUBLIC_POSTHOG_KEY is not set');
    }

    posthogSingleton = new PostHog(apiKey, {
      host: process.env.POSTHOG_SERVER_HOST || 'https://us.i.posthog.com',
      flushAt: 1,
      flushInterval: 0,
    });
  }

  return posthogSingleton;
}
