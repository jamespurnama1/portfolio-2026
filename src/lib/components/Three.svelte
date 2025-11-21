<script lang="ts">
	import GalleryScene from './GalleryScene.svelte';
	import ThreeScene from './ThreeScene.svelte';
	import RiveScene from './RiveScene.svelte';
	import type { PageData } from '../../routes/$types';
	let { data }: { data: PageData } = $props();
	import { Canvas } from '@threlte/core';
	import { page } from '$app/state';
	import { untrack, onMount, onDestroy, type SvelteComponent } from 'svelte';
	import PostFXManager from '$lib/components/PostFXManager.svelte';
	import PostFXScene from '$lib/components/PostFXScene.svelte';
	import ThrelteSizeProvider from '$lib/components/ThrelteSizeProvider.svelte';
	import { threlteSize } from '$lib/stores/threlteSize';
	import { countStore, loadStore } from '$lib/stores/index.svelte';
	import { gsap } from 'gsap';

	let riveSceneInstance: SvelteComponent | undefined = $state();
	let showStudio = $state(import.meta.env.MODE === 'development');

	const relativeMousePos = { pageX: 0, pageY: 0 };
	const mouse = $state({ x: 0, y: 0 });
	let size = { width: 0, height: 0 };
	let galleryLoaded = $state(false);
	let lastInertiaAnimation: 'home' | 'gallery' | null = $state(null);
	const unsubscribeThrelteSize = threlteSize.subscribe((v) => {
		size = v;
	});

	onDestroy(() => {
		unsubscribeThrelteSize();
		// 	window.removeEventListener('keydown', handleKey);
		// document.removeEventListener('mousemove', onMouseMove);
	});

	function handleKey(e: KeyboardEvent) {
		if (e.key === '`') {
			showStudio = !showStudio;
		}
	}

	export function getRiveSceneInstance() {
		return riveSceneInstance;
	}

	function onMouseMove(e: MouseEvent) {
		relativeMousePos.pageX = e.pageX;
		relativeMousePos.pageY = e.pageY - window.scrollY;
		if (!riveSceneInstance || !size.height || !size.width) return;
		mouse.y =
			(1 - relativeMousePos.pageY / size.height) * size.height -
			(size.height * riveSceneInstance.getCaretPos().scaleY) / 2 -
			size.height / 2;
		mouse.x =
			(relativeMousePos.pageX / size.width) * size.width -
			(size.width * riveSceneInstance.getCaretPos().scaleX) / 2 -
			size.width / 2;
	}

	// $inspect(mouse)

	onMount(() => {
		window.addEventListener('keydown', handleKey);
		document.addEventListener('mousemove', onMouseMove);
	});

	// Track which scene is currently rendered
	let showGallery = $state(page.url.pathname.includes('gallery') && data.gallery);
	let showCanvas = $state(!page.url.pathname.includes('gallery'));

	// $inspect(showGallery, showCanvas);

	let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// Watch for route changes
		page.route.id;
		untrack(() => {
			// If switching between gallery and non-gallery, delay the transition
			const isGallery = page.route.id?.includes('gallery') && data.gallery;
			if (isGallery !== showGallery) {
				// Optionally trigger transition-out animation here
				showGallery = false;
				showCanvas = false;
				galleryLoaded = false;
				if (transitionTimeout) clearTimeout(transitionTimeout);
				transitionTimeout = setTimeout(() => {
					showGallery = isGallery;
					showCanvas = !isGallery;
				}, 1000); // 1 second delay
			}
		});
	});

	// function animateInertiaIndex(routeKey: 'home' | 'gallery') {
	// 	if (!data.projectsLength || data.projectsLength <= 0) return;
	// 	const maxIndex = Math.max(0, data.projectsLength - 1);
	// 	gsap.killTweensOf(countStore);
	// 	countStore.inertiaIndex = maxIndex;
	// 	gsap.to(countStore, {
	// 		inertiaIndex: 0,
	// 		duration: 3,
	// 		ease: 'power3.out',
	// 		delay: 0.3,
	// 		overwrite: true
	// 	});
	// }

	// $effect(() => {
	// 	showGallery;
	// 	galleryLoaded;
	// 	loadStore.loaded;
	// 	untrack(() => {
	// 		if (showGallery && galleryLoaded && loadStore.loaded && lastInertiaAnimation !== 'gallery') {
	// 			lastInertiaAnimation = 'gallery';
	// 			requestAnimationFrame(() => animateInertiaIndex('gallery'));
	// 		}
	// 	});
	// });

	// $effect(() => {
	// 	showCanvas;
	// 	loadStore.loaded;
	// 	untrack(() => {
	// 		const isHomeRoute = !page.route.id?.includes('gallery');
	// 		if (showCanvas && loadStore.loaded && isHomeRoute && lastInertiaAnimation !== 'home') {
	// 			lastInertiaAnimation = 'home';
	// 			requestAnimationFrame(() => animateInertiaIndex('home'));
	// 		}
	// 	});
	// });
</script>

<Canvas>
	<ThrelteSizeProvider />
	{#if showStudio}
		{#await import('@threlte/studio') then { Studio }}
			<Studio>
				<PostFXManager {mouse}>
					{#if showGallery}
						<PostFXScene enabled={true}>
							<GalleryScene data={data.gallery![0]} bind:galleryLoaded />
						</PostFXScene>
					{:else if showCanvas}
						<PostFXScene enabled={true}>
							<ThreeScene {data} />
						</PostFXScene>
						<PostFXScene
							enabled={true}
							beforeRender={(delta: number) => {
								// Custom rendering logic for this scene
								riveSceneInstance!.beforeRender(delta);
							}}
						>
							<RiveScene {mouse} bind:this={riveSceneInstance} />
						</PostFXScene>
					{/if}
				</PostFXManager>
			</Studio>
		{/await}
	{:else}
		<PostFXManager {mouse}>
			{#if showGallery}
				<PostFXScene enabled={true}>
					<GalleryScene data={data.gallery![0]} bind:galleryLoaded />
				</PostFXScene>
			{:else if showCanvas}
				<PostFXScene enabled={true}>
					<ThreeScene {data} />
				</PostFXScene>
			{/if}
			<PostFXScene
				enabled={true}
				beforeRender={(delta: number) => {
					// Custom rendering logic for this scene
					riveSceneInstance!.beforeRender(delta);
				}}
			>
				<RiveScene {mouse} bind:this={riveSceneInstance} />
			</PostFXScene>
		</PostFXManager>
	{/if}
</Canvas>
