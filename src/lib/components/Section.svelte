<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { afterNavigate } from '$app/navigation';
	import Awards from '$lib/components/Awards.svelte';
	import type { MediaAsset, Post } from '$lib/types';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { placeholderStyle } from '$lib/utils/placeholder';

	let {
		index,
		heading,
		body,
		top,
		bottom,
		image,
		imageLight,
		video,
		forceVisibleMedia = false,
		awardsItem,
		onOpen
	}: {
		index: number;
		heading?: string;
		body?: string;
		top?: string;
		bottom?: string;
		image?: MediaAsset;
		imageLight?: MediaAsset;
		video?: MediaAsset;
		forceVisibleMedia?: boolean;
		awardsItem?: Post;
		onOpen?: (media: { url: string; isVideo: boolean; alt: string; source: HTMLElement }) => void;
	} = $props();

	let sectionEl = $state() as HTMLElement;
	let imageLoaded = $state(false);
	// Also covers images that finished loading before hydration.
	function trackLoad(node: HTMLImageElement) {
		if (node.complete && node.naturalWidth > 0) imageLoaded = true;
	}
	const isHeroSection = $derived(index === 0);
	const displayImageSrc = $derived.by(() => {
		if (isHeroSection && !optionsStore.dark && imageLight?.url) return imageLight.url;
		return image?.url ?? imageLight?.url;
	});
	const displayLqip = $derived(
		isHeroSection && !optionsStore.dark && imageLight?.url
			? imageLight.lqip
			: (image?.lqip ?? imageLight?.lqip)
	);
	// Sanity asset URLs embed the pixel size, which lets the browser reserve space before load.
	const intrinsicSize = $derived.by(() => {
		const match = displayImageSrc?.match(/-(\d+)x(\d+)\.[a-z]+/i);
		return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
	});
	const interactive = $derived(forceVisibleMedia && !!onOpen);
	const mediaSizing = $derived(
		isHeroSection
			? 'w-full max-w-full mx-auto max-md:w-[calc(100vw-4rem)] md:w-auto md:max-w-[48vw] md:h-[46vh] md:min-w-0'
			: 'mx-auto max-w-full w-[calc(100vw-4rem)] md:w-auto md:max-w-[min(60vw,600px)]'
	);

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
		? 'items-center justify-center translate-y-0 opacity-100 md:min-h-svh'
		: 'items-start justify-end translate-y-full opacity-0 md:min-h-svh'} gap-4 md:gap-8 relative"
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
		class="flex w-full flex-col items-center justify-center gap-5 max-w-full transition-opacity duration-300 {interactive
			? ''
			: 'pointer-events-none'} {forceVisibleMedia ? 'opacity-100' : 'opacity-0'} {isHeroSection
			? 'md:order-2 md:w-[48vw] md:max-w-[48vw] md:flex-none'
			: ''}"
	>
		{#if image}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<img
				id="media-{index}"
				use:trackLoad
				onload={() => (imageLoaded = true)}
				style={imageLoaded ? undefined : placeholderStyle(displayImageSrc, displayLqip)}
				data-lqip={displayLqip}
				src={displayImageSrc}
				alt={heading}
				width={intrinsicSize?.width}
				height={intrinsicSize?.height}
				loading={isHeroSection ? 'eager' : 'lazy'}
				decoding="async"
				class="h-auto object-contain select-none {mediaSizing} {optionsStore.dark
					? ''
					: 'invert'} {interactive ? 'pointer-events-auto' : ''}"
				onclick={(e) =>
					interactive && displayImageSrc
						? onOpen?.({
								url: displayImageSrc,
								isVideo: false,
								alt: heading ?? '',
								source: e.currentTarget
							})
						: undefined}
			/>
		{:else if video}
			<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
			<video
				id="media-{index}"
				src={video.url}
				class="h-auto object-contain max-h-[80vh] select-none {mediaSizing} {optionsStore.dark
					? ''
					: 'invert'} {interactive ? 'pointer-events-auto' : ''}"
				autoplay
				loop
				muted
				playsinline
				preload="metadata"
				onclick={(e) =>
					interactive
						? onOpen?.({
								url: video.url,
								isVideo: true,
								alt: heading ?? '',
								source: e.currentTarget
							})
						: undefined}
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
				<div
					class="mt-4 flex w-full max-w-full flex-col justify-start overflow-hidden pointer-events-auto"
				>
					<Awards item={awardsItem} stacked class="text-white mix-blend-difference" />
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
