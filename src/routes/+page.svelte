<script lang="ts">
	import { animationStore, countStore, gptStore, scrollStore } from '$lib/stores/index.svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { projectListHost } from '$lib/stores/projectListHost';
	import { projectSectionStore } from '$lib/stores/projectSection';
	import { introSectionStore } from '$lib/stores/introSection';
	import type { PageData } from './$types';

	const { data }: { data: Required<PageData> } = $props();
	const introHeadlineText = 'Where ideas<br>&&nbsp;design are elevated <mono>digitally.</mono>';
	const introBodyText =
		'Get to know James Henry. A tech creative who loves to build things that look and feel great.<br><mono>Creative Direction・Motion・Design・Web</mono><br>Browse his projects below or simply start chatting with his&nbsp;clone.';
	const finalHeadlineText = "Let's make your project happen";
	const finalBodyText =
		'Creative direction, motion systems, interactive builds, and production-ready frontend implementation for teams that need both a point of view and the technical depth to ship it.';
	const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
	const introHeadlineReserve = buildStaticFormattedText(introHeadlineText);
	const introBodyReserve = buildStaticFormattedText(introBodyText);
	const projectsLength = data.projectsLength ?? data.projects?.length ?? 0;
	const projectsPinPercent = Math.max(0, projectsLength * 10);
	let introSection: HTMLElement | null = null;
	let categorySection: HTMLElement | null = null;
	let projectListHostEl: HTMLElement | null = null;
	let introHeadlineDisplay = $state('');
	let introBodyDisplay = $state('');
	let typingRun = 0;

	type MarkedToken =
		| { kind: 'text'; text: string }
		| { kind: 'mono'; text: string }
		| { kind: 'br' };

	gsap.registerPlugin(ScrollTrigger);

	function escapeHtml(value: string) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('\u00A0', '&nbsp;');
	}

	function normalizeEntities(value: string) {
		return value.replaceAll('&nbsp;', '\u00A0');
	}

	function parseMarkedText(input: string) {
		const tokens: MarkedToken[] = [];
		const pattern = /<br>|<mono>(.*?)<\/mono>/g;
		let cursor = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(input))) {
			if (match.index > cursor) {
				tokens.push({ kind: 'text', text: normalizeEntities(input.slice(cursor, match.index)) });
			}

			if (match[0] === '<br>') {
				tokens.push({ kind: 'br' });
			} else {
				tokens.push({ kind: 'mono', text: normalizeEntities(match[1] ?? '') });
			}

			cursor = match.index + match[0].length;
		}

		if (cursor < input.length) {
			tokens.push({ kind: 'text', text: normalizeEntities(input.slice(cursor)) });
		}

		return tokens;
	}

	function getVisibleText(tokens: MarkedToken[]) {
		return tokens.map((token) => (token.kind === 'br' ? '\n' : token.text)).join('');
	}

	function scrambleVisibleText(text: string) {
		return text
			.split('')
			.map((char) => {
				if (char === ' ' || char === '\n' || char === '\u00A0') return char;
				return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
			})
			.join('');
	}

	function wrapFormattedSegment(kind: 'text' | 'mono', content: string) {
		if (kind === 'mono') {
			return `<span class="font-mono font-normal">${content}</span>`;
		}
		return content;
	}

	function buildFormattedText(tokens: MarkedToken[], revealCount: number) {
		let remaining = revealCount;
		let html = '';

		for (const token of tokens) {
			if (token.kind === 'br') {
				html += '<br>';
				if (remaining > 0) remaining -= 1;
				continue;
			}

			const revealedCount = Math.min(token.text.length, Math.max(remaining, 0));
			const revealed = escapeHtml(token.text.slice(0, revealedCount));
			const scrambled = escapeHtml(scrambleVisibleText(token.text.slice(revealedCount)));
			html += wrapFormattedSegment(token.kind, `${revealed}${scrambled}`);
			remaining -= revealedCount;
		}

		return html;
	}

	function buildStaticFormattedText(text: string) {
		const tokens = parseMarkedText(text);
		return buildFormattedText(tokens, getVisibleText(tokens).length);
	}

	function syncCategorySectionViewportTop() {
		if (page.url.pathname !== '/' || !categorySection) {
			projectSectionStore.setViewportTop(0);
			return;
		}
		projectSectionStore.setViewportTop(categorySection.getBoundingClientRect().top);
	}

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	async function animateScrambleText(
		text: string,
		assign: (value: string) => void,
		stepDelay: number,
		runId: number
	) {
		const tokens = parseMarkedText(text);
		const visibleText = getVisibleText(tokens);
		assign(buildFormattedText(tokens, 0));
		for (let index = 0; index <= visibleText.length; index++) {
			if (runId !== typingRun) return;
			assign(buildFormattedText(tokens, index));
			await wait(stepDelay);
		}
		if (runId === typingRun) {
			assign(buildFormattedText(tokens, visibleText.length));
		}
	}

	async function runIntroCopyAnimation() {
		const runId = ++typingRun;
		await wait(200);
		await animateScrambleText(
			introHeadlineText,
			(value) => (introHeadlineDisplay = value),
			18,
			runId
		);
		await wait(120);
		await animateScrambleText(introBodyText, (value) => (introBodyDisplay = value), 8, runId);
	}

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname === '/') return;
			projectListHost.set(null);
			projectSectionStore.reset();
			introSectionStore.reset();
			ScrollTrigger.getAll().forEach((trigger) => trigger.kill(true));
		});
	});

	$effect(() => {
		scrollStore.scroll;
		categorySection;
		untrack(() => syncCategorySectionViewportTop());
	});

	$effect(() => {
		gptStore.opened;
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname !== '/' || gptStore.opened) return;
			requestAnimationFrame(() => {
				ScrollTrigger.refresh();
				syncCategorySectionViewportTop();
			});
		});
	});

	onMount(() => {
		runIntroCopyAnimation();
		if (page.url.pathname !== '/') {
			projectListHost.set(null);
			projectSectionStore.reset();
			introSectionStore.reset();
			return;
		}

		introSectionStore.setActive(true);
		introSectionStore.setProgress(0);

		if (projectListHostEl) {
			projectListHost.set(projectListHostEl);
		}
		syncCategorySectionViewportTop();

		const triggers: ScrollTrigger[] = [];
		if (introSection) {
			triggers.push(
				ScrollTrigger.create({
					trigger: introSection,
					start: 'top top',
					end: '+=200%',
					pin: true,
					pinSpacing: true,
					scrub: true,
					onEnter: () => {
						if (gptStore.opened) return;
						introSectionStore.setActive(true);
					},
					onEnterBack: () => {
						if (gptStore.opened) return;
						introSectionStore.setActive(true);
					},
					onLeave: () => {
						if (gptStore.opened) return;
						introSectionStore.setActive(false);
						introSectionStore.setProgress(1);
					},
					onLeaveBack: () => {
						if (gptStore.opened) return;
						introSectionStore.setActive(false);
						introSectionStore.setProgress(0);
					},
					onUpdate: (self) => {
						if (gptStore.opened) return;
						introSectionStore.setProgress(self.progress);
					}
				})
			);
		}
		if (categorySection) {
			triggers.push(
				ScrollTrigger.create({
					trigger: categorySection,
					start: 'top top',
					end: `+=${projectsPinPercent}%`,
					pin: true,
					pinSpacing: true,
					scrub: true,
					onEnter: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(true);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onEnterBack: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(true);
						syncCategorySectionViewportTop();
					},
					onLeave: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(1);
						syncCategorySectionViewportTop();
					},
					onLeaveBack: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onUpdate: (self) => {
						if (gptStore.opened) return;
						projectSectionStore.setProgress(self.progress);
						syncCategorySectionViewportTop();
						if (self.isActive) {
							const maxIndex = Math.max(0, projectsLength - 1);
							countStore.inertiaIndex = maxIndex === 0 ? 0 : self.progress * maxIndex;
							scrollStore.scroll = typeof window !== 'undefined' ? window.scrollY : 0;
						}
					}
				})
			);
		}
		return () => {
			typingRun += 1;
			triggers.forEach((trigger) => trigger.kill(true));
			projectListHost.set(null);
			projectSectionStore.reset();
			introSectionStore.reset();
		};
	});
