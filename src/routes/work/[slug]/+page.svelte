<script lang="ts">
	import { afterNavigate, goto } from '$app/navigation';
	import { page } from '$app/stores';
	import {
		countStore,
		animationStore,
		gptStore,
		scrollStore,
		loadStore
	} from '$lib/stores/index.svelte';
	import Section from '$lib/components/Section.svelte';
	import { gsap } from 'gsap';
	import { onMount, tick, untrack } from 'svelte';
	import { type PageData } from './$types';
	import { optionsStore } from '$lib/stores/options.svelte';
	import type { Post } from '$lib/types';
	import caret from '$lib/images/caret.svg';
	import chroma from 'chroma-js';
	import { cardDimensionsStore } from '$lib/stores/cardDimensions.svelte';

	const { data }: { data: Required<PageData> } = $props();
	let caretEl = $state() as HTMLImageElement;
	let innerWidth = $state(0);
	let scrollHeight = $state(0);
	let innerHeight = $state(0);
	let animating = true;

	const mapper = gsap.utils.mapRange(0, 300, 0, 100);
	const mapper2 = gsap.utils.mapRange(0, 300, 88, 15);

	// $effect(() => {
	// 	scrollStore.overScroll;
	// 	untrack(() => {
	// 		if (animating || delay) return;
	// 		// gsap.killTweensOf('section');
	// 		gsap.set('section', {
	// 			y: `-${(Math.log10(scrollStore.overScroll / 100) + 1.5) * 100}`,
	// 			onUpdate: () => {
	// 				// try to reset to 0 if not scrolling
	// 				if (scrollStore.overScroll < 4000) return;
	// 				// scrolled past 1000 pixels
	// 				// gsap.set('html', { overflowY: 'hidden' });
	// 				delay = true;
	// 				gsap.to('.gradient', {
	// 					opacity: 0,
	// 					duration: 0.5
	// 				});
	// 				gsap.to('section', {
	// 					y: '100%',
	// 					opacity: 0,
	// 					duration: 0.5,
	// 					onComplete: () => {
	// 						animating = true;
	// 						countStore.inertiaIndex = currIndex! + 1;
	// 						goto(`/work/${data.projects[currIndex! + 1].slug.current}`);
	// 					}
	// 				});
	// 			}
	// 		});
	// 		// on scroll
	// 		gsap.set('.gradient', {
	// 			opacity: mapper(Math.max(0, Math.log10(scrollStore.overScroll / 10)))
	// 		});
	// 	});
	// });

	let current = $state() as Post | undefined;

	function updateCurrent() {
		current = data.projects.find((x) => x.slug.current === $page.params.slug);
		if (!current) {
			goto('/404');
			throw new Error('not found');
		}
		if (typeof currIndex === 'number') countStore.inertiaIndex = currIndex;
	}

	let delay = $state(false);

	afterNavigate(({ to }) => {
		updateCurrent();
		animateIn();
		setTimeout(() => (delay = false), 3000);
	});

	const base = $derived(optionsStore.dark ? '#000000' : '#ffffff');
	const currIndex = $derived(current ? data.projects.map((x) => x._id).indexOf(current._id) : null);
	const inputColor = $derived(current ? current.color.hex : base);
	const nextInputColor = $derived(
		typeof currIndex === 'number' && data.projects[currIndex + 1].color
			? data.projects[currIndex + 1].color.hex
			: base
	);
	const colorScale = $derived(chroma.scale([inputColor, base]).mode('lab').colors(3));
	const nextColorScale = $derived(
		chroma
			.scale([
				chroma(nextInputColor).set('hsl.h', '-10'),
				base,
				chroma(nextInputColor).set('hsl.h', '+10').set('hsl.s', '+20')
			])
			.colors(3)
	);

	onMount(async () => {
		animateIn();
		updateCurrent();
		scrollStore.scroll = document.body.scrollTop;
		await tick();
		scrollHeight = document.documentElement.scrollHeight;
	});

	const progress = $derived(
		gsap.utils.mapRange(0, scrollHeight, 0, innerHeight, scrollStore.scroll)
	);

	let caretMoving = $state(false);
	let prevScroll = $state(0);
	$effect(() => {
		scrollStore.scroll;
		untrack(() => {
			// if scrolling up
			if (prevScroll > scrollStore.scroll && !caretMoving) {
				gsap.set(caretEl, {
					y: `${innerHeight}px`,
					rotate: '180deg'
				});
				gsap.to(caretEl, {
					y: 0,
					clearProps: 'transform',
					duration: 0.75,
					onStart: () => {
						caretMoving = true;
					},
					onComplete: () => {
						caretMoving = false;
					}
				});
			} else if (!caretMoving) {
				gsap.to(caretEl, {
					y: `${innerHeight}px`,
					clearProps: 'transform',
					duration: 0.75,
					onStart: () => {
						caretMoving = true;
					},
					onComplete: () => {
						caretMoving = false;
					}
				});
			}
			prevScroll = scrollStore.scroll;
		});
	});

	function animateIn() {
		// scrollStore.overScroll = 0;
		document.documentElement.scrollTop = 0;
		scrollStore.scroll = document.documentElement.scrollTop;

		gsap.to('.gradient-top', {
			opacity: 1,
			delay: 1
		});
		gsap.to('.gradient-top', {
			opacity: 0,
			delay: 4,
			onComplete: () => {
				animating = false;
				// gsap.set('html', { overflowY: 'auto' });
			}
		});
	}
