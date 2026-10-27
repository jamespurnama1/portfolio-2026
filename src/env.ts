import { defineEnvVars } from '@sveltejs/kit/env';

// @migration-task Review usage of dynamic environment variables. They fall back to the empty string if not present, which may not be what you want.
export const variables = defineEnvVars({
	OPENAI_API_KEY: { static: true },
	GMAIL_SEND: { static: true },
	GMAIL_PASSWORD: { static: true },
	PROMPT_ID: { static: true },
	PUBLIC_POSTHOG_KEY: { public: true, schema: (input) => input ?? '' },
	PUBLIC_POSTHOG_HOST: { public: true, schema: (input) => input ?? '' },
	SANITY_PROJECT_ID: { static: true },
	SANITY_DATASET: { static: true }
});
