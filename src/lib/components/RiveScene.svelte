<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import Rive from '#lib/components/Rive.svelte';
	import {
		CanvasTexture,
		Texture,
		type Mesh,
		type MeshBasicMaterial,
		MathUtils,
		LinearFilter,
		SRGBColorSpace
	} from 'three';
	import { onMount, untrack } from 'svelte';
	import {
		animationStore,
		arrowScreen,
		cursorSnapStore,
		focusCursor,
		homeTransitionStore,
		introGateStore,
		loadStore
	} from '#lib/stores/index.svelte.js';
	import { introSectionStore } from '#lib/stores/introSection.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { viewerStore } from '#lib/stores/viewer.svelte.js';
	import { perfStore } from '#lib/stores/perf.svelte.js';
	import { page } from '$app/state';
	import gsap from 'gsap';

	let { mouse, showCursor = true }: { mouse: { x: number; y: number }; showCursor?: boolean } =
		$props();
	const DEFAULT_CURSOR_SCALE = 0.038;
	const INTRO_CURSOR_START_SCALE = 0.56;
	const INTRO_CURSOR_END_SCALE = 0.1;
	const INTRO_IDLE_OFFSET_X = 28;
	const INTRO_IDLE_OFFSET_Y = -42;
	const INTRO_CURSOR_START_ANCHOR_Y = 0.18;
	const INTRO_CURSOR_END_ANCHOR_Y = 0.5;
	const INTRO_CURSOR_START_Z = 88;
	const INTRO_CURSOR_END_Z = 0;
	const INTRO_SHARED_ROTATION_OFFSET_X = Math.PI * 0.5;
	const INTRO_SHARED_ROTATION_X_START = -1.32 + INTRO_SHARED_ROTATION_OFFSET_X;
	const INTRO_SHARED_ROTATION_X_END = 0;
	const INTRO_SHARED_ROTATION_Y_START = 0.22;
	const INTRO_SHARED_ROTATION_Y_END = 0;
	const CURSOR_LOCAL_ALIGNMENT_ROLL = Math.PI * 0.5;
	const CURSOR_LOCAL_ALIGNMENT_SCALE_Y = -1;
	const SNAP_FOLLOW_STRENGTH = 1.65;

	const { size } = useThrelte();
	let caret = $state() as Texture;
	let elementMaterial: MeshBasicMaterial | undefined = $state();
	let elementMesh: Mesh | undefined = $state();
	let riveCanvas = $state() as HTMLCanvasElement;
	let canvasViewport = $state({ width: 0, height: 0 });
	let caretTextureWidth = $state(0);
	let caretTextureHeight = $state(0);
	let introPlacementComplete = $state(false);
	let introAutoPositioning = $state(false);
	let loadingTimeline: gsap.core.Timeline | undefined = $state();

	function getIntroTarget(scale: number, progress = 1) {
		const viewportWidth = $size.width || 1440;
		const viewportHeight = $size.height || 900;
		const isMobileViewport = viewportWidth < 768;
		const endXOffset = isMobileViewport
			? viewportWidth * 0.22
			: Math.min(viewportWidth * 0.32, 460);
		// Matches the intro grid's centre square (see IntroGridScene offsets)
		const endYOffset = isMobileViewport
			? viewportHeight * 0.28 + 36
			: Math.min(viewportHeight * 0.02, 18);
		const startXOffset = isMobileViewport ? viewportWidth * 0.2 : endXOffset + INTRO_IDLE_OFFSET_X;
		const startYOffset = isMobileViewport
			? viewportHeight * 0.24
			: endYOffset + INTRO_IDLE_OFFSET_Y;
		const targetX = MathUtils.lerp(startXOffset, endXOffset, progress);
		const targetY = MathUtils.lerp(startYOffset, endYOffset, progress);
		const anchorY = MathUtils.lerp(
			INTRO_CURSOR_START_ANCHOR_Y,
			INTRO_CURSOR_END_ANCHOR_Y,
			progress
		);
		return getAnchoredCursorTarget(targetX, targetY, scale, anchorY);
	}

	function getAnchoredCursorTarget(targetX: number, targetY: number, scale: number, anchorY = 0.5) {
		return {
			x: targetX - ($size.width * scale) / 2,
			y: targetY - $size.height * scale * anchorY
		};
	}

	function getClientCursorTarget(clientX: number, clientY: number, scale: number) {
		return {
			x: clientX - ($size.width * scale) / 2 - $size.width / 2,
			y: $size.height / 2 - clientY - ($size.height * scale) / 2
		};
	}

	// Same pixels as the WebGL cursor, drawn on a DOM canvas so it can sit above the media viewer.
	let viewerCursorCanvas: HTMLCanvasElement | undefined;

	function drawViewerCursor() {
		if (typeof document === 'undefined') return;
		if (!viewerStore.active || !showCursor || !riveCanvas || riveCanvas.width <= 0) {
			if (viewerCursorCanvas && viewerCursorCanvas.style.display !== 'none') {
				viewerCursorCanvas.style.display = 'none';
			}
			return;
		}
		if (!viewerCursorCanvas) {
			const created = document.createElement('canvas');
			created.setAttribute('aria-hidden', 'true');
			created.style.cssText =
				'position:fixed;left:0;top:0;z-index:70;pointer-events:none;display:none;';
			document.body.appendChild(created);
			viewerCursorCanvas = created;
		}
		const el = viewerCursorCanvas;
		const dpr = window.devicePixelRatio || 1;
		const w = Math.max(1, $size.width * caretPos.scaleX);
		const h = Math.max(1, $size.height * caretPos.scaleY);
		const pw = Math.round(w * dpr);
		const ph = Math.round(h * dpr);
		if (el.width !== pw || el.height !== ph) {
			el.width = pw;
			el.height = ph;
			el.style.width = `${w}px`;
			el.style.height = `${h}px`;
		}
		// The arrow is drawn in the top-right corner of the cursor plane.
		el.style.transform = `translate3d(${arrowScreen.x - w}px, ${arrowScreen.y}px, 0)`;
		el.style.display = 'block';
		const ctx = el.getContext('2d');
		ctx?.clearRect(0, 0, pw, ph);
		ctx?.drawImage(riveCanvas, 0, 0, pw, ph);
	}

	function ensureCaretTexture() {
		if (!riveCanvas || riveCanvas.width <= 0 || riveCanvas.height <= 0) return;
		const needsRecreate =
			!caret || caretTextureWidth !== riveCanvas.width || caretTextureHeight !== riveCanvas.height;
		if (needsRecreate) {
			caret?.dispose?.();
			caret = new CanvasTexture(riveCanvas);
			caret.colorSpace = SRGBColorSpace;
			caret.minFilter = LinearFilter;
			caret.magFilter = LinearFilter;
			caret.generateMipmaps = false;
			// Safari (especially iOS) premultiplies alpha in canvas readback by default,
			// which causes the cursor to show a solid background. Set premultiplyAlpha=false
			// so WebGL uploads the raw RGBA values from the canvas without pre-multiplying.
			caret.premultiplyAlpha = false;
			caretTextureWidth = riveCanvas.width;
			caretTextureHeight = riveCanvas.height;
			caret.needsUpdate = true;
			return;
		}
		caret.needsUpdate = true;
	}

	function getIntroRotation(progress: number) {
		const interactionX = MathUtils.clamp(mouse.x / (($size.width || 1) * 0.5), -1, 1);
		const interactionY = MathUtils.clamp(mouse.y / (($size.height || 1) * 0.5), -1, 1);
		const baseRotationX = MathUtils.lerp(
			INTRO_SHARED_ROTATION_X_START,
			INTRO_SHARED_ROTATION_X_END,
			progress
		);
		const baseRotationY = MathUtils.lerp(
			INTRO_SHARED_ROTATION_Y_START,
			INTRO_SHARED_ROTATION_Y_END,
			progress
		);
		return {
			rotation: 0,
			rotationX: baseRotationX + interactionY * 0.22,
			rotationY: baseRotationY + interactionX * 0.28
		};
	}

	onMount(() => {
		ensureCaretTexture();
		return () => {
			viewerCursorCanvas?.remove();
			viewerCursorCanvas = undefined;
			loadingTimeline?.kill();
			gsap.killTweensOf(caretPos);
			caret?.dispose?.();
		};
	});
	const caretPos = $state({
		x: -$size.width,
		y: -$size.height,
		z: 0,
		scaleX: INTRO_CURSOR_START_SCALE,
		scaleY: INTRO_CURSOR_START_SCALE,
		rotation: 0,
		rotationX: 0,
		rotationY: 0
	});

	$effect(() => {
		homeTransitionStore.pending;
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname !== '/' || !homeTransitionStore.pending || !loadStore.loaded) return;
			introPlacementComplete = false;
			introAutoPositioning = false;
			gsap.killTweensOf(caretPos);
			caretPos.x = mouse.x;
			caretPos.y = mouse.y;
			caretPos.z = 0;
			caretPos.scaleX = DEFAULT_CURSOR_SCALE;
			caretPos.scaleY = DEFAULT_CURSOR_SCALE;
			caretPos.rotation = 0;
			caretPos.rotationX = 0;
			caretPos.rotationY = 0;
		});
	});

	let meshOpacityTarget = $derived.by(() => {
		// Normal cursor while waiting on the intro button; it hides while snapped to it.
		if (introGateStore.phase === 'waiting') {
			if (!showCursor) return 0;
			return cursorSnapStore.active ? 0 : 1;
		}
		if (focusCursor.active && !viewerStore.active) return 1;
		const introCursorPhase = page.url.pathname === '/' && $introSectionStore.active;
		const introCursorOpacity = introCursorPhase
			? 1 - MathUtils.smoothstep($introSectionStore.progress, 0.16, 0.34)
			: -1;

		if (introCursorOpacity >= 0) {
			return introCursorOpacity;
		}

		// On touch devices the cursor is never visible outside the intro section.
		// (During intro the cursor is the main visual element on mobile, so we
		// keep it visible there — now with correct alpha via premultiplyAlpha=false.)
		if (!showCursor) return 0;

		// The media viewer draws the Rive cursor on a DOM canvas above the media.
		if (viewerStore.active) return 0;

		if (page.url.pathname === '/branch' && cursorSnapStore.active) {
			return 0;
		}

		return 1;
	});
	let meshOpacity = $state(1);
	let meshLocalRoll = $derived.by(() => {
		const introCursorPhase =
			!focusCursor.active &&
			page.url.pathname === '/' &&
			$introSectionStore.active &&
			$introSectionStore.progress < 0.34 &&
			(introGateStore.phase === 'revealing' || introGateStore.phase === 'done');
		return introCursorPhase ? CURSOR_LOCAL_ALIGNMENT_ROLL : 0;
	});
	let meshLocalScaleY = $derived.by(() => {
		const introCursorPhase =
			!focusCursor.active &&
			page.url.pathname === '/' &&
			$introSectionStore.active &&
			$introSectionStore.progress < 0.34 &&
			(introGateStore.phase === 'revealing' || introGateStore.phase === 'done');
		return introCursorPhase ? CURSOR_LOCAL_ALIGNMENT_SCALE_Y : 1;
	});
	let riveTask = $state(() => {}) as (time?: number) => boolean | void;

	export function getCaretPos() {
		return caretPos;
	}

	// canvas resize
	$effect(() => {
		$size;
		canvasViewport.width;
		canvasViewport.height;
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
		introPlacementComplete = false;
		introAutoPositioning = false;
		loadingTimeline?.kill();
		gsap.killTweensOf(caretPos);
		animationStore.isAnimating = true;
		loadingTimeline = gsap.timeline();
		loadingTimeline.to(caretPos, {
			duration: 3,
			x: $size.width / 2,
			y: $size.height / 2,
			repeat: -1,
			repeatDelay: 0.25,
			onRepeat: () => {
				if (loadStore.load >= 100) {
					loadingTimeline?.kill();
					if (page.url.pathname === '/') {
						finishIntroSweep();
					} else {
						loadStore.loaded = true;
						introGateStore.phase = 'done';
						gsap.set(caretPos, {
							x: -$size.width,
							y: -$size.height
						});
						reset();
					}
				}
			}
		});
	}

	// Last bottom-left to top-right sweep: the card stack trails it and settles mid-screen.
	function finishIntroSweep() {
		introGateStore.settled = false;
		introGateStore.phase = 'finishing';
		loadStore.loaded = true;
		gsap.fromTo(
			caretPos,
			{ x: -$size.width, y: -$size.height },
			{
				x: $size.width / 2,
				y: $size.height / 2,
				duration: 2.4,
				ease: 'power1.inOut',
				onUpdate: () => {
					if (!introGateStore.settled && arrowScreen.x >= $size.width * 0.5) {
						introGateStore.settled = true;
					}
				},
				onComplete: () => {
					introGateStore.phase = 'waiting';
					animationStore.isAnimating = false;
				}
			}
		);
	}

	// After the stack is clicked: the arrow returns from the bottom left to its landing position.
	function revealIntro() {
		const introStartRotation = getIntroRotation(0);
		gsap.killTweensOf(caretPos);
		gsap.set(caretPos, {
			x: -$size.width,
			y: -$size.height,
			z: INTRO_CURSOR_START_Z,
			scaleX: INTRO_CURSOR_START_SCALE,
			scaleY: INTRO_CURSOR_START_SCALE,
			rotation: 0,
			rotationX: 0,
			rotationY: 0
		});
		animationStore.isAnimating = false;
		const introTarget = getIntroTarget(INTRO_CURSOR_START_SCALE, 0);
		introAutoPositioning = true;
		gsap.to(caretPos, {
			duration: 1.3,
			x: introTarget.x,
			y: introTarget.y,
			z: INTRO_CURSOR_START_Z,
			rotation: introStartRotation.rotation,
			rotationX: introStartRotation.rotationX,
			rotationY: introStartRotation.rotationY,
			ease: 'power3.out',
			onComplete: () => {
				introPlacementComplete = true;
				introAutoPositioning = false;
			}
		});
		gsap.to(optionsStore, { rgbPersistFactor: 0.85 });
		// Lets the cards finish leaving before the rest of the intro takes over.
		gsap.delayedCall(1.2, () => (introGateStore.phase = 'done'));
	}

	$effect(() => {
		if (introGateStore.phase === 'revealing') untrack(revealIntro);
	});

	function reset(duration = 0.5) {
		introPlacementComplete = false;
		introAutoPositioning = false;
		animationStore.isAnimating = false;
		gsap.to(caretPos, {
			duration,
			z: 0,
			scaleX: DEFAULT_CURSOR_SCALE,
			scaleY: DEFAULT_CURSOR_SCALE,
			rotation: 0,
			rotationX: 0,
			rotationY: 0,
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
		perfStore.measure('rive', () => {
			// Update Rive animation first
			const riveRendered = riveTask(delta) !== false;
			arrowScreen.x = $size.width / 2 + caretPos.x + ($size.width * caretPos.scaleX) / 2;
			arrowScreen.y = $size.height / 2 - caretPos.y - ($size.height * caretPos.scaleY) / 2;

			if (
				loadStore.loaded &&
				caret &&
				!animationStore.isAnimating &&
				introGateStore.phase !== 'revealing'
			) {
				const mouseSpeed = delta * 10;
				const branchCursorSnapActive =
					focusCursor.active ||
					((page.url.pathname === '/branch' || introGateStore.phase === 'waiting') &&
						cursorSnapStore.active);
				const introCursorActive =
					!focusCursor.active &&
					introGateStore.phase === 'done' &&
					page.url.pathname === '/' &&
					!homeTransitionStore.pending &&
					$introSectionStore.active &&
					$introSectionStore.progress < 0.34;

				if (introCursorActive) {
					const introProgress = MathUtils.smoothstep($introSectionStore.progress, 0, 0.34);
					const hasIntroScrollProgress = $introSectionStore.progress > 0.001;
					const introIdleLocked = !introAutoPositioning && !hasIntroScrollProgress;
					const targetScale = MathUtils.lerp(
						INTRO_CURSOR_START_SCALE,
						INTRO_CURSOR_END_SCALE,
						introProgress
					);
					const anchoredCenter = getIntroTarget(targetScale, introProgress);
					const idleTarget = getIntroTarget(INTRO_CURSOR_START_SCALE, 0);
					const introRotation = getIntroRotation(introProgress);
					const introZ = MathUtils.lerp(INTRO_CURSOR_START_Z, INTRO_CURSOR_END_Z, introProgress);
					if (caretPos.x < -$size.width * 0.25 || caretPos.y < -$size.height * 0.25) {
						caretPos.x = $size.width / 2;
						caretPos.y = $size.height / 2;
						caretPos.z = INTRO_CURSOR_START_Z;
						caretPos.scaleX = INTRO_CURSOR_START_SCALE;
						caretPos.scaleY = INTRO_CURSOR_START_SCALE;
					}
					if (introIdleLocked) {
						caretPos.x = idleTarget.x;
						caretPos.y = idleTarget.y;
						caretPos.z = INTRO_CURSOR_START_Z;
						caretPos.scaleX = INTRO_CURSOR_START_SCALE;
						caretPos.scaleY = INTRO_CURSOR_START_SCALE;
						caretPos.rotation = introRotation.rotation;
						caretPos.rotationX = introRotation.rotationX;
						caretPos.rotationY = introRotation.rotationY;
					} else if (!introAutoPositioning && hasIntroScrollProgress) {
						introPlacementComplete = true;
						caretPos.x = anchoredCenter.x;
						caretPos.y = anchoredCenter.y;
						caretPos.z = introZ;
						caretPos.scaleX = targetScale;
						caretPos.scaleY = targetScale;
						caretPos.rotation = introRotation.rotation;
						caretPos.rotationX = introRotation.rotationX;
						caretPos.rotationY = introRotation.rotationY;
					} else {
						if (!introAutoPositioning) {
							caretPos.x = idleTarget.x;
							caretPos.y = idleTarget.y;
							caretPos.z = INTRO_CURSOR_START_Z;
							caretPos.scaleX = INTRO_CURSOR_START_SCALE;
							caretPos.scaleY = INTRO_CURSOR_START_SCALE;
							caretPos.rotation = introRotation.rotation;
							caretPos.rotationX = introRotation.rotationX;
							caretPos.rotationY = introRotation.rotationY;
						}
					}
				} else if (branchCursorSnapActive) {
					const snapSource = focusCursor.active ? focusCursor : cursorSnapStore;
					const snapTarget = getClientCursorTarget(
						snapSource.x,
						snapSource.y,
						DEFAULT_CURSOR_SCALE
					);
					caretPos.x += (snapTarget.x - caretPos.x) * mouseSpeed * SNAP_FOLLOW_STRENGTH;
					caretPos.y += (snapTarget.y - caretPos.y) * mouseSpeed * SNAP_FOLLOW_STRENGTH;
					caretPos.z += (0 - caretPos.z) * mouseSpeed;
					caretPos.scaleX += (DEFAULT_CURSOR_SCALE - caretPos.scaleX) * mouseSpeed;
					caretPos.scaleY += (DEFAULT_CURSOR_SCALE - caretPos.scaleY) * mouseSpeed;
					caretPos.rotation += (0 - caretPos.rotation) * mouseSpeed;
					caretPos.rotationX += (0 - caretPos.rotationX) * mouseSpeed;
					caretPos.rotationY += (0 - caretPos.rotationY) * mouseSpeed;
				} else {
					introPlacementComplete = false;
					introAutoPositioning = false;
					caretPos.x += (mouse.x - caretPos.x) * mouseSpeed;
					caretPos.y += (mouse.y - caretPos.y) * mouseSpeed;
					caretPos.z += (0 - caretPos.z) * mouseSpeed * 0.85;
					caretPos.scaleX += (DEFAULT_CURSOR_SCALE - caretPos.scaleX) * mouseSpeed * 0.85;
					caretPos.scaleY += (DEFAULT_CURSOR_SCALE - caretPos.scaleY) * mouseSpeed * 0.85;
					caretPos.rotation += (0 - caretPos.rotation) * mouseSpeed * 0.85;
					caretPos.rotationX += (0 - caretPos.rotationX) * mouseSpeed * 0.85;
					caretPos.rotationY += (0 - caretPos.rotationY) * mouseSpeed * 0.85;
				}
			}

			meshOpacity += (meshOpacityTarget - meshOpacity) * Math.min(1, delta * 12);
			drawViewerCursor();

			// Update texture after Rive renders.
			// On Safari: throttle gl.texImage2D upload to 30fps to halve the ~10ms
			// CPU cost of WebKit's canvas→WebGL readback.
			if (elementMaterial && caret && riveCanvas.width > 0 && riveCanvas.height > 0) {
				if (riveRendered) caret.needsUpdate = true;
				elementMaterial!.map = caret;
			}
		});
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
		canvasViewport.width;
		canvasViewport.height;
		ensureCaretTexture();
		if (elementMaterial && caret) {
			elementMaterial.map = caret;
			elementMaterial.needsUpdate = true;
		}
	});
</script>

{#if riveCanvas}
	<T.Group
		position={[caretPos.x, caretPos.y, caretPos.z]}
		scale={caretPos.scaleX}
		rotation.x={caretPos.rotationX}
		rotation.y={caretPos.rotationY}
		rotation.z={caretPos.rotation}
	>
		<!-- 1. Bind the scale property directly to the Mesh instead of using a nested <T is=...> -->
		<T.Mesh
			bind:ref={elementMesh}
			rotation.z={meshLocalRoll}
			raycast={() => null}
			scale={[
				Math.max(canvasViewport.width || $size.width, 1),
				Math.max(canvasViewport.height || $size.height, 1) * meshLocalScaleY,
				1
			]}
		>
			<T.PlaneGeometry args={[1, 1]} />
			<T.MeshBasicMaterial
				bind:ref={elementMaterial}
				map={caret}
				transparent={true}
				opacity={meshOpacity}
			/>
		</T.Mesh>
	</T.Group>
{/if}

<!-- RIVE -->
<Rive bind:riveCanvas bind:canvasViewport {loadingAnim} bind:riveTask {caretPos} />
