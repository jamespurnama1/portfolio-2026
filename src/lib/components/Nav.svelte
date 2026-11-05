<script lang="ts">
	import { page } from '$app/state';
	import { gptStore, loadStore } from '#lib/stores/index.svelte.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { viewerStore } from '#lib/stores/viewer.svelte.js';
	import ScrambleText from '#lib/components/ScrambleText.svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { track } from '#lib/utils/analytics.js';
	import { flip } from 'svelte/animate';
	import { SOCIAL_LINKS } from '#lib/utils/jsonLd.js';

	let { revealed = loadStore.loaded }: { revealed?: boolean } = $props();

	let resumeLabel = $state('résumé');
	let isMobile = $state(false);
	$effect(() => {
		const query = window.matchMedia('(max-width: 767px)');
		const update = () => (isMobile = query.matches);
		update();
		query.addEventListener('change', update);
		return () => query.removeEventListener('change', update);
	});
	let resumeScramble = $state(false);
	const links = $derived([
		...(page.url.pathname !== '/about' ? ['about'] : []),
		...(page.url.pathname !== '/gallery' ? ['gallery'] : []),
		'email',
		'resume',
		...(page.url.pathname !== '/' || viewerStore.active ? ['back'] : [])
	]);
	const mobileLinks = $derived(links.filter((link) => link !== 'email'));

	function onResumeClick() {
		track('resume_download', { source: 'nav' });
		resumeLabel = 'sending';
		resumeScramble = true;
		setTimeout(() => (resumeScramble = false), 750);
		setTimeout(() => (resumeLabel = 'résumé'), 2500);
	}
</script>

<header
	class="mix-blend-difference uppercase text-white text-xs font-mono z-20 relative overflow-hidden"
>
	<nav
		class="nav-bar flex justify-between items-start fixed w-full p-4 top-0 left-0 pointer-events-none"
		data-count={mobileLinks.length}
	>
		{#if revealed}
			{#each links as link, index (link)}
				<div
					animate:flip={{ duration: 500, easing: cubicInOut }}
					class:hidden-email={link === 'email'}
					data-pos={mobileLinks.indexOf(link)}
				>
					{#if link === 'about' || link === 'gallery'}
						<a
							transition:fly|global={{
								y: -200,
								duration: 500,
								easing: cubicInOut,
								delay: index * 50
							}}
							href="/{link}"><p><ScrambleText text={link} /></p></a
						>
					{:else if link === 'email'}
						<a
							transition:fly|global={{
								y: -200,
								duration: 500,
								easing: cubicInOut,
								delay: index * 50
							}}
							href="mailto:hello@jameshenry.site"
							onclick={() => track('email_click', { source: 'nav' })}
							><p><ScrambleText text="hello@jameshenry.site" /></p></a
						>
					{:else if link === 'resume'}
						<a
							transition:fly|global={{
								y: -200,
								duration: 500,
								easing: cubicInOut,
								delay: index * 50
							}}
							href="/Resume_James%20Henry.pdf"
							download="Resume_James Henry.pdf"
							target="_blank"
							rel="noopener noreferrer"
							onclick={onResumeClick}
							><p>
								<ScrambleText
									text={resumeLabel}
									reserveText="sending"
									active={resumeScramble}
									durationMs={750}
								/>
							</p></a
						>
					{:else}
						<a
							transition:fly|global={{
								y: -200,
								duration: 500,
								easing: cubicInOut,
								delay: index * 50
							}}
							class="goback"
							href="/"
							onclick={(event) => {
								if (
									page.url.pathname === '/gallery' &&
									!window.dispatchEvent(new Event('close-gallery-viewer', { cancelable: true }))
								) {
									event.preventDefault();
								} else if (optionsStore.fullscreen) {
									event.preventDefault();
									window.dispatchEvent(new CustomEvent('close-viewer'));
								}
							}}><p><ScrambleText text="go back" /></p></a
						>
					{/if}
				</div>
			{/each}
		{/if}
	</nav>
	<aside
		class="fixed top-0 right-4 max-md:gap-4 h-full flex flex-col justify-center text-right z-0 transition-opacity {optionsStore.fullscreen
			? 'opacity-0 pointer-events-none'
			: gptStore.opened
				? 'max-md:opacity-0 max-md:pointer-events-none delay-300'
				: 'delay-300'}"
	>
		{#if revealed && !optionsStore.fullscreen && !(isMobile && optionsStore.galleryViewer)}
			<a
				href={SOCIAL_LINKS.instagram}
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 300 }}
				><p><ScrambleText text="IG" /></p></a
			>
			<a
				href={SOCIAL_LINKS.github}
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 400 }}
				><p><ScrambleText text="GH" /></p></a
			>
			<a
				href={SOCIAL_LINKS.behance}
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 500 }}
				><p><ScrambleText text="BE" /></p></a
			>
			<a
				href={SOCIAL_LINKS.linkedin}
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 600 }}
				><p><ScrambleText text="IN" /></p></a
			>
		{/if}
	</aside>
</header>

<style>
	.nav-bar :global(a) {
		pointer-events: auto;
	}
	@media (max-width: 767px) {
		.hidden-email {
			display: none;
		}
		/* Only an odd count needs a true centre column; other counts use flex space-between. */
		.nav-bar[data-count='3'] {
			display: grid;
			grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
		}
		.nav-bar[data-count='3'] > * {
			grid-row: 1;
		}
		.nav-bar[data-count='3'] > [data-pos='0'] {
			grid-column: 1;
			justify-self: start;
		}
		.nav-bar[data-count='3'] > [data-pos='1'] {
			grid-column: 2;
			justify-self: center;
		}
		.nav-bar[data-count='3'] > [data-pos='2'] {
			grid-column: 3;
			justify-self: end;
		}
	}
</style>
