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
			plugins: [],
			// { ...threeMinifier(), enforce: "pre" },
			ssr: { noExternal: ['three', 'troika-three-text'] },

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
					'/work/yellow-canteen',
					'/work/anti-hate-keyboard',
					'/work/lakra',
					'/work/creaid',
					'/work/arcteryx',
					'/work/tremors',
					'/work/jack-the-clipper',
					'/work/creta-black'
				]
			}
		}),
		mkcert(),
		devtoolsJson(),
		tailwindcss()
	],
	server: { proxy: {} }
});
