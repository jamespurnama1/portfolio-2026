<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { afterNavigate } from '$app/navigation';
	import Awards from '$lib/components/Awards.svelte';
	import type { MediaAsset, Post } from '$lib/types';
	import { optionsStore } from '$lib/stores/options.svelte';

	let {
		index,
		heading,
		body,
		top,
		bottom,
		image,
		imageLight,
		video,
		imageCaption,
		imageWidth = 0,
		imageHeight = 0,
		maxSize = 1000,
		forceVisibleMedia = false,
		awardsItem
	}: {
		index: number;
		heading?: string;
		body?: string;
		top?: string;
		bottom?: string;
		image?: MediaAsset;
		imageLight?: MediaAsset;
		video?: MediaAsset;
		imageCaption?: string;
		imageWidth?: number;
		imageHeight?: number;
		maxSize?: number;
		forceVisibleMedia?: boolean;
		awardsItem?: Post;
	} = $props();

	let sectionEl = $state() as HTMLElement;
	let innerWidth = $state(0);
	const isHeroSection = $derived(index === 0);
	const displayImageSrc = $derived.by(() => {
		if (isHeroSection && !optionsStore.dark && imageLight?.url) return imageLight.url;
		return image?.url ?? imageLight?.url;
	});
	const mediaWidth = $derived.by(() => {
		if (imageWidth > 0 && imageHeight > 0) {
			return `min(${maxSize}px, ${imageWidth}px)`;
		}

		return 'min(50vw, 100%)';
	});
	const mobileMediaWidth = 'calc(100vw - 4rem)';
	const resolvedDetailMediaWidth = $derived(innerWidth >= 768 ? mediaWidth : mobileMediaWidth);
	const showMediaFallback = $derived(forceVisibleMedia);

	onMount(() => {
		animateIn();
	});

	afterNavigate(({ to }) => {
		if (to?.url.pathname.includes('work')) {
			animateIn();
		}
	});

	function animateIn() {
		if (isHeroSection) return;
		if (!sectionEl) return;
		gsap.killTweensOf(sectionEl);
		gsap.to(sectionEl, {
			y: 0,
			opacity: 1,
			duration: 0.6,
			ease: 'power3.out'
		});
	}
</script>

<section
	bind:this={sectionEl}
	class="w-full flex flex-col {isHeroSection
		? 'md:flex-row md:justify-center md:items-center'
		: index % 2 === 0
			? 'md:flex-row-reverse'
			: 'md:flex-row'} p-8 md:p-4 {isHeroSection
		? 'items-center justify-center translate-y-0 opacity-100 md:min-h-screen'
		: 'items-start justify-end translate-y-full opacity-0 md:min-h-screen'} gap-4 md:gap-8 relative"
>
	{#if !isHeroSection}
		<div
			class="min-h-0 min-w-0 md:min-w-[25vw] flex flex-col gap-2 {index % 2 === 0
				? 'md:mr-4'
				: 'md:ml-4'}"
		>
			{#if heading}
				<h2
					class="text-white mix-blend-difference font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold whitespace-pre-wrap"
				>
					{heading}
				</h2>
			{/if}
			{#if body}
				<p class="text-white mix-blend-difference whitespace-pre-wrap">{body}</p>
			{/if}
		</div>
	{/if}

	<div
		class="flex w-full flex-col items-center justify-center gap-5 max-w-full pointer-events-none transition-opacity duration-300 {showMediaFallback
			? 'opacity-100'
			: 'opacity-0'} {isHeroSection ? 'md:order-2 md:w-[48vw] md:max-w-[48vw] md:flex-none' : ''}"
	>
		{#if image}
			<img
				id="media-{index}"
				src={displayImageSrc}
				alt={heading}
				class="object-contain max-w-full select-none {isHeroSection
					? 'w-full max-w-full mx-auto md:w-auto md:max-w-[48vw] md:h-[46vh] md:min-w-0'
					: 'w-full max-w-full mx-auto md:w-auto md:max-w-full'}"
				style={isHeroSection
					? innerWidth >= 768
						? undefined
						: `width: ${mobileMediaWidth};`
					: `width: ${resolvedDetailMediaWidth};`}
			/>
		{:else if video}
			<video
				id="media-{index}"
				src={video.url}
				class="object-contain max-w-full max-h-[80vh] select-none {isHeroSection
					? 'w-full max-w-full mx-auto md:w-auto md:max-w-[48vw] md:h-[46vh] md:min-w-0'
					: 'w-full max-w-full mx-auto md:w-auto md:max-w-full'}"
				style={isHeroSection
					? innerWidth >= 768
						? undefined
						: `width: ${mobileMediaWidth};`
					: `width: ${resolvedDetailMediaWidth};`}
				autoplay
				loop
				muted
				playsinline
			></video>
		{/if}
		<p class="font-mono text-xs text-white {bottom ? '' : 'opacity-0'}">{bottom ? '' : ''}</p>
	</div>

	{#if isHeroSection && heading}
		<div
			class="mt-2 w-[calc(100vw-4rem)] max-w-[calc(100vw-4rem)] md:order-1 md:mt-0 md:mr-4 md:w-[20rem] md:max-w-[20rem] md:flex-none md:self-center"
		>
			<h1
				class="pointer-events-none text-white mix-blend-difference font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold whitespace-pre-wrap text-left"
			>
				{heading}
			</h1>
			{#if awardsItem?.awards?.length}
				<div class="mt-4 flex w-full max-w-full justify-start overflow-hidden">
					<Awards item={awardsItem} class="text-white mix-blend-difference" />
				</div>
			{/if}
			{#if top}
				<p class="pointer-events-none font-mono text-xs text-white uppercase mt-4 text-left">
					{top}
				</p>
			{/if}
		</div>
	{/if}
</section>

<svelte:window bind:innerWidth />
