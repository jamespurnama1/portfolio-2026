<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { countStore, cursorStore, animationStore, loadStore } from '$lib/stores/index.svelte';
	import { introSectionStore } from '$lib/stores/introSection';
	import RiveCanvas, { type SMIInput, type StateMachineInstance } from '@rive-app/canvas-advanced';
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { useThrelte } from '@threlte/core';

	const currentPath = page.url.pathname;

	let link = $state() as SMIInput;
	let scroll = $state() as SMIInput;
	let isTouchDevice = $state(false);
	let stateMachine = $state() as StateMachineInstance | undefined;
	let mainStateMachine = $state<any>();
	let artboardRef = $state<any>();
	let riveRef = $state<any>();
	let riveRenderer = $state<any>();
	let wasIntroCursorLocked = $state(false);
	let surfaceReady = $state(false);

	function introCursorLocked() {
		return page.url.pathname === '/' && loadStore.loaded && $introSectionStore.active;
	}

	function introCursorFrozen() {
		return introCursorLocked() && !animationStore.isAnimating;
	}

	function resetIntroCursorStateMachine() {
		if (!riveRef || !artboardRef || !mainStateMachine) return;
		stateMachine?.delete?.();
		const nextStateMachine = new riveRef.StateMachineInstance(mainStateMachine, artboardRef);
		stateMachine = nextStateMachine;
		scroll = nextStateMachine.input(1).asBool();
		link = nextStateMachine.input(0).asBool();
		scroll.value = false;
		link.value = false;
		nextStateMachine.advanceAndApply(0);
	}

	function onHover() {
		if (!link) return;
		if (animationStore.isAnimating || introCursorLocked()) {
			scroll.value = false;
			link.value = false;
		} else {
			link.value = true;
		}
	}
	function onLeave() {
		if (link) link.value = false;
	}

	const { size } = useThrelte();

	$effect(() => {
		//TODO: updates too fast
		currentPath;
		loadStore.loaded;
		let selectable: NodeListOf<HTMLButtonElement>;
		untrack(() => {
			tick().then(() => {
				selectable = document.querySelectorAll('a, button');
				selectable.forEach((el) => {
					el.addEventListener('mouseover', onHover);
					el.addEventListener('mouseleave', onLeave);
				});
			});
		});
		return () => {
			selectable.forEach((el) => {
				el.removeEventListener('mouseover', onHover);
				el.removeEventListener('mouseleave', onLeave);
			});
		};
	});

	$effect(() => {
		cursorStore.cursorState;
		introSectionStore;
		untrack(() => {
			if (!scroll || !loadStore.loaded) return;
			if (introCursorLocked()) {
				scroll.value = false;
				link.value = false;
				return;
			}
			if (cursorStore.cursorState === 'link') {
				onHover();
			} else if (cursorStore.cursorState === 'scroll') {
				scroll.value = true;
			} else {
				onLeave();
			}
		});
	});

	let {
		riveCanvas = $bindable(),
		riveTask = $bindable(),
		canvasViewport = $bindable({ width: 0, height: 0 }),
		loadingAnim,
		caretPos
	}: {
		riveCanvas: HTMLCanvasElement;
		riveTask: (time?: number) => void;
		canvasViewport: { width: number; height: number };
		loadingAnim: () => void;
		caretPos?: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
	} = $props();

	let canvasContainer: HTMLDivElement | undefined = $state();

	function syncCanvasViewport(width: number, height: number) {
		if (!riveCanvas) return;
		canvasViewport = {
			width,
			height
		};
	}

	function resizeRiveSurface(width: number, height: number) {
		if (!riveCanvas || width <= 0 || height <= 0) return;
		const pixelRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
		const targetWidth = Math.max(Math.round(width * pixelRatio), 1);
		const targetHeight = Math.max(Math.round(height * pixelRatio), 1);
		if (riveCanvas.width !== targetWidth || riveCanvas.height !== targetHeight) {
			riveCanvas.width = targetWidth;
			riveCanvas.height = targetHeight;
		}
		syncCanvasViewport(width, height);
		surfaceReady = true;
	}

	function toNormal() {
		setTimeout(() => {
			if (scroll) scroll.value = false;
		}, 500);
	}

	const debouncedCursor = gsap.delayedCall(0.2, toNormal);

	$effect(() => {
		countStore.inertiaIndex;
		introSectionStore;
		untrack(() => {
			if (!scroll || !loadStore.loaded) return;
			if (animationStore.isAnimating || introCursorLocked()) {
				scroll.value = false;
				link.value = false;
			} else {
				scroll.value = true;
				debouncedCursor.restart(true);
			}
		});
	});

	// Handle canvas resize
	$effect(() => {
		if (!riveCanvas) return;
		const width = $size.width;
		const height = $size.height;
		untrack(() => {
			if (!width || !height) return;
			surfaceReady = false;
			resizeRiveSurface(width, height);
		});
	});

	onMount(async () => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		canvasContainer = document.createElement('div');
		canvasContainer.className = 'riveCanvasContainer';
		canvasContainer.setAttribute('aria-hidden', 'true');
		document.body.appendChild(canvasContainer);

		riveCanvas = document.createElement('canvas');
		resizeRiveSurface($size.width, $size.height);
		riveCanvas.className = 'riveCanvas';
		canvasContainer.appendChild(riveCanvas);
		const rive = await RiveCanvas({
			// Loads Wasm bundle
			locateFile: () => `https://unpkg.com/@rive-app/canvas-advanced@2.32.0/rive.wasm`
		});
		riveRef = rive;
		riveRenderer = rive.makeRenderer(riveCanvas);
		const bytes = await (await fetch(new Request('/cursor.riv'))).arrayBuffer();
		const file = await rive.load(new Uint8Array(bytes));
		const artboard = file.artboardByName('Cursor');
		artboardRef = artboard;
		mainStateMachine = artboard.stateMachineByName('Main');
		resetIntroCursorStateMachine();

		riveTask = (delta) => {
			if (!surfaceReady || !riveRenderer || !artboard || !stateMachine) return;
			riveRenderer.clear();
			const introLocked = introCursorLocked();
			if (introLocked && !wasIntroCursorLocked) {
				resetIntroCursorStateMachine();
			}
			wasIntroCursorLocked = introLocked;
			const freezeIntroFrame = introCursorFrozen();
			if (freezeIntroFrame) {
				scroll.value = false;
				link.value = false;
			}
			stateMachine.advance(delta!);
			artboard.advance(delta!);
			riveRenderer.save();
			const introAlignmentActive =
				page.url.pathname === '/' &&
				loadStore.loaded &&
				!animationStore.isAnimating &&
				$introSectionStore.active;
			riveRenderer.align(
				rive.Fit.contain,
				introAlignmentActive ? rive.Alignment.center : rive.Alignment.topRight,
				{
					minX: 0,
					minY: 0,
					maxX: riveCanvas.width,
					maxY: riveCanvas.height
				},
				artboard.bounds
			);
			artboard.draw(riveRenderer);
			riveRenderer.restore();
			rive.resolveAnimationFrame();
		};

		if (!loadStore.loaded) {
			loadingAnim();
		}
	});

	onDestroy(() => {
		riveRenderer?.delete?.();
		if (canvasContainer && canvasContainer.parentNode) {
			canvasContainer.parentNode.removeChild(canvasContainer);
		}
	});
</script>

<style>
	:global(.riveCanvasContainer) {
		position: fixed;
		top: 0;
		left: -10000px;
		opacity: 0;
		pointer-events: none;
		width: 0;
		height: 0;
		overflow: hidden;
	}

	:global(.riveCanvas) {
		display: block;
	}
</style>
