<script lang="ts">
	import { page } from '$app/state';
	import { gptStore, loadStore } from '$lib/stores/index.svelte';
	import ScrambleText from '$lib/components/ScrambleText.svelte';
	import { cubicInOut } from 'svelte/easing';
	import { fly } from 'svelte/transition';

	let { revealed = loadStore.loaded }: { revealed?: boolean } = $props();
</script>

<header
	class="mix-blend-difference uppercase text-white text-xs font-mono z-20 relative overflow-hidden"
>
	<nav class="flex justify-between items-start fixed w-full p-4 top-0 left-0">
		{#if revealed}
			<a transition:fly={{ y: -200, duration: 500, easing: cubicInOut }} href="/about"
				><p><ScrambleText text="about" /></p></a
			>
			<!-- <button
				transition:fly={{ y: -200, duration: 500, easing: cubicInOut, delay: 100 }}
				on:click={() => gptStore.opened = true}>
				<p class="uppercase">ask me anything</p></button
			> -->
			<a
				transition:fly={{ y: -200, duration: 500, easing: cubicInOut, delay: 100 }}
				class="block max-md:hidden"
				href="mailto:hello@jameshenry.site"><p><ScrambleText text="hello@jameshenry.site" /></p></a
			>
			<!-- temporarily disabled gallery -->
			<!-- <a href="/gallery"><p>gallery</p></a> -->
			<a
				transition:fly={{ y: -200, duration: 500, easing: cubicInOut, delay: 200 }}
				class="goback"
				class:invisible={page.url.pathname === '/'}
				href="/"><p>go back</p></a
			>
		{/if}
	</nav>
	<aside
		class="fixed top-0 right-4 max-md:gap-4 h-full flex flex-col justify-center text-right -z-0 transition-opacity delay-300 {gptStore.opened
			? 'max-md:opacity-0 max-md:pointer-events-none'
			: ''}"
	>
		{#if revealed}
			<a
				href="https://instagram.com/jamespurnama1"
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 300 }}
				><p><ScrambleText text="IG" /></p></a
			>
			<a
				href="https://github.com/jamespurnama1"
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 400 }}
				><p><ScrambleText text="GH" /></p></a
			>
			<a
				href="https://behance.com/jamespurnama"
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 500 }}
				><p><ScrambleText text="BE" /></p></a
			>
			<a
				href="https://www.linkedin.com/in/jamespurnama"
				target="_blank"
				rel="noopener noreferrer"
				transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 600 }}
				><p><ScrambleText text="IN" /></p></a
			>
		{/if}
	</aside>
</header>
