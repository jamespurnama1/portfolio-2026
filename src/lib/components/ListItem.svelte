<script lang="ts">
	import {
		animationStore,
		countStore,
		currentHomeCardSnapshotStore,
		loadStore,
		sharedCardTransitionStore
	} from '$lib/stores/index.svelte';
	import type { Post } from '$lib/types';
	import { cubicInOut } from 'svelte/easing';
	import { fade, fly } from 'svelte/transition';
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import Awards from '$lib/components/Awards.svelte';
	import { sfx } from '$lib/utils/sfx';
	import { reelViewer } from '$lib/stores/viewer.svelte';
	import { page } from '$app/state';
	import caret from '$lib/images/caret.svg';

	const {
		item,
		index,
		activeIndex,
		selHeight,
		active,
		extraDelay = 0
	}: {
		item: { content: string; catIndex: number } | Post;
		index: number;
		activeIndex: number;
		selHeight: number;
		active?: boolean;
		extraDelay?: number;
	} = $props();

	let hidden = $state(false);

	beforeNavigate(({ to }) => {
		if (to && to.url.pathname === '/' && countStore.activeIndex === (item as Post).index) {
			hidden = true;
		}
	});

	afterNavigate(() => {
		if (!hidden) return;
		requestAnimationFrame(() => {
			hidden = false;
		});
	});

	const delay = $derived(loadStore.loaded ? 500 : 3000);
	const targetSlug = $derived((item as Post).slug?.current ?? '');
	const isReelsItem = $derived(targetSlug === 'reels' || (item as Post).index === 0);

	function navigateToWorkFromList(targetPath: string, targetIndex: number) {
		const snapshot = currentHomeCardSnapshotStore.value;
		if (
			page.url.pathname === '/' &&
			snapshot &&
			snapshot.index === targetIndex &&
			snapshot.slug === targetSlug
		) {
			sharedCardTransitionStore.set({
				direction: 'to-work',
				index: snapshot.index,
				slug: snapshot.slug,
				geometry: snapshot.geometry,
				transform: snapshot.transform
			});
		}

		goto(targetPath);
	}

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
	{#if page.url.pathname === '/'}
		<li
			style={`transform: translateY(${offset}px)`}
			class="font-mono uppercase absolute md:left-0 max-md:text-center transition-transform duration-150 opacity-30 max-md:text-xs"
			class:animateText={item.content.toLowerCase() ===
				animationStore.currentCat[0].toString().toLowerCase() && animationStore.isAnimating}
			in:fly={{
				x: 200,
				duration: 500,
				easing: cubicInOut,
				delay: 0
			}}
			out:fade={{ duration: 400 }}
		>
			{item.content}
		</li>
	{/if}
{:else if (item as Post).title}
	<!-- if page is the current work page or not gallery page -->
	{#if !((!active && page.url.pathname.includes('work')) || page.route.id?.includes('gallery'))}
		<li
			style={`transform: translateY(${offset}px)`}
			class="font-mono max-md:text-xs absolute max-md:text-center md:left-0 transition-transform duration-150"
			class:selected={active}
			in:fly={{
				x: '100vw',
				duration: 500,
				easing: cubicInOut,
				delay: 0
			}}
			out:fade={{ duration: 400 }}
		>
			{#if active && (item as Post).awards}
				<Awards class={hidden ? 'opacity-0' : ''} item={item as Post} />
			{/if}
			<button
				onmouseenter={() => sfx.hover()}
				class:opacity-0={hidden}
				class:pointer-events-auto={page.url.pathname === '/' || page.url.pathname.includes('work')}
				class="md:text-left text-center group {active
					? 'hover:translate-x-12'
					: 'hover:translate-x-4'} {page.url.pathname === '/'
					? 'transition duration-300'
					: 'opacity-0'}"
				onclick={(e) => {
					const targetIndex = (item as Post).index as number;
					if (countStore.activeIndex !== targetIndex) {
						countStore.inertiaIndex = targetIndex;
						return;
					}

					if (isReelsItem) {
						if (reelViewer.open) reelViewer.open();
						else goto('/#reels');
					} else {
						navigateToWorkFromList(`/work/${targetSlug}`, targetIndex);
					}
				}}
			>
				<span
					class="absolute transition duration-300 mr-2 opacity-0 {active
						? 'translate-y-3 -left-12'
						: '-left-4 translate-y-1.5'} {page.url.pathname === '/'
						? 'group-hover:opacity-100'
						: ''}"
					><img
						src={caret}
						alt=""
						aria-hidden="true"
						class="{active ? 'w-10' : 'w-4'} h-auto -rotate-90 invert dark:invert-0"
					/></span
				>{(item as Post).title}
			</button>
			{#if page.url.pathname.includes('work') && ((item as Post).role?.length ?? 0)}
				<p
					class:opacity-0={hidden}
					transition:fade
					class="font-mono text-xs font-normal text-white uppercase mt-8 absolute max-md:text-center max-md:w-full"
				>
					{(item as Post).type}&emsp;&emsp;{(item as Post).role[0]}&emsp;&emsp;{(item as Post).year}
				</p>
			{/if}
		</li>
	{/if}
{/if}

<style>
	@reference "tailwindcss";
	.selected {
		transition-timing-function: cubic-bezier(0.4, 0, 0.2, 1);
		transition-duration: 0ms;
		transition-property: font-family, font-size, font-weight, line-height;
		@apply font-sans text-2xl sm:text-4xl md:text-5xl 2xl:text-7xl  font-bold;
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
