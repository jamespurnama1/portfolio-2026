import { client } from '#lib/utils/sanityClient.js';
import type { RequestHandler } from './$types';

export const prerender = true;

const SITE = 'https://jameshenry.site';
const STATIC_PATHS = ['/', '/about', '/gallery'];

export const GET: RequestHandler = async () => {
	const slugs: string[] = await client.fetch(
		`array::unique(*[_type == "landing"].items[]->slug.current)`
	);
	const paths = [...STATIC_PATHS, ...slugs.filter(Boolean).map((s) => `/work/${encodeURIComponent(s)}`)];
	const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((p) => `	<url><loc>${SITE}${p}</loc></url>`).join('\n')}
</urlset>`;

	return new Response(body, { headers: { 'Content-Type': 'application/xml' } });
};
