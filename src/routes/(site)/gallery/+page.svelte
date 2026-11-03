<script lang="ts">
	import { onMount } from 'svelte';
	import { fade } from 'svelte/transition';
	import type { PageData } from './$types';
	import { loadStore } from '#lib/stores/index.svelte.js';

	let { data }: { data: Required<PageData> } = $props();

	onMount(() => {
		loadStore.galleryTransitioning = true;
		return () => {
			loadStore.galleryTransitioning = false;
		};
	});
</script>

{#if data.gallery && data.gallery.length === 0}
	<p>No gallery items found.</p>
{:else if data}
	<div
		class="gallery-container"
		style="min-height: 100vh;"
		in:fade={{ duration: 600, delay: 400 }}
	></div>
{/if}

<style>
	.gallery-container {
		width: 100vw;
		min-height: 100vh;
		position: relative;
	}

	/* .gallery-container :global(canvas) {
					background: #222 !important;
					z-index: 10;
		position: fixed !important;
		top: 0;
		left: 0;
		width: 100vw;
		height: 100vh;
	} */
</style>
