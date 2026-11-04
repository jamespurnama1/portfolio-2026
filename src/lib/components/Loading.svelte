<script lang="ts">
	// Supports weights 200-900
	import '@fontsource-variable/source-code-pro';
	// Supports weights 100-900
	import '@fontsource-variable/hanken-grotesk';
	import gsap from 'gsap';
	import { loadStore } from '#lib/stores/index.svelte.js';
	import { onMount, untrack } from 'svelte';
	import { liteStore } from '#lib/stores/lite.svelte.js';

	const SLOW_AFTER_MS = 6000;
	let slow = $state(false);

	$effect(() => {
		if (!slow) return;
		liteStore.slow = true;
		document.documentElement.classList.add('os-cursor');
		return () => document.documentElement.classList.remove('os-cursor');
	});
	const error = 200;
	let loadingText: HTMLHeadElement | null = $state(null);
	let errorText: HTMLHeadElement | null = $state(null);
	const str = ['J', 'a', 'm', 'e', 's', ' ', 'H', 'e', 'n', 'r', 'y'];
	const currentStr = $state([]) as string[];
	// The first render is always 0%, whatever the store already holds.
	let ready = $state(false);
	const shown = $derived(ready ? Math.min(100, Math.floor(loadStore.load)) : 0);

	$effect(() => {
		shown;
		untrack(() => {
			currentStr.length = 0;
			currentStr.push(...str);
			currentStr.length = Math.floor((str.length * shown) / 100) + 1;
		});
		return () => gsap.killTweensOf(loadingText);
	});

	onMount(() => {
		ready = true;
		// A slow link is reported by the browser or inferred from time since navigation start.
		const flags = window as unknown as { __appReady?: boolean; __wantsLite?: boolean };
		flags.__appReady = true;
		document.getElementById('lite-prompt')?.remove();
		if (flags.__wantsLite) liteStore.enable();
		const connection = (
			navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }
		).connection;
		const slowLink =
			!!connection &&
			(!!connection.saveData || ['slow-2g', '2g', '3g'].includes(connection.effectiveType ?? ''));
		const slowTimer = setTimeout(
			() => (slow = true),
			slowLink ? 0 : Math.max(0, SLOW_AFTER_MS - performance.now())
		);
		gsap.to(loadingText, {
			fontWeight: 900,
			duration: 1,
			yoyo: true,
			repeat: -1,
			repeatDelay: 0.25,
			onUpdate: () => {
				loadingText!.style.fontVariationSettings = "'wght' " + loadingText!.style.fontWeight;
			}
		});

		// error code for later

		// gsap.to(errorText, {
		// 	fontWeight: 900,
		// 	opacity: 0,
		// 	yoyo: true,
		// 	repeat: -1,
		// 	repeatDelay: 0.25,
		// 	onUpdate: () => {
		// 		if (!errorText) return;
		// 		errorText.style.fontVariationSettings = "'wght' " + errorText.style.fontWeight;
		// 	}
		// });
		return () => clearTimeout(slowTimer);
	});
</script>

<div class="flex items-center justify-center md:justify-start h-full w-full">
	{#if error === 200}
		<!--
			inline-grid stacks two layers in the same cell:
			  1. invisible "James Henry >100%" — reserves the full width so the block is always
			     centered at the same position regardless of how many characters are typed.
			  2. visible animated layer — h1 shows the typing effect, >XX% sits immediately
			     after it and moves right naturally as more letters appear.
		-->
		<div class="inline-grid text-3xl sm:text-4xl md:text-6xl 2xl:text-7xl">
			<!-- Reserve layer (invisible, sets container width) -->
			<div
				class="[grid-area:1/1] invisible pointer-events-none select-none flex items-center whitespace-nowrap"
			>
				<span class="font-sans">James Henry</span>
				<span class="font-mono pl-2 md:pl-4">&gt;100%</span>
			</div>
			<!-- Visible layer -->
			<div class="[grid-area:1/1] flex items-center whitespace-nowrap">
				<h1 bind:this={loadingText} class="shrink-0 text-white font-sans mix-blend-difference">
					{currentStr.toString().replaceAll(',', '')}
				</h1>
				<p class="shrink-0 text-white font-mono mix-blend-difference pl-2 md:pl-4">
					&gt;{shown}%
				</p>
			</div>
		</div>
	{:else}
		<h1 bind:this={errorText} class="text-white text-9xl font-sans mix-blend-difference">Error</h1>
	{/if}
	{#if slow}
		<button
			type="button"
			title="Switch to the text and images only version"
			class="fixed bottom-6 left-1/2 -translate-x-1/2 pointer-events-auto text-xs font-mono uppercase underline text-white mix-blend-difference whitespace-nowrap"
			onclick={() => liteStore.enable()}
		>
			I have slow internet
		</button>
	{/if}
</div>
