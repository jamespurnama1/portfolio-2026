import adapter from '@sveltejs/adapter-vercel';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [
		sveltekit({
			// Consult https://kit.svelte.dev/docs/integrations#preprocessors
			// for more information about preprocessors
			preprocess: vitePreprocess(),

			// adapter-auto only supports some environments, see https://kit.svelte.dev/docs/adapter-auto for a list.
			// If your environment is not supported, or you settled on a specific environment, switch out the adapter.
			// See https://kit.svelte.dev/docs/adapters for more information about adapters.
			adapter: adapter(),

			prerender: {
				// default: false,
				entries: [
					'/',
					'/about',
					'/branch',
					'/gallery',
					'/sitemap.xml',
					'/.well-known/ard.json',
					'/api/lite-about'
				]
			}
		}),
		mkcert(),
		devtoolsJson(),
		tailwindcss()
	],
	server: { proxy: {} },
	ssr: { noExternal: ['three', 'troika-three-text'] }
});
