import { browser } from '$app/environment';
import { env } from '$env/dynamic/public';
import type { PostHog } from 'posthog-js';

let client: PostHog | null = null;
let ready: Promise<void> | null = null;

export function initAnalytics() {
	const key = env.PUBLIC_POSTHOG_KEY;
	if (!browser || !key || ready) return;
	ready = import('posthog-js').then(({ default: posthog }) => {
		posthog.init(key, {
			api_host: env.PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
			capture_pageview: 'history_change',
			person_profiles: 'identified_only'
		});
		client = posthog;
	});
}

export function track(event: string, properties?: Record<string, unknown>) {
	if (!browser || !ready) return;
	void ready.then(() => client?.capture(event, properties));
}
