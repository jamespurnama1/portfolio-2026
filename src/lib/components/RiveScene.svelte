<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import Rive from '$lib/components/Rive.svelte';
	import { CanvasTexture, Texture, type Mesh, type MeshBasicMaterial } from 'three';
	import { onMount, untrack } from 'svelte';
	import { animationStore, loadStore } from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import gsap from 'gsap';

	let {
		mouse
	}: { mouse: { x: number; y: number } } = $props();

	const { size, camera, renderer } = useThrelte();
	let caret = $state() as Texture;
	let elementMaterial: MeshBasicMaterial | undefined = $state();
	let elementMesh: Mesh | undefined = $state();
	let riveCanvas = $state() as HTMLCanvasElement;
	const caretPos = $state({
		x: -$size.width,
		y: -$size.height,
		scaleX: 0.8,
		scaleY: 0.8,
		rotation: 0
	});
	let riveTask = $state(() => {}) as (time?: number) => void;

	export function getCaretPos() {
		return caretPos;
	}

	// canvas resize
	$effect(() => {
		$size;
		untrack(() => {
			// renderer.clear();
			if (!elementMaterial || !elementMaterial.map || !riveCanvas) return;
			caret = new CanvasTexture(riveCanvas);
			elementMaterial.map.needsUpdate = true;
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
		if (loadStore.loaded && caret && !animationStore.isAnimating) {
			const mouseSpeed = delta * 10;
			caretPos.x += (mouse.x - caretPos.x) * mouseSpeed;
			caretPos.y += (mouse.y - caretPos.y) * mouseSpeed;
		}
		riveTask(delta);
		if (elementMaterial && caret) {
			caret.needsUpdate = true;
			elementMaterial!.map = caret;
			renderer.render(elementMesh!, $camera);
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
		if (!elementMaterial || !elementMaterial.map || !riveCanvas) return;
		caret = new CanvasTexture(riveCanvas);
		elementMaterial.map.needsUpdate = true;
	});

	onMount(() => {
		caret = new CanvasTexture(riveCanvas);
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
		<T.MeshBasicMaterial bind:ref={elementMaterial} map={caret} transparent={true} />
	</T.Mesh>
{/if}

<!-- RIVE -->
<Rive bind:riveCanvas {loadingAnim} bind:riveTask />
