import type { Award, Post } from '#lib/types/index.js';

export const SITE = 'https://jameshenry.site';
const PERSON_ID = `${SITE}/#person`;
const WEBSITE_ID = `${SITE}/#website`;

type Json = Record<string, unknown>;

export const SOCIAL_LINKS = {
	instagram: 'https://instagram.com/jamespurnama1',
	github: 'https://github.com/jamespurnama1',
	behance: 'https://behance.com/jamespurnama',
	linkedin: 'https://www.linkedin.com/in/jamespurnama'
} as const;

export const CONTACT_EMAIL = 'hello@jameshenry.site';

const sameAs = (cms: { link?: string | null }[] = []) => [
	...new Set([
		...Object.values(SOCIAL_LINKS),
		...cms.map((s) => s.link).filter((l): l is string => !!l && /^https?:\/\//.test(l))
	])
];

const clean = (text?: string | null) => text?.replace(/\s+/g, ' ').trim() || undefined;

const absolute = (url?: string | null) =>
	url ? (url.startsWith('/') ? `${SITE}${url}` : url) : undefined;

/** Serialises to a script tag safe from `</script>` breakouts. */
export function jsonLdScript(graph: Json[]) {
	const json = JSON.stringify({ '@context': 'https://schema.org', '@graph': graph })
		.replace(/</g, '\\u003c')
		.replace(/\u2028/g, '\\u2028')
		.replace(/\u2029/g, '\\u2029');
	return `<script type="application/ld+json">${json}</script>`;
}

export const personNode = (extra: Json = {}): Json => ({
	'@type': 'Person',
	'@id': PERSON_ID,
	name: 'James Henry',
	url: SITE,
	jobTitle: 'Creative Director, Designer and Frontend Developer',
	email: `mailto:${CONTACT_EMAIL}`,
	sameAs: sameAs(),
	...extra
});

export const websiteNode = (): Json => ({
	'@type': 'WebSite',
	'@id': WEBSITE_ID,
	url: SITE,
	name: 'James Henry',
	inLanguage: 'en',
	publisher: { '@id': PERSON_ID },
	author: { '@id': PERSON_ID }
});

export function postImage(post: Post): string | undefined {
	const mime = post.heroMedia?.asset?.mimeType;
	const hero = mime?.startsWith('image/')
		? (post.heroMedia?.asset as { url?: string })?.url
		: undefined;
	const thumb = post.thumbnail?.asset?.url;
	return absolute(
		post.thumbnailImage?.asset?.url ||
			hero ||
			(/\.(png|jpe?g|webp|gif)(?:\?|$)/i.test(thumb ?? '') ? thumb : undefined)
	);
}

export function awardStrings(awards?: Award[] | null): string[] {
	const tiers = ['gold', 'silver', 'bronze', 'crystal'] as const;
	return (awards ?? []).flatMap((award) =>
		tiers.flatMap((tier) =>
			(award[tier] ?? []).map(
				(name) =>
					`${name} (${tier[0].toUpperCase()}${tier.slice(1)}, ${award.issuer}${award.year ? ` ${award.year}` : ''})`
			)
		)
	);
}

export function workNode(post: Post): Json {
	const url = `${SITE}/work/${encodeURIComponent(post.slug.current)}`;
	const awards = awardStrings(post.awards);
	const external = post.link && /^https?:\/\//.test(post.link) ? post.link : undefined;
	return {
		'@type': 'CreativeWork',
		'@id': `${url}#work`,
		url,
		name: post.title,
		description: clean(post.description),
		image: postImage(post),
		dateCreated: post.year ? String(post.year) : undefined,
		genre: post.type || undefined,
		keywords: post.tools?.length ? post.tools.join(', ') : undefined,
		creator: { '@id': PERSON_ID },
		author: { '@id': PERSON_ID },
		isPartOf: { '@id': WEBSITE_ID },
		award: awards.length ? awards : undefined,
		sameAs: external,
		inLanguage: 'en'
	};
}

export function workGraph(post: Post): Json[] {
	const url = `${SITE}/work/${encodeURIComponent(post.slug.current)}`;
	return [
		personNode(),
		websiteNode(),
		workNode(post),
		{
			'@type': 'BreadcrumbList',
			itemListElement: [
				{ '@type': 'ListItem', position: 1, name: 'Home', item: SITE },
				{ '@type': 'ListItem', position: 2, name: post.title, item: url }
			]
		}
	];
}

export function homeGraph(projects: Post[]): Json[] {
	return [
		personNode(),
		websiteNode(),
		{
			'@type': 'CollectionPage',
			'@id': `${SITE}/#webpage`,
			url: SITE,
			name: 'James Henry | Creative Direction, Design and Web',
			isPartOf: { '@id': WEBSITE_ID },
			about: { '@id': PERSON_ID },
			mainEntity: {
				'@type': 'ItemList',
				itemListElement: projects.map((post, i) => ({
					'@type': 'ListItem',
					position: i + 1,
					url: `${SITE}/work/${encodeURIComponent(post.slug.current)}`,
					name: post.title
				}))
			}
		}
	];
}

type AboutData = {
	bio?: string;
	image?: { url?: string } | null;
	awards?: Award[] | null;
	skills?: { skill: string }[] | null;
	languages?: { language: string }[] | null;
	socials?: { link?: string | null }[] | null;
} | null;

export function aboutGraph(about: AboutData): Json[] {
	const awards = awardStrings(about?.awards);
	return [
		personNode({
			sameAs: sameAs(about?.socials ?? []),
			description: clean(about?.bio),
			image: absolute(about?.image?.url),
			knowsAbout: about?.skills?.map((s) => s.skill).filter(Boolean),
			knowsLanguage: about?.languages?.map((l) => l.language).filter(Boolean),
			award: awards.length ? awards : undefined
		}),
		websiteNode(),
		{
			'@type': 'ProfilePage',
			'@id': `${SITE}/about#webpage`,
			url: `${SITE}/about`,
			name: 'About | James Henry',
			isPartOf: { '@id': WEBSITE_ID },
			mainEntity: { '@id': PERSON_ID }
		}
	];
}

export function galleryGraph(): Json[] {
	return [
		personNode(),
		websiteNode(),
		{
			'@type': 'CollectionPage',
			'@id': `${SITE}/gallery#webpage`,
			url: `${SITE}/gallery`,
			name: 'Gallery | James Henry',
			isPartOf: { '@id': WEBSITE_ID },
			author: { '@id': PERSON_ID }
		}
	];
}
