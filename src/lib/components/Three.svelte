<script lang="ts">
	import ThreeScene from './ThreeScene.svelte';
	import RiveScene from './RiveScene.svelte';
	import GalleryGhost from './GalleryGhost.svelte';
	import type { PageData } from '../../routes/(site)/$types';
	let { data, preferImageThumbnails = false }: { data: PageData; preferImageThumbnails?: boolean } =
		$props();
	import { Canvas } from '@threlte/core';
	import { PerspectiveCamera, WebGLRenderer } from 'three';
	import { page } from '$app/state';
	import { untrack, onMount, onDestroy, type SvelteComponent } from 'svelte';
	import PostFXManager from '#lib/components/PostFXManager.svelte';
	import PostFXScene from '#lib/components/PostFXScene.svelte';
	import ThrelteSizeProvider from '#lib/components/ThrelteSizeProvider.svelte';
	import { threlteSize } from '#lib/stores/threlteSize.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { loadStore } from '#lib/stores/index.svelte.js';
	import { isMobileSafari } from '#lib/utils/device.js';

	let riveSceneInstance: SvelteComponent | undefined = $state();
	let isTouchDevice = $state(false);
	let hasPointerPosition = $state(false);
	let galleryGhostAllowed = $state(false);

	const relativeMousePos = { x: 0, y: 0 };
	const mouse = $state({ x: 0, y: 0 });
	let size = $state({ width: 0, height: 0 });
	const cursorCamera = new PerspectiveCamera(45, 1, 0.1, 1000);
	cursorCamera.position.z = 600;
	const cursorVisible = $derived(!(isTouchDevice && loadStore.loaded));
	$effect(() => {
		if (!size.width || !size.height) return;
		cursorCamera.aspect = size.width / size.height;
		cursorCamera.fov = 2 * Math.atan(size.height / 1200) * (180 / Math.PI);
		cursorCamera.updateProjectionMatrix();
	});
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

	function onPointerMoveForCursorRestore(e: PointerEvent) {
		if (e.pointerType === 'mouse' && isTouchDevice) {
			isTouchDevice = false;
			document.addEventListener('mousemove', onMouseMove);
		}
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
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
		const updateMotionPreference = () => (galleryGhostAllowed = !reducedMotion.matches);
		updateMotionPreference();
		reducedMotion.addEventListener('change', updateMotionPreference);
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
		if (!isTouchDevice) {
			document.addEventListener('mousemove', onMouseMove);
		}
		window.addEventListener('pointermove', onPointerMoveForCursorRestore);
		return () => {
			reducedMotion.removeEventListener('change', updateMotionPreference);
			document.removeEventListener('mousemove', onMouseMove);
			window.removeEventListener('pointermove', onPointerMoveForCursorRestore);
		};
	});

	// Track which scene is currently rendered
	let showGallery = $state(untrack(() => page.url.pathname.includes('gallery') && data.gallery));
	let showCanvas = $state(!page.url.pathname.includes('gallery'));

	// $inspect(showGallery, showCanvas);

	let transitionTimeout: ReturnType<typeof setTimeout> | null = null;

	$effect(() => {
		// Watch for route changes
		page.route.id;
		untrack(() => {
			// If switching between gallery and non-gallery, delay the transition
			const isGallery = page.route.id?.includes('gallery') && data.gallery;
			if (transitionTimeout) {
				clearTimeout(transitionTimeout);
				transitionTimeout = null;
			}
			if (isGallery !== showGallery) {
				// Optionally trigger transition-out animation here
				showGallery = false;
				showCanvas = false;
				transitionTimeout = setTimeout(() => {
					showGallery = isGallery;
					showCanvas = !isGallery;
					transitionTimeout = null;
				}, 1000); // 1 second delay
			} else {
				showCanvas = !isGallery;
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

<Canvas
	autoRender={false}
	createRenderer={(canvas) =>
		new WebGLRenderer({
			canvas,
			// Disable MSAA on mobile Safari — ~30-50% fragment cost reduction.
			// Desktop keeps antialias for sharp edges on high-DPI screens.
			antialias: !isMobileSafari,
			alpha: true,
			powerPreference: 'high-performance'
		})}
>
	<ThrelteSizeProvider />
	<PostFXManager
		{mouse}
		pixelRatioCap={page.url.pathname === '/gallery' && loadStore.loaded ? 0.5 : 2}
		galleryTrails={page.url.pathname === '/gallery' && loadStore.loaded && galleryGhostAllowed}
	>
		{#if showCanvas}
			{#key `canvas-${optionsStore.dark}`}
				<PostFXScene enabled={true}>
					<ThreeScene {data} {preferImageThumbnails} {mouse} />
				</PostFXScene>
			{/key}
		{/if}
		{#if page.url.pathname === '/gallery' && loadStore.loaded && galleryGhostAllowed}
			<GalleryGhost />
		{/if}
		<PostFXScene
			enabled={true}
			overlay={true}
			camera={cursorCamera}
			beforeRender={(delta: number) => {
				// Custom rendering logic for this scene
				riveSceneInstance!.beforeRender(delta);
			}}
		>
			<RiveScene {mouse} bind:this={riveSceneInstance} showCursor={cursorVisible} />
		</PostFXScene>
	</PostFXManager>
</Canvas>
