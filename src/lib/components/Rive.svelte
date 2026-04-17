<script lang="ts">
	import { onDestroy, tick, untrack } from 'svelte';
	import { page } from '$app/state';
	import { countStore, cursorStore, animationStore, loadStore } from '$lib/stores/index.svelte';
	import RiveCanvas, { type SMIInput } from '@rive-app/canvas-advanced';
	import { onMount } from 'svelte';
	import { gsap } from 'gsap';
	import { useThrelte } from '@threlte/core';

	const currentPath = page.url.pathname;

	let link = $state() as SMIInput;
	let scroll = $state() as SMIInput;
	let isTouchDevice = $state(false);

	function onHover() {
		if (!link) return;
		if (animationStore.isAnimating) {
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
		untrack(() => {
			if (!scroll || !loadStore.loaded) return;
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
		loadingAnim,
		caretPos
	}: {
		riveCanvas: HTMLCanvasElement;
		riveTask: (time?: number) => void;
		loadingAnim: () => void;
		caretPos?: { x: number; y: number; scaleX: number; scaleY: number; rotation: number };
	} = $props();

	let canvasContainer: HTMLDivElement | undefined = $state();

	function toNormal() {
		setTimeout(() => {
			if (scroll) scroll.value = false;
		}, 500);
	}

	const debouncedCursor = gsap.delayedCall(0.2, toNormal);

	$effect(() => {
		countStore.inertiaIndex;
		untrack(() => {
			if (!scroll || !loadStore.loaded) return;
			if (animationStore.isAnimating) {
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
		$size.width;
		$size.height;
		untrack(() => {
			if (riveCanvas.width !== $size.width || riveCanvas.height !== $size.height) {
				riveCanvas.width = $size.width;
				riveCanvas.height = $size.height;
			}
		});
	});

	onMount(async () => {
		isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		canvasContainer = document.createElement('div');
		canvasContainer.className = 'riveCanvasContainer';
		canvasContainer.setAttribute('aria-hidden', 'true');
		document.body.appendChild(canvasContainer);

		riveCanvas = document.createElement('canvas');
		riveCanvas.width = $size.width;
		riveCanvas.height = $size.height;
		riveCanvas.className = 'riveCanvas';
		canvasContainer.appendChild(riveCanvas);
		const rive = await RiveCanvas({
			// Loads Wasm bundle
			locateFile: () => `https://unpkg.com/@rive-app/canvas-advanced@2.32.0/rive.wasm`
		});
		const renderer = rive.makeRenderer(riveCanvas);
		const bytes = await (await fetch(new Request('/cursor.riv'))).arrayBuffer();
		const file = await rive.load(new Uint8Array(bytes));
		const artboard = file.artboardByName('Cursor');
		const stateMachine = new rive.StateMachineInstance(
			artboard.stateMachineByName('Main'),
			artboard
		);

		scroll = stateMachine.input(1).asBool();
		link = stateMachine.input(0).asBool();

		riveTask = (delta) => {
			if (!renderer || !artboard || !stateMachine) return;
			renderer.clear();
			stateMachine.advance(delta!);
			artboard.advance(delta!);
			renderer.save();
			renderer.align(
				rive.Fit.contain,
				rive.Alignment.topRight,
				{
					minX: 0,
					minY: 0,
					maxX: riveCanvas.width,
					maxY: riveCanvas.height
				},
				artboard.bounds
			);
			artboard.draw(renderer);
			renderer.restore();
			rive.resolveAnimationFrame();
		};

		loadingAnim();
	});

	onDestroy(() => {
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
