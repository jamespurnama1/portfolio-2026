import { client } from '#lib/utils/sanityClient.js';
import { SITE } from '#lib/utils/jsonLd.js';
import type { RequestHandler } from './$types';

export const prerender = true;

const HOST = 'jameshenry.site';
const urn = (namespace: string, name: string) =>
	`urn:air:${HOST}:${namespace}:${name.replace(/[^a-zA-Z0-9._-]/g, '-')}`;
const clean = (text?: string | null) => text?.replace(/\s+/g, ' ').trim();

type Project = {
	title: string;
	description?: string;
	slug?: string;
	type?: string;
	tools?: string[];
	_updatedAt?: string;
};

export const GET: RequestHandler = async () => {
	const projects: Project[] = await client.fetch(
		`array::unique(*[_type == "landing"].items[]->{title, description, "slug": slug.current, type, tools, _updatedAt})`
	);
	const seen = new Set<string>();

	const workEntries = projects
		.filter((p) => p?.slug && p.title && !seen.has(p.slug) && seen.add(p.slug))
		.map((p) => ({
			identifier: urn('work', p.slug!),
			displayName: p.title,
			type: 'text/html',
			url: `${SITE}/work/${encodeURIComponent(p.slug!)}`,
			description: clean(p.description) || `${p.title}, a project by James Henry.`,
			tags: [...new Set(['portfolio', 'case-study', p.type, ...(p.tools ?? [])].filter(Boolean))],
			representativeQueries: [
				`Show me James Henry's ${p.title} project`,
				`${p.title} case study by James Henry`
			],
			...(p._updatedAt && { updatedAt: p._updatedAt })
		}));

	const manifest = {
		entries: [
			{
				identifier: urn('site', 'portfolio'),
				displayName: 'James Henry Portfolio',
				type: 'text/html',
				url: SITE,
				description:
					'Portfolio of James Henry, a creative director, designer and frontend developer.',
				tags: ['portfolio', 'creative-direction', 'design', 'web'],
				representativeQueries: [
					'portfolio of a creative director and frontend developer',
					'James Henry creative director portfolio'
				]
			},
			{
				identifier: urn('site', 'about'),
				displayName: 'About James Henry',
				type: 'text/html',
				url: `${SITE}/about`,
				description: "James Henry's experience, awards, skills and languages.",
				tags: ['about', 'awards', 'skills'],
				representativeQueries: [
					'who is James Henry creative director',
					'James Henry awards and skills'
				]
			},
			{
				identifier: urn('site', 'sitemap'),
				displayName: 'James Henry Sitemap',
				type: 'application/xml',
				url: `${SITE}/sitemap.xml`,
				description: 'Sitemap listing every page and project on jameshenry.site.',
				tags: ['sitemap', 'index'],
				representativeQueries: [
					'list all pages on jameshenry.site',
					'all projects by James Henry'
				]
			},
			...workEntries
		]
	};

	return new Response(JSON.stringify(manifest, null, 2), {
		headers: {
			'Content-Type': 'application/json',
			'Access-Control-Allow-Origin': '*'
		}
	});
};
