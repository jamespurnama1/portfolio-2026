<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { afterNavigate } from '$app/navigation';
	import Awards from '#lib/components/Awards.svelte';
	import type { MediaAsset, Post } from '#lib/types/index.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { placeholderStyle } from '#lib/utils/placeholder.js';
	import { aiLabel } from '#lib/utils/ai.js';

	type MetaItem = { text: string | number; title?: string };

	let {
		index,
		heading,
		body,
		top,
		bottom,
		image,
		imageLight,
		video,
		nextAttached = false,
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
		nextAttached?: boolean;
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
	// The tooltip is moved to <body> so the page's difference blend doesn't invert it.
	let tip = $state<{ text: string; x: number; y: number } | null>(null);
	function showTip(event: MouseEvent | FocusEvent, text: string) {
		if (event instanceof MouseEvent) {
			tip = { text, x: event.clientX, y: event.clientY };
		} else {
			const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
			tip = { text, x: rect.left, y: rect.bottom };
		}
	}
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		return { destroy: () => node.remove() };
	}
	const metaItems = $derived<MetaItem[]>(
		awardsItem
			? [
					{ text: awardsItem.type },
					...(awardsItem.role ?? []).map((text) => ({ text })),
					{ text: aiLabel(awardsItem.aiInvolvement), title: awardsItem.aiDescription ?? undefined },
					{ text: awardsItem.year }
				].filter((meta) => meta.text)
			: []
	);
	const hasText = $derived(!!heading?.trim() || !!body?.trim());
	const displayImageSrc = $derived.by(() => {
		if (isHeroSection && video && !image) return undefined;
		if (!optionsStore.dark && imageLight?.url) return imageLight.url;
		return image?.url ?? imageLight?.url;
	});

	const displayLqip = $derived(
		!optionsStore.dark && imageLight?.url ? imageLight.lqip : (image?.lqip ?? imageLight?.lqip)
	);

	// Sanity asset URLs embed the pixel size, which lets the browser reserve space before load.
	const intrinsicSize = $derived.by(() => {
		const match = displayImageSrc?.match(/-(\d+)x(\d+)\.[a-z]+/i);
		return match ? { width: Number(match[1]), height: Number(match[2]) } : null;
	});
	const interactive = $derived(forceVisibleMedia && !!onOpen);
	const mediaSizing = $derived(
		isHeroSection
			? 'w-full max-w-full mx-auto max-md:w-[calc(100vw-4rem)] md:w-auto md:max-w-[48vw] md:max-h-[46vh] md:min-w-0'
			: hasText
				? 'mx-auto max-w-full w-[calc(100vw-4rem)] md:w-auto md:max-w-[min(60vw,600px)]'
				: 'mx-auto w-full max-w-full md:w-auto md:max-w-[min(85vw,1200px)]'
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
		? 'md:grid md:grid-cols-[minmax(0,20rem)_minmax(0,1fr)] md:content-center md:items-start'
		: index % 2 === 0
			? 'md:flex-row-reverse'
			: 'md:flex-row'} p-8 md:p-4 {isHeroSection
		? 'items-start justify-center translate-y-0 opacity-100 mt-12 md:mt-[12svh]'
		: `items-start ${hasText ? 'justify-end' : 'justify-center'} translate-y-full opacity-0`} {!nextAttached
		? 'mb-16 md:mb-[25svh]'
		: ''} gap-4 md:gap-8 relative"
>
	{#if isHeroSection && heading}
		<div class="order-1 w-full min-w-0 md:col-span-2">
			<h1
				class="pointer-events-none text-white mix-blend-difference font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold whitespace-pre-wrap text-left"
			>
				{heading}
			</h1>
			{#if awardsItem?.awards?.length}
				<div class="mt-4 flex w-full max-w-full flex-col justify-start pointer-events-auto">
					<Awards item={awardsItem} class="text-white mix-blend-difference" />
				</div>
			{/if}
		</div>
		<div class="order-3 w-full min-w-0 md:col-start-1 md:row-start-2">
			{#if awardsItem}
				<p class="font-mono text-xs text-white mix-blend-difference uppercase">
					{#each metaItems as meta, i}{#if i}{' \u00B7 '}{/if}{#if meta.title}<span
								class="pointer-events-auto cursor-help underline decoration-dotted"
								role="note"
								tabindex="0"
								onmouseenter={(e) => showTip(e, meta.title!)}
								onmousemove={(e) => showTip(e, meta.title!)}
								onmouseleave={() => (tip = null)}
								onfocus={(e) => showTip(e, meta.title!)}
								onblur={() => (tip = null)}>{meta.text}</span
							>{:else}<span>{meta.text}</span>{/if}{/each}
				</p>
				{#if awardsItem.description}
					<p class="mt-4 whitespace-pre-wrap text-white mix-blend-difference">
						{awardsItem.description}
					</p>
				{/if}
			{/if}
			{#if top}
				<p class="pointer-events-none font-mono text-xs text-white uppercase mt-4 text-left">
					{top}
				</p>
			{/if}
		</div>
	{/if}

	{#if !isHeroSection && hasText}
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
			? 'order-2 md:col-start-2 md:row-start-2'
			: ''}"
	>
		<figure class="relative w-fit max-w-full">
			{#if displayImageSrc}
				<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
				<img
					id="media-{index}"
					use:trackLoad
					onload={() => (imageLoaded = true)}
					style={imageLoaded ? undefined : placeholderStyle(displayImageSrc, displayLqip)}
					data-lqip={displayLqip}
					data-viewer-src={image?.url ?? imageLight?.url}
					data-viewer-lqip={image?.url ? image.lqip : imageLight?.lqip}
					data-caption={bottom}
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
					data-caption={bottom}
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
			{#if bottom && (displayImageSrc || video)}
				<figcaption
					class="pointer-events-none mt-2 max-w-full font-mono text-xs text-white mix-blend-difference"
				>
					{bottom}
				</figcaption>
			{/if}
		</figure>
	</div>
</section>

{#if tip}
	<div
		use:portal
		role="tooltip"
		class="ai-tip font-mono text-xs"
		class:dark={optionsStore.dark}
		style:left="{Math.min(
			tip.x + 14,
			(typeof window === 'undefined' ? 0 : window.innerWidth) - 300
		)}px"
		style:top="{tip.y + 18}px"
	>
		{tip.text}
	</div>
{/if}

<style>
	.ai-tip {
		position: fixed;
		z-index: 70;
		width: max-content;
		max-width: 18rem;
		padding: 0.6rem 0.8rem;
		pointer-events: none;
		background-color: #fff;
		color: #000;
		box-shadow:
			0 0 10px rgb(255, 255, 255, 0.3),
			-10px 0 40px rgb(255, 0, 255, 0.3),
			10px 0 40px rgb(0, 255, 255, 0.3);
	}

	.ai-tip.dark {
		background-color: #000;
		color: #fff;
	}

	.ai-tip::after {
		content: '';
		position: absolute;
		z-index: -1;
		inset: 0;
		animation: glowing 5s infinite;
	}
</style>
