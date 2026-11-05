import { json } from '@sveltejs/kit';
import { loadAbout } from '#lib/utils/sanityClient.js';

// Static JSON so lite mode can show /about without loading the page's JavaScript.
export const prerender = true;

export async function GET() {
	return json(await loadAbout());
}
