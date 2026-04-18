<script lang="ts">
	import GalleryScene from './GalleryScene.svelte';
	import ThreeScene from './ThreeScene.svelte';
	import RiveScene from './RiveScene.svelte';
	import type { PageData } from '../../routes/$types';
	let { data, preferImageThumbnails = false }: { data: PageData; preferImageThumbnails?: boolean } =
		$props();
	import { Canvas } from '@threlte/core';
	import { page } from '$app/state';
	import { untrack, onMount, onDestroy, type SvelteComponent } from 'svelte';
	import PostFXManager from '$lib/components/PostFXManager.svelte';
	import PostFXScene from '$lib/components/PostFXScene.svelte';
	import ThrelteSizeProvider from '$lib/components/ThrelteSizeProvider.svelte';
	import { threlteSize } from '$lib/stores/threlteSize';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { gptStore, loadStore } from '$lib/stores/index.svelte';

	let riveSceneInstance: SvelteComponent | undefined = $state();
	let showStudio = $state(false);
	let isTouchDevice = $state(false);
	let hasPointerPosition = $state(false);

	const relativeMousePos = { x: 0, y: 0 };
	const mouse = $state({ x: 0, y: 0 });
	let size = $state({ width: 0, height: 0 });
	let galleryLoaded = $state(false);
	const cursorVisible = $derived(!(isTouchDevice && loadStore.loaded));
	$effect(() => {
		const unsubscribe = threlteSize.subscribe((v) => {
			size = v;
		});

		return () => unsubscribe();
	});

	onDestroy(() => {
		// 	window.removeEventListener('keydown', handleKey);
		// document.removeEventListener('mousemove', onMouseMove);
	});

	function handleKey(e: KeyboardEvent) {
		if (e.key === '`') {
			if (gptStore.opened) return;
			showStudio = !showStudio;
		}
	}

	export function getRiveSceneInstance() {
		return riveSceneInstance;
	}

	function syncMouseToViewport() {
		if (!riveSceneInstance || !size.height || !size.width || !hasPointerPosition) return;
		const caretPos = riveSceneInstance.getCaretPos();
		mouse.y =
			(1 - relativeMousePos.y / size.height) * size.height -
			(size.height * caretPos.scaleY) / 2 -
			size.height / 2;
		mouse.x =
			(relativeMousePos.x / size.width) * size.width -
			(size.width * caretPos.scaleX) / 2 -
			size.width / 2;
	}

	function onMouseMove(e: MouseEvent) {
		relativeMousePos.x = e.clientX;
		relativeMousePos.y = e.clientY;
		hasPointerPosition = true;
		syncMouseToViewport();
	}

	$effect(() => {
		size.width;
		size.height;
		untrack(() => {
			if (isTouchDevice) return;
			syncMouseToViewport();
		});
	});

	// $inspect(mouse)

	onMount(() => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		window.addEventListener('keydown', handleKey);
		if (!isTouchDevice) {
			document.addEventListener('mousemove', onMouseMove);
		}
		return () => {
			window.removeEventListener('keydown', handleKey);
			if (!isTouchDevice) {
				document.removeEventListener('mousemove', onMouseMove);
			}
		};
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
	{#if showStudio && import.meta.env.MODE === 'development'}
		{#await import('@threlte/studio') then { Studio }}
			<Studio>
				{#key `${size.width}-${size.height}`}
					<PostFXManager {mouse}>
						{#if showGallery}
							{#key `gallery-${optionsStore.dark}`}
								<PostFXScene enabled={true}>
									<GalleryScene data={data.gallery![0]} bind:galleryLoaded />
								</PostFXScene>
							{/key}
						{:else if showCanvas}
							{#key `canvas-${optionsStore.dark}`}
								<PostFXScene enabled={true}>
									<ThreeScene {data} {preferImageThumbnails} {mouse} />
								</PostFXScene>
							{/key}
							<PostFXScene
								enabled={true}
								beforeRender={(delta: number) => {
									// Custom rendering logic for this scene
									riveSceneInstance!.beforeRender(delta);
								}}
							>
								<RiveScene {mouse} bind:this={riveSceneInstance} showCursor={cursorVisible} />
							</PostFXScene>
						{/if}
					</PostFXManager>
				{/key}
			</Studio>
		{/await}
	{:else}
		{#key `${size.width}-${size.height}`}
			<PostFXManager {mouse}>
				{#if showGallery}
					{#key `gallery-${optionsStore.dark}`}
						<PostFXScene enabled={true}>
							<GalleryScene data={data.gallery![0]} bind:galleryLoaded />
						</PostFXScene>
					{/key}
				{:else if showCanvas}
					{#key `canvas-${optionsStore.dark}`}
						<PostFXScene enabled={true}>
							<ThreeScene {data} {preferImageThumbnails} {mouse} />
						</PostFXScene>
					{/key}
				{/if}
				<PostFXScene
					enabled={true}
					beforeRender={(delta: number) => {
						// Custom rendering logic for this scene
						riveSceneInstance!.beforeRender(delta);
					}}
				>
					<RiveScene {mouse} bind:this={riveSceneInstance} showCursor={cursorVisible} />
				</PostFXScene>
			</PostFXManager>
		{/key}
	{/if}
</Canvas>
