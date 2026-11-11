import { browser } from '$app/env';
import { PUBLIC_POSTHOG_KEY, PUBLIC_POSTHOG_HOST } from '$app/env/public';
import type { PostHog } from 'posthog-js';

let client: PostHog | null = null;
let ready: Promise<void> | null = null;

export function initAnalytics() {
	const key = PUBLIC_POSTHOG_KEY;
	if (!browser || !key || ready) return;
	ready = new Promise<void>((resolve) => {
		// Keep PostHog and its recorder off the critical path while the site loads.
		const start = () => setTimeout(resolve, 4000);
		if (document.readyState === 'complete') start();
		else window.addEventListener('load', start, { once: true });
	})
		.then(() => import('posthog-js'))
		.then(({ default: posthog }) => {
			posthog.init(key, {
				api_host: PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com',
				capture_pageview: 'history_change',
				person_profiles: 'identified_only',
				defaults: '2026-05-30'
			});
			client = posthog;
		});
}

export function track(event: string, properties?: Record<string, unknown>) {
	if (!browser || !ready) return;
	void ready.then(() => client?.capture(event, properties));
}
