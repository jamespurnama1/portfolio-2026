<script lang="ts">
	import Awards from '#lib/components/Awards.svelte';
	import { onNavigate } from '$app/navigation';
	import { gsap } from 'gsap';
	import type { Award } from '#lib/types/index.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import type { PageData } from './$types.js';

	type Skill = { _key: string; skill: string; type: string; percentage?: number | null };
	type Language = { _key: string; language: string; percentage?: number | null };
	type About = {
		title?: string;
		bio?: string;
		image?: { url?: string } | null;
		awards?: Award[] | null;
		languages?: Language[] | null;
		skills?: Skill[] | null;
	};

	let { data }: { data: PageData } = $props();
	const about = $derived(data.about as About | null);
	const theory = $derived((about?.skills ?? []).filter((skill) => skill.type === 'Theory'));
	const groups = $derived(
		Array.from(
			new Set(
				(about?.skills ?? []).filter((skill) => skill.type !== 'Theory').map((skill) => skill.type)
			)
		)
	);
	const percent = (value: number | null | undefined) => Math.min(100, Math.max(0, value ?? 0));
	let pageEl = $state<HTMLElement>();

	// Holds the navigation until the page has animated out.
	onNavigate(({ to }) => {
		if (to?.url.pathname === '/about') return;
		if (!pageEl || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		return new Promise<void>((resolve) => {
			gsap.to(pageEl!, {
				opacity: 0,
				filter: 'blur(8px)',
				y: -12,
				duration: 0.45,
				ease: 'power2.in',
				onComplete: resolve
			});
		});
	});
	const description =
		'Learn about James Henry, a creative director, designer and frontend developer, his experience, awards and skills.';

	// The pinned column scrolls itself only while it has overflow left in that direction; otherwise the page scrolls.
	function forwardWheel(node: HTMLElement) {
		const onWheel = (event: WheelEvent) => {
			if (event.ctrlKey || !event.deltaY) return;
			const max = node.scrollHeight - node.clientHeight;
			const canScroll = event.deltaY < 0 ? node.scrollTop > 0 : node.scrollTop < max - 1;
			if (canScroll) return;
			event.preventDefault();
			window.scrollBy({ top: event.deltaY, left: 0, behavior: 'auto' });
		};
		node.addEventListener('wheel', onWheel, { passive: false });
		return { destroy: () => node.removeEventListener('wheel', onWheel) };
	}

	function reveal(node: HTMLElement) {
		if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
		node.classList.add('will-reveal');
		const observer = new IntersectionObserver(
			([entry]) => {
				if (entry.isIntersecting) {
					node.classList.add('revealed');
					observer.disconnect();
				}
			},
			{ threshold: 0.1 }
		);
		observer.observe(node);
		return { destroy: () => observer.disconnect() };
	}
</script>

<svelte:head>
	<title>About | James Henry</title>
	<meta name="description" content={description} />
	<link rel="canonical" href="https://jameshenry.site/about" />
	<meta property="og:type" content="profile" />
	<meta property="og:site_name" content="James Henry" />
	<meta property="og:title" content="About | James Henry" />
	<meta property="og:description" content={description} />
	<meta property="og:url" content="https://jameshenry.site/about" />
	<meta name="twitter:card" content={about?.image?.url ? 'summary_large_image' : 'summary'} />
	<meta name="twitter:title" content="About | James Henry" />
	<meta name="twitter:description" content={description} />
	{#if about?.image?.url}
		<meta property="og:image" content={about.image.url} />
		<meta name="twitter:image" content={about.image.url} />
	{/if}
</svelte:head>

{#if about}
	<section
		bind:this={pageEl}
		class="about-page"
		class:light={!optionsStore.dark}
		aria-label="About James Henry"
	>
		<div class="portrait-column" use:forwardWheel>
			<h1 class="intro-name">James Henry</h1>
			{#if about.image?.url}
				<img class="portrait" src={about.image.url} alt="James Henry" />
			{/if}
			{#if about.bio}<p class="bio intro-bio">{about.bio.replace(/ (?=[^ ]*$)/, '\u00A0')}</p>{/if}
		</div>

		<div class="details">
			{#if about.awards?.length}
				<section class="detail-row" aria-labelledby="awards-heading">
					<h2 id="awards-heading">Awards</h2>
					<div class="awards"><Awards awards={about.awards} compact /></div>
				</section>
			{/if}

			{#if about.languages?.length}
				<section class="detail-row" aria-labelledby="languages-heading">
					<h2 id="languages-heading">Languages</h2>
					<div class="levels languages">
						{#each about.languages as language (language._key)}
							<div class="level">
								<span>{language.language}</span>
								{#if language.percentage != null}<span
										class="meter"
										role="meter"
										aria-label={language.language}
										aria-valuemin="0"
										aria-valuemax="100"
										aria-valuenow={percent(language.percentage)}
										><span style:width="{percent(language.percentage)}%"></span></span
									>{/if}
							</div>
						{/each}
					</div>
				</section>
			{/if}

			{#if about.skills?.length}
				<section class="detail-row" aria-labelledby="skills-heading">
					<h2 id="skills-heading">Skills</h2>
					<div>
						{#if theory.length}<p class="theory" use:reveal>
								{theory.map((skill) => skill.skill).join(', ')}
							</p>{/if}
						{#each groups as group (group)}
							<div class="skill-group" use:reveal>
								<h3>&gt; {group} &gt;</h3>
								<div class="levels">
									{#each about.skills.filter((skill) => skill.type === group) as skill (skill._key)}
										<div class="level">
											<span>{skill.skill}</span>
											{#if skill.percentage != null}<span
													class="meter"
													role="meter"
													aria-label={skill.skill}
													aria-valuemin="0"
													aria-valuemax="100"
													aria-valuenow={percent(skill.percentage)}
													><span style:width="{percent(skill.percentage)}%"></span></span
												>{/if}
										</div>
									{/each}
								</div>
							</div>
						{/each}
					</div>
				</section>
			{/if}
		</div>
	</section>
{/if}

<style>
	.about-page {
		width: min(calc(100% - 2rem), 90rem);
		min-height: 100svh;
		padding: 5.5rem 0 7rem;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 12%;
		align-items: start;
		color: white;
		font-size: 12px;
		line-height: 1.25;
	}
	.about-page.light {
		color: black;
	}
	.portrait-column h1 {
		margin: 0 0 0.6rem;
		font-size: 2rem;
		font-weight: 700;
		line-height: 1;
	}
	.portrait {
		display: block;
		width: min(100%, 24vw, 320px);
		height: auto;
		animation: blur-in 0.8s 0.15s both;
	}
	.details {
		padding-top: 2.6rem;
	}
	.bio {
		max-width: 340px;
		margin-top: 1rem;
		white-space: pre-line;
	}
	.intro-name {
		animation: blur-in 0.8s both;
	}
	.intro-bio {
		animation: blur-in 0.8s 0.3s both;
	}
	.about-page :global(.will-reveal) {
		opacity: 0;
		filter: blur(8px);
		transform: translateY(12px);
		transition:
			opacity 0.7s ease,
			filter 0.7s ease,
			transform 0.7s ease;
	}
	.about-page :global(.will-reveal.revealed) {
		opacity: 1;
		filter: blur(0);
		transform: translateY(0);
	}
	.about-page :global(.will-reveal .meter span) {
		transform: scaleX(0);
		transform-origin: left;
		transition: transform 1s 0.2s ease-out;
	}
	.about-page :global(.will-reveal.revealed .meter span) {
		transform: scaleX(1);
	}
	@keyframes blur-in {
		from {
			opacity: 0;
			filter: blur(8px);
			transform: translateY(12px);
		}
		to {
			opacity: 1;
			filter: blur(0);
			transform: translateY(0);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.intro-name,
		.portrait,
		.intro-bio {
			animation: none;
		}
	}
	.detail-row {
		display: grid;
		grid-template-columns: 72px minmax(0, 1fr);
		gap: 1rem;
		margin-top: 2rem;
	}
	.details > .detail-row:first-child {
		margin-top: 0;
	}
	.detail-row h2 {
		font-weight: 700;
		text-align: right;
	}
	.awards {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}
	.awards :global(.award-label.compact) {
		order: -1;
	}
	.light .awards :global(img) {
		filter: invert(1);
	}
	.levels {
		display: grid;
		gap: 0.15rem;
	}
	.level {
		display: grid;
		grid-template-columns: minmax(0, 150px) 110px;
		gap: 1rem;
		align-items: center;
	}
	.meter {
		display: block;
		height: 1px;
		background: color-mix(in srgb, currentColor 20%, transparent);
	}
	.meter span {
		display: block;
		height: 100%;
		background: currentColor;
	}
	.languages {
		font-family: var(--font-mono);
		text-transform: uppercase;
		font-size: 0.7rem;
	}
	.theory {
		max-width: 340px;
	}
	.skill-group {
		margin-top: 1.25rem;
	}
	.skill-group h3 {
		margin-bottom: 0.35rem;
		font-family: var(--font-mono);
		font-size: 0.7rem;
		text-transform: uppercase;
	}
	@media (min-width: 768px) {
		.portrait-column {
			position: sticky;
			top: 5.5rem;
			max-height: calc(100svh - 7rem);
			overflow-y: auto;
			overscroll-behavior: contain;
		}
	}
	@media (max-width: 767px) {
		.about-page {
			width: calc(100% - 2rem);
			margin: 0;
			padding-right: 2.5rem;
			padding: 6rem 0 8rem;
			grid-template-columns: minmax(0, 1fr);
			gap: 2.5rem;
		}
		.portrait-column h1 {
			font-size: 2rem;
		}
		.portrait {
			width: min(100%, 280px);
		}
		.details {
			padding-top: 0;
		}
		.detail-row {
			grid-template-columns: minmax(0, 1fr);
			gap: 0.65rem;
		}
		.detail-row h2 {
			text-align: left;
		}
		.level {
			grid-template-columns: minmax(0, 1fr) minmax(60px, 110px);
		}
	}
</style>
