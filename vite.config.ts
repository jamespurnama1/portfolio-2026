import devtoolsJson from 'vite-plugin-devtools-json';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';
import mkcert from 'vite-plugin-mkcert';
import { threlteStudio } from '@threlte/studio/vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
	plugins: [threlteStudio(), sveltekit(), mkcert(), devtoolsJson(), tailwindcss()],
	server: { proxy: {} }
});
