<script lang="ts">
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { afterNavigate } from '$app/navigation';
	import type { MediaAsset } from '$lib/types';
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
		maxSize = 1000
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
	} = $props();

	let sectionEl = $state() as HTMLElement;
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
			: 'md:flex-row'} p-4 {isHeroSection
		? 'items-center justify-center translate-y-0 opacity-100'
		: 'items-start justify-end translate-y-full opacity-0'} gap-8 relative min-h-screen"
>
	{#if !isHeroSection}
		<div class="min-h-0 min-w-[25vw] flex flex-col gap-2 {index % 2 === 0 ? 'mr-4' : 'ml-4'}">
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
		class="flex flex-col justify-center gap-5 invisible max-w-full {isHeroSection
			? 'w-[90vw] max-w-[90vw] md:order-2 md:w-[48vw] md:max-w-[48vw] md:flex-none'
			: ''}"
	>
		{#if image}
			<img
				id="media-{index}"
				src={displayImageSrc}
				alt={heading}
				class="object-contain max-w-full select-none {isHeroSection
					? 'w-[90vw] max-w-[90vw] md:w-auto md:max-w-[48vw] md:h-[46vh] md:min-w-0'
					: 'min-w-[50vw]'}"
				style={isHeroSection ? undefined : `width: ${mediaWidth};`}
			/>
		{:else if video}
			<video
				id="media-{index}"
				src={video.url}
				class="object-contain max-w-full max-h-[80vh] select-none {isHeroSection
					? 'w-[90vw] max-w-[90vw] md:w-auto md:max-w-[48vw] md:h-[46vh] md:min-w-0'
					: 'min-w-[50vw]'}"
				style={isHeroSection ? undefined : `width: ${mediaWidth};`}
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
			class="pointer-events-none mt-4 w-[90vw] max-w-[90vw] md:order-1 md:mt-0 md:mr-4 md:w-[16rem] md:max-w-[16rem] md:flex-none md:self-center"
		>
			<h1
				class="text-white mix-blend-difference font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold whitespace-pre-wrap text-left"
			>
				{heading}
			</h1>
			{#if top}
				<p class="font-mono text-xs text-white uppercase mt-4 text-left">{top}</p>
			{/if}
		</div>
	{/if}
</section>
