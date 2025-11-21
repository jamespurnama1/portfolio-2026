<script lang="ts">
	import { animationStore, countStore, loadStore } from '$lib/stores/index.svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
</script>

<svelte:head>
	<title>James Henry</title>
	<meta name="description" content="Portfolio" />
</svelte:head>

<section class="landing-section">
	{#if countStore.isNewCat}
		<div class="category-label" transition:scale={{ duration: 500, start: 0.5, easing: quintOut }}>
			<h2>
				{animationStore.currentCat[0]}
			</h2>
		</div>
	{/if}
</section>

<style>
	.landing-section {
		width: 100vw;
		height: 100vh;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6rem;
		position: relative;
	}

	.category-label {
		position: absolute;
		transform: translateX(-66.666667%);
		pointer-events: none;
		text-align: center;
		width: 30vw;
		top: 20%;
	}

	.category-label h2 {
		color: white;
		text-transform: uppercase;
		font-family: 'Source Code Pro Variable', monospace;
		font-size: 3.75rem;
		line-height: 1;
		margin: 0;
	}

	@media (min-width: 1536px) {
		.category-label {
			top: 25%;
		}
	}

	:global(body:not(.loaded)) .category-label {
		top: 50%;
	}
</style>
