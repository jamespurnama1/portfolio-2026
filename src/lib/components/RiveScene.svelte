<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import Rive from '$lib/components/Rive.svelte';
	import { CanvasTexture, Texture, type Mesh, type MeshBasicMaterial } from 'three';
	import { onMount, untrack } from 'svelte';
	import { animationStore, loadStore } from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import gsap from 'gsap';

	let { mouse, showCursor = true }: { mouse: { x: number; y: number }; showCursor?: boolean } =
		$props();

	const { size } = useThrelte();
	let caret = $state() as Texture;
	let elementMaterial: MeshBasicMaterial | undefined = $state();
	let elementMesh: Mesh | undefined = $state();
	let riveCanvas = $state() as HTMLCanvasElement;

	function ensureCaretTexture() {
		if (!riveCanvas || riveCanvas.width <= 0 || riveCanvas.height <= 0) return;
		if (!caret) {
			caret = new CanvasTexture(riveCanvas);
			caret.needsUpdate = true;
			return;
		}
		caret.image = riveCanvas;
		caret.needsUpdate = true;
	}

	onMount(() => {
		ensureCaretTexture();
	});
	const caretPos = $state({
		x: -$size.width,
		y: -$size.height,
		scaleX: 0.8,
		scaleY: 0.8,
		rotation: 0
	});

	let meshOpacity = $derived(showCursor ? 1 : 0);
	let riveTask = $state(() => {}) as (time?: number) => void;

	export function getCaretPos() {
		return caretPos;
	}

	// canvas resize
	$effect(() => {
		$size;
		untrack(() => {
			if (!riveCanvas) return;
			ensureCaretTexture();
			if (elementMaterial && caret) {
				elementMaterial.map = caret;
				elementMaterial.needsUpdate = true;
			}
		});
	});

	function loadingAnim() {
		animationStore.isAnimating = true;
		const animTL = gsap.timeline();
		animTL.to(caretPos, {
			duration: 3,
			x: $size.width / 2,
			y: $size.height / 2,
			repeat: -1,
			repeatDelay: 0.25,
			onRepeat: () => {
				if (loadStore.load >= 100) {
					animTL.kill();
					loadStore.loaded = true;
					gsap.set(caretPos, {
						x: -$size.width,
						y: -$size.height
					});
					reset();
				}
			}
		});
	}

	function reset(duration = 0.5) {
		animationStore.isAnimating = false;
		gsap.to(caretPos, {
			duration,
			scaleX: 0.05,
			scaleY: 0.05,
			rotation: 0,
			ease: 'none',
			onUpdate: () => {
				// onMouseMove();
			},
			onComplete: () => {
				gsap.to(optionsStore, {
					rgbPersistFactor: 0.85
				});
			}
		});
	}

	export function beforeRender(delta: number) {
		// Update Rive animation first
		riveTask(delta);

		if (loadStore.loaded && caret && !animationStore.isAnimating) {
			const mouseSpeed = delta * 10;
			caretPos.x += (mouse.x - caretPos.x) * mouseSpeed;
			caretPos.y += (mouse.y - caretPos.y) * mouseSpeed;
		}

		// Update texture after Rive renders
		if (elementMaterial && caret && riveCanvas.width > 0 && riveCanvas.height > 0) {
			caret.needsUpdate = true;
			elementMaterial!.map = caret;
		}
	}

	export function categoryAnim(direction: 'up' | 'down') {
		animationStore.isAnimating = true;
		gsap.to(optionsStore, {
			rgbPersistFactor: 0.9
		});
		const animTL = gsap.timeline();
		animTL.to(caretPos, {
			x: $size.width * 0.3,
			y: direction === 'down' ? $size.height * 2 : -$size.height * 2,
			scaleX: 0.8,
			scaleY: 0.8,
			rotation: ((direction === 'down' ? 225 : 45) * Math.PI) / 180,
			duration: 0.5
		});
		animTL.to(caretPos, {
			duration: 0.8,
			x: $size.width * 0.3,
			y: direction === 'down' ? -$size.height : $size.height,
			onComplete: () => {
				reset();
				gsap.to(optionsStore, {
					rgbPersistFactor: 0.85
				});
			}
		});
	}

	$effect(() => {
		if (!riveCanvas) return;
		ensureCaretTexture();
		if (elementMaterial && caret) {
			elementMaterial.map = caret;
			elementMaterial.needsUpdate = true;
		}
	});
</script>

{#if riveCanvas}
	<T.Mesh
		bind:ref={elementMesh}
		position={[caretPos.x, caretPos.y, 0]}
		scale={caretPos.scaleX}
		rotation.z={caretPos.rotation}
	>
		<T.PlaneGeometry args={[$size.width, $size.height]} />
		<T.MeshBasicMaterial
			bind:ref={elementMaterial}
			map={caret}
			transparent={true}
			opacity={meshOpacity}
		/>
	</T.Mesh>
{/if}

<!-- RIVE -->
<Rive bind:riveCanvas {loadingAnim} bind:riveTask {caretPos} />
