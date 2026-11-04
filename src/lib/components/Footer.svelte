<script lang="ts">
	import logo from '#lib/images/logo.svg';
	import ScrambleText from '#lib/components/ScrambleText.svelte';
	import Wave from '#lib/components/Wave.svelte';
	import { theme } from '#lib/utils/theme.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { dev } from '$app/env';
	import { loadStore } from '#lib/stores/index.svelte.js';
	import { cubicInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';
	import { ambient } from '#lib/utils/ambient.svelte.js';
	import { page } from '$app/state';
	import { homeNav } from '#lib/stores/homeNav.js';

	let { revealed = loadStore.loaded }: { revealed?: boolean } = $props();
</script>

<footer
	class="fixed bottom-0 mix-blend-difference text-white text-xs flex justify-between
		uppercase font-mono w-full items-end p-4 z-20 overflow-hidden transition-opacity duration-300 pointer-events-none"
	class:opacity-0={!revealed}
	class:footer-live={revealed}
>
	<a
		href="/"
		onclick={(event) => {
			if (page.url.pathname !== '/') return;
			event.preventDefault();
			if (homeNav.top) homeNav.top();
			else window.scrollTo({ top: 0, behavior: 'smooth' });
		}}
		class="block h-8 aspect-45/51.5 shrink-0 group"
		transition:fly={{ y: 200, duration: 500, easing: cubicInOut, delay: 900 }}
	>
		<img
			alt="James Henry Logo"
			class="h-full w-full object-contain object-left group-hover:scale-125! transition-transform"
			src={logo}
		/>
	</a>
	<span class="flex flex-col max-md:mb-16">
		<button
			onclick={() => ambient.toggle()}
			aria-pressed={ambient.on}
			aria-label="Toggle ambient music"
			transition:fly={{ y: 200, duration: 500, easing: cubicInOut, delay: 900 }}
			class="flex items-center justify-end gap-2 leading-none transition-opacity duration-300"
			class:opacity-0={optionsStore.fullscreen}
			class:invisible={optionsStore.fullscreen}
		>
			<Wave active={ambient.on} />
			<span><ScrambleText text={ambient.on ? 'MUSIC ON' : 'MUSIC OFF'} /></span>
		</button>
		<button
			class="max-md:hidden"
			onclick={() => theme(!optionsStore.dark, true)}
			transition:fly={{ y: 200, duration: 500, easing: cubicInOut, delay: 800 }}
			><p class="text-right leading-none uppercase">
				<ScrambleText text={optionsStore.dark ? 'DARK' : 'LIGHT'} />
			</p></button
		>
		<a
			class="max-md:hidden"
			href="https://github.com/jamespurnama1/new-portfolio"
			target="_blank"
			rel="noopener noreferrer"
			transition:fly={{ y: 200, duration: 700, easing: cubicInOut, delay: 700 }}
			><p class="text-right leading-none"><ScrambleText text={dev ? 'DEV' : 'PROD'} /></p>
		</a>
		<a
			class="max-md:hidden"
			href="/branch"
			transition:fly={{ y: 200, duration: 500, easing: cubicInOut, delay: 800 }}
			><p class="text-right leading-none"><ScrambleText text="v3.0.3" /></p></a
		>
	</span>
</footer>

<style>
	.footer-live :global(a),
	.footer-live :global(button) {
		pointer-events: auto;
	}
</style>
