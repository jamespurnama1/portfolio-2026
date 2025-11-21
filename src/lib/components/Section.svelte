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

	onMount(() => {
		animateIn();
	});

	afterNavigate(({ to }) => {
		if (to?.url.pathname.includes('work')) {
			animateIn();
		}
	});

	function animateIn() {
		gsap.to('section', {
			y: 0,
			opacity: 1
			// delay: 3
		});
	}
</script>

<section
	class="w-full flex flex-col {index % 2 === 0
		? 'md:flex-row-reverse'
		: 'md:flex-row'} p-4 items-start justify-end gap-8 translate-y-full opacity-0 relative min-h-screen"
>
	<!-- Match position with <ul> from layout -->
	<div class="min-h-0 {index === 0 ? 'mr-0 absolute right-0' : index % 2 === 0 ? 'mr-4' : 'ml-4'}">
		{#if !index && heading}
			<h1
				class="text-white mix-blend-difference font-sans text-3xl sm:text-4xl md:text-5xl 2xl:text-7xl font-bold whitespace-pre-wrap invisible"
			>
				{heading}
			</h1>
			<p class="font-mono text-xs text-white uppercase mt-8 {top ? '' : 'opacity-0'}">
				{top ? top : ''}
			</p>
		{:else if heading}
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
	<div class="flex flex-col justify-center gap-5 invisible">
		<!-- Placeholder matches actual image size -->
		{#if image}
			<img
				id="media-{index}"
				src={imageLight && !optionsStore.dark ? imageLight.url : image.url}
				alt={heading}
				class="object-contain max-w-full select-none min-w-[50vw]"
			/>
		{:else if video}
			<video
				id="media-{index}"
				src={video.url}
				class="object-contain max-w-full max-h-[80vh] select-none min-w-[50vw]"
				autoplay
				loop
				muted
				playsinline
			></video>
		{/if}
		<p class="font-mono text-xs text-white {bottom ? '' : 'opacity-0'}">{bottom ? '' : ''}</p>
	</div>
</section>