</script>

<svelte:head>
	<title>James Henry</title>
	<meta name="description" content="Portfolio" />
</svelte:head>

<section bind:this={introSection} class="intro-section">
	<div class="intro-copy max-w-4xl text-white mix-blend-difference">
		<h1
			class="font-sans text-4xl md:text-5xl lg:text-6xl leading-[0.92] font-bold mb-6 text-left intro-heading"
		>
			<span class="intro-scramble-stack">
				<span class="intro-scramble-reserve" aria-hidden="true">{@html introHeadlineReserve}</span>
				<span class="intro-scramble-display">{@html introHeadlineDisplay}</span>
			</span>
		</h1>
		<p class="font-sans text-xs md:text-sm leading-relaxed opacity-80 text-left intro-body">
			<span class="intro-scramble-stack">
				<span class="intro-scramble-reserve" aria-hidden="true">{@html introBodyReserve}</span>
				<span class="intro-scramble-display">{@html introBodyDisplay}</span>
			</span>
		</p>
	</div>
</section>
<section class="landing-section" bind:this={categorySection}>
	<div
		class="project-list-host"
		class:project-list-host--active={page.url.pathname === '/'}
		bind:this={projectListHostEl}
	></div>
	{#if countStore.isNewCat}
		<div
			class="md:w-[30vw] top-1/2 md:top-[20%] max-md:-translate-y-1/2 md:left-0 md:translate-x-1/3 pointer-events-none absolute"
			transition:scale={{ duration: 500, start: 0.5, easing: quintOut }}
		>
			<h2 class="text-white uppercase text-center font-mono text-3xl md:text-6xl m-0 2xl:top-1/4">
				{animationStore.currentCat[0]}
			</h2>
		</div>
	{/if}
</section>
<section class="final-section">
	<div class="final-copy max-w-5xl text-white mix-blend-difference">
		<h3
			class="font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold leading-[0.92] text-left mb-8"
		>
			{finalHeadlineText}
		</h3>
		<p class="font-mono text-xs md:text-sm leading-relaxed max-w-2xl opacity-80 text-left">
			{finalBodyText}
		</p>
	</div>
</section>

<style lang="scss" scoped>
	section {
		width: 100%;
		height: 100vh;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6rem;
		position: relative;
	}

	.project-list-host {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		pointer-events: none;
	}

	.project-list-host--active {
		pointer-events: auto;
	}

	.intro-copy {
		width: min(100%, 84rem);
		margin-right: auto;
		padding: 0 min(30vw, 30rem) 0 clamp(2rem, 5vw, 4rem);
	}

	.intro-heading,
	.intro-body {
		min-height: 1lh;
	}

	.intro-scramble-stack {
		position: relative;
		display: block;
		width: 100%;
	}

	.intro-scramble-reserve,
	.intro-scramble-display {
		display: block;
		white-space: normal;
	}

	.intro-scramble-reserve {
		visibility: hidden;
		pointer-events: none;
	}

	.intro-scramble-display {
		position: absolute;
		inset: 0;
	}

	.final-section {
		justify-content: flex-start;
	}

	.final-copy {
		width: 100%;
		padding: 0 2rem;
	}

	@media (max-width: 767px) {
		.intro-copy {
			padding: 0 2rem;
		}
	}

	/* :global(body:not(.loaded)) .category-label {
		top: 50%;
	} */
</style>