</script>

<aside
	style={`background-color: ${base}; background-image: radial-gradient(at 25% 100%, ${base} 0, transparent 75%),
			radial-gradient(at 75% 100%, ${base} 0, transparent 75%),
			radial-gradient(at 51.94% 30%, ${colorScale[0]} 0, transparent 50%),
			radial-gradient(at 87.56% 0%, ${colorScale[2]} 0, transparent 50%),
			radial-gradient(at 15.21% 0%, ${colorScale[1]} 0, transparent 87%);`}
	class="fixed top-0 h-[40vh] w-full gradient-top -z-30 opacity-0 dark:invert-0 invert"
></aside>
<aside
	style={`height: ${progress}px`}
	class="fixed top-0 right-0 w-3 bg-gradient-to-b from-stone-700 to-stone-100/0 dark:from-slate-300 dark:to-slate-900/0 origin-top overflow-hidden pointer-events-none"
>
	<img bind:this={caretEl} src={caret} alt="scroll caret" class="absolute w-3 right-0 -top-5" />
</aside>
<article
	class="relative overflow-hidden self-start w-full"
	class:opacity-0={optionsStore.fullscreen || gptStore.opened}
>
	{#if current && typeof currIndex === 'number'}
		<Section
			heading={data.projects[currIndex].title}
			index={0}
		/>
		{#each current.content as item, index}
			{#if data.projects && data.projects[currIndex] && data.projects[currIndex].content && data.projects[currIndex].content[index]}
				<!-- Calculate imageWidth and imageHeight inside the block -->
				{@const contentItem = data.projects[currIndex].content[index]}
				{@const imageWidth = $cardDimensionsStore[index]?.width ?? 0}
				{@const imageHeight = $cardDimensionsStore[index]?.height ?? 0}
				{@const maxSize = Math.min(innerWidth*0.6, 600)}
				<Section
					index={index + 1}
					body={item.body}
					heading={item.headline}
					bottom={item.caption}
					image={contentItem.image}
					video={contentItem.video}
					imageLight={contentItem.imageLight}
					imageCaption={contentItem.caption}
					{imageWidth}
					{imageHeight}
					{maxSize}
				/>
			{/if}
		{/each}
	{/if}
	{#if typeof currIndex === 'number' && data.projects[currIndex + 1]}
		<aside
			style={`background-color: ${base}; 
				background-image: radial-gradient(at 25% 0%, ${base} 0, transparent 30%),
				radial-gradient(at 75% 0%, ${base} 0, transparent 75%),
				radial-gradient(at 51.94% 0%, ${nextColorScale[2]} 0, transparent 100%),
				radial-gradient(at 87.56% 50%, ${nextColorScale[1]} 0, transparent 30%),
				radial-gradient(at 15% 88%, ${nextColorScale[0]} 0, transparent 30%);`}
			class="h-[40vh] w-full gradient -z-30 flex text-center justify-center items-center flex-col dark:invert-0 invert [mask-image:linear-gradient(to_bottom,transparent_0%,white_40%)]"
		>
			<a href={`/work/${data.projects[currIndex + 1].slug.current}`}>
				<div
					class="flex items-center justify-center text-white mix-blend-difference font-mono uppercase text-xs gap-5"
				>
					<p class="text-base">&gt;</p>
					<div>
						<!-- <p>Keep Scrolling</p> -->
						<p>Next Project</p>
					</div>
					<p class="text-base">&gt;</p>
				</div>
				<h4 class="text-4xl font-bold text-white mix-blend-difference">
					{data.projects[currIndex + 1].title}
				</h4>
			</a>
		</aside>
	{/if}
</article>

<svelte:window bind:innerWidth bind:innerHeight />
