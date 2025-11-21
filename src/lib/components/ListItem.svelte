<script lang="ts">
	import { animationStore, countStore, loadStore } from '$lib/stores/index.svelte';
	import type { Post } from '$lib/types';
	import { cubicInOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { goto } from '$app/navigation';
	import Awards from '$lib/components/Awards.svelte';
	import { page } from '$app/stores';

	const {
		item,
		index,
		activeIndex,
		selHeight,
		active
	}: {
		item: { content: string; catIndex: number } | Post;
		index: number;
		activeIndex: number;
		selHeight: number;
		active?: boolean;
	} = $props();

	const delay = $derived(loadStore.loaded ? 500 : 3000);
	//+= active element / 2 + (active pos - item pos) * item height
	const offset = $derived(
		!active && typeof item.catIndex === 'number'
			? (item.catIndex - activeIndex > 0 ? 1 : -1) * // -1
					(selHeight / 2) + //140
					(item.catIndex - activeIndex) * // -1
						30
			: 0
	);
</script>

{#if typeof item.content === 'string'}
	{#if $page.url.pathname === '/'}
		<li
			style={`transform: translateY(${offset}px)`}
			class="font-mono uppercase absolute left-0 transition-transform duration-150 opacity-30"
			class:animateText={item.content.toLowerCase() ===
				animationStore.currentCat[0].toString().toLowerCase() && animationStore.isAnimating}
			in:fly={{
				x: 200,
				duration: 500,
				easing: cubicInOut,
				delay: index * 100 + delay
			}}
			out:fade={{ duration: 400 }}
		>
			{item.content}
		</li>
	{/if}
{:else if (item as Post).title}
	<!-- if page is the current work page or not gallery page -->
	{#if !((!active && $page.params.slug) || $page.route.id?.includes('gallery'))}
		<li
			style={`transform: translateY(${offset}px)`}
			class="font-mono absolute w-full left-0 transition-transform duration-150"
			class:selected={active}
			in:fly={{
				x: 200,
				duration: 500,
				easing: cubicInOut,
				delay: index * 100 + delay
			}}
			out:fade={{ duration: 400 }}
		>
			{#if active && (item as Post).awards}
				<Awards item={item as Post} />
			{/if}
			<button
				class="text-left"
				onclick={(e) => {
					if (countStore.activeIndex === (item as Post).index) {
						if ((item as Post).slug.current !== 'reels') {
							goto(`/work/${(item as Post).slug.current}`);
						} else {
							// if reels then open
							goto('/#reels');
						}
					} else {
						countStore.inertiaIndex = (item as Post).index as number;
					}
				}}
			>
				{(item as Post).title}
			</button>
			{#if $page.params.slug}
				<p transition:fade class="font-mono text-xs font-normal text-white uppercase mt-8 absolute">
					{(item as Post).type}&emsp;&emsp;{(item as Post).role[0]}&emsp;&emsp;{(item as Post).year}
				</p>
			{/if}
		</li>
	{/if}
{/if}

<style lang="scss">
	.selected {
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 0ms;
		transition-property: font-family, font-size, font-weight, line-height;
		@apply font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl  font-bold;
	}

	.animateText {
		animation: leading 1s infinite;
	}

	@keyframes leading {
		0% {
			letter-spacing: 0;
			font-weight: 400;
		}
		50% {
			letter-spacing: 0.2em;
			font-weight: 900;
		}
		100% {
			letter-spacing: 0;
			font-weight: 400;
		}
	}
</style>
