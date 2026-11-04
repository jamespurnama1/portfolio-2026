<script lang="ts">
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { marked } from 'marked';
	import { liteStore } from '#lib/stores/lite.svelte.js';
	import type { Post, Landing, Gallery, GalleryMedia } from '#lib/types/index.js';

	type Skill = { _key: string; skill: string; type: string; percentage?: number | null };
	type Language = { _key: string; language: string; percentage?: number | null };
	type AwardItem = {
		issuer: string;
		year?: string;
		icon?: { asset?: { url?: string } };
		gold?: string[] | null;
		silver?: string[] | null;
		bronze?: string[] | null;
		crystal?: string[] | null;
	};
	type About = {
		bio?: string;
		image?: { url?: string } | null;
		awards?: AwardItem[] | null;
		languages?: Language[] | null;
		skills?: Skill[] | null;
	};

	const path = $derived(page.url.pathname);
	const projects = $derived((page.data.projects ?? []) as Post[]);
	const catItems = $derived((page.data.catItems ?? []) as Landing[]);
	const gallery = $derived(
		((page.data.gallery ?? []) as Gallery[])
			.flatMap((entry) => entry.media ?? [])
			.filter((item) => item.url)
	);
	const about = $derived((page.data.about ?? null) as About | null);
	const project = $derived(
		path.startsWith('/work/')
			? projects.find((p) => p.slug.current === page.params.slug)
			: undefined
	);
	const title = $derived(
		project
			? `${project.title} | James Henry`
			: path === '/about'
				? 'About | James Henry'
				: path === '/gallery'
					? 'Gallery | James Henry'
					: 'James Henry'
	);

	const IMAGE = /\.(png|jpe?g|webp|gif|avif)$/i;
	// Sanity image assets resize through ?w=; file assets and local dev copies go through /api/thumb.
	function small(url: string, width: number) {
		const clean = url.split('?')[0];
		if (clean.includes('cdn.sanity.io/images/')) return `${clean}?w=${width}&q=60&auto=format`;
		const file = clean.split('/').pop() ?? '';
		if (!IMAGE.test(file)) return url;
		return `/api/thumb?f=${file}&w=${width <= 480 ? 480 : 1600}`;
	}
	const isVideo = (item: GalleryMedia) =>
		item.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(item.url);
	const list = (items?: string[] | null) => (items ?? []).join(', ');
</script>

<svelte:head>
	<title>{title}</title>
</svelte:head>

<div
	role="status"
	style="position:fixed;top:0;left:0;right:0;padding:0.4rem 0.5rem;background:#ffc;border-bottom:1px solid #000;color:#000;font-size:0.8rem;z-index:1"
>
	Lite mode: text and images only, for slow connections.
	<button type="button" onclick={() => liteStore.disable()}>View full site</button>
</div>
<div style="height:2.5rem" aria-hidden="true"></div>

<header>
	<h1><a href={resolve('/(site)')}>James Henry</a></h1>
	<p>Creative director, designer and frontend developer.</p>
	<nav>
		<a href={resolve('/(site)')}>Home</a> |
		<a href={resolve('/(site)/about')}>About</a> |
		<a href={resolve('/(site)/gallery')}>Gallery</a> |
		<a href="/Resume_James%20Henry.pdf">Résumé</a> |
		<a href="mailto:hello@jameshenry.site">hello@jameshenry.site</a>
	</nav>
	<hr />
</header>

<main>
	{#if project}
		<h1>{project.title}</h1>
		<p>{project.description}</p>
		<ul>
			{#if project.year}<li>Year: {project.year}</li>{/if}
			{#if project.type}<li>Type: {project.type}</li>{/if}
			{#if project.role?.length}<li>Role: {list(project.role as string[])}</li>{/if}
			{#if project.tools?.length}<li>Tools: {list(project.tools as string[])}</li>{/if}
			{#if project.link}<li><a href={project.link}>{project.link}</a></li>{/if}
		</ul>
		{#if project.heroMedia?.asset?.url}
			{@const hero = project.heroMedia.asset}
			{#if hero.mimeType?.startsWith('image/')}
				<p><img src={small(hero.url!, 1600)} alt={project.title} width="800" loading="lazy" /></p>
			{:else}
				<p><a href={hero.url}>Watch video</a></p>
			{/if}
		{:else if project.thumbnailImage?.asset?.url}
			<p>
				<img
					src={small(project.thumbnailImage.asset.url, 1600)}
					alt={project.title}
					width="800"
					loading="lazy"
				/>
			</p>
		{/if}
		{#each project.content ?? [] as block (block._key)}
			{#if block.headline}<h2>{block.headline}</h2>{/if}
			{#if block.body}{@html marked.parse(block.body)}{/if}
			{#if block.image?.url}
				<p>
					<img
						src={small(block.image.url, 1600)}
						alt={block.caption ?? ''}
						width="800"
						loading="lazy"
					/>
				</p>
			{/if}
			{#if block.video?.url}
				<p><a href={block.video.url}>Watch video ({block.video.originalFilename})</a></p>
			{/if}
			{#if block.caption}<p><em>{block.caption}</em></p>{/if}
		{/each}
		{#if project.awards?.length}
			<h2>Awards</h2>
			<ul>
				{#each project.awards as award, index (index)}
					<li>
						{award.issuer}
						{#if award.gold?.length}— Gold: {list(award.gold as string[])}.
						{/if}
						{#if award.silver?.length}Silver: {list(award.silver as string[])}.
						{/if}
						{#if award.bronze?.length}Bronze: {list(award.bronze as string[])}.
						{/if}
						{#if award.crystal?.length}Crystal: {list(award.crystal as string[])}.{/if}
					</li>
				{/each}
			</ul>
		{/if}
		<p><a href={resolve('/(site)')}>&larr; All projects</a></p>
	{:else if path === '/about'}
		<h1>About</h1>
		{#if about}
			{#if about.image?.url}
				<p><img src={small(about.image.url, 480)} alt="James Henry" width="240" /></p>
			{/if}
			{#if about.bio}<p>{about.bio}</p>{/if}
			{#if about.awards?.length}
				<h2>Awards</h2>
				<ul>
					{#each about.awards as award, index (index)}
						<li>
							{#if award.icon?.asset?.url}<img
									src={small(award.icon.asset.url, 320)}
									alt=""
									width="32"
								/>{/if}
							{award.issuer}{award.year ? ` (${award.year})` : ''}
							{#if award.gold?.length}— Gold: {list(award.gold)}.
							{/if}
							{#if award.silver?.length}Silver: {list(award.silver)}.
							{/if}
							{#if award.bronze?.length}Bronze: {list(award.bronze)}.
							{/if}
							{#if award.crystal?.length}Crystal: {list(award.crystal)}.{/if}
						</li>
					{/each}
				</ul>
			{/if}
			{#if about.languages?.length}
				<h2>Languages</h2>
				<ul>
					{#each about.languages as language (language._key)}
						<li>
							{language.language}{language.percentage != null ? ` — ${language.percentage}%` : ''}
						</li>
					{/each}
				</ul>
			{/if}
			{#if about.skills?.length}
				<h2>Skills</h2>
				{#each Array.from(new Set(about.skills.map((s) => s.type))) as group (group)}
					<h3>{group}</h3>
					<ul>
						{#each about.skills.filter((s) => s.type === group) as skill (skill._key)}
							<li>
								{skill.skill}{skill.percentage != null ? ` — ${skill.percentage}%` : ''}
							</li>
						{/each}
					</ul>
				{/each}
			{/if}
		{/if}
	{:else if path === '/gallery'}
		<h1>Gallery</h1>
		{#each gallery as item (item._key)}
			<p>
				{#if isVideo(item)}
					<a href={item.url}>Video: {item.alt || item.caption || item.filename || 'untitled'}</a>
				{:else}
					<a href={item.url}
						><img
							src={small(item.url, 480)}
							alt={item.alt || item.caption || ''}
							width="240"
							loading="lazy"
						/></a
					>
				{/if}
				{#if item.alt || item.caption}<br />{item.alt || item.caption}{/if}
				{#if item.projectSlug}
					<br /><a href={resolve('/(site)/work/[slug]', { slug: item.projectSlug })}>View project</a
					>
				{/if}
			</p>
		{/each}
	{:else if path === '/'}
		<h1>Projects</h1>
		{#each catItems as category (category._id)}
			<h2>{category.title}</h2>
			{@const items = (category.items ?? []) as Post[]}
			{#each items as item (item._id)}
				<h3>
					<a href={resolve('/(site)/work/[slug]', { slug: item.slug.current })}>{item.title}</a>
				</h3>
				{#if item.thumbnailImage?.asset?.url}
					<p>
						<a href={resolve('/(site)/work/[slug]', { slug: item.slug.current })}
							><img
								src={small(item.thumbnailImage.asset.url, 480)}
								alt={item.title}
								width="240"
								loading="lazy"
							/></a
						>
					</p>
				{/if}
				{#if item.description}<p>{item.description}</p>{/if}
			{/each}
		{/each}
	{:else}
		<p>This page is not available in lite mode.</p>
	{/if}
</main>
