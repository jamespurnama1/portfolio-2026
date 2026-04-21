<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { type IntersectionEvent } from '@threlte/extras';
	import {
		type Mesh,
		type ShaderMaterial,
		PlaneGeometry,
		type Texture,
		Vector2,
		TextureLoader,
		SRGBColorSpace,
		LinearFilter,
		LinearMipmapLinearFilter
	} from 'three';
	import {
		animationStore,
		countStore,
		cursorStore,
		currentHomeCardSnapshotStore,
		gptStore,
		homeTransitionStore,
		loadStore,
		sharedCardTransitionStore,
		scrollStore,
		workRouteReadyStore
	} from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import fragmentShader from '../shaders/glitchFragment.glsl?raw';
	import vertexShader from '../shaders/vertexBend.glsl?raw';
	import gsap from 'gsap';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onDestroy, onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { homePos, centerPos, projectPage, initialPos, fullscreen } from '$lib/utils/positions';
	import {
		createCardMotionState,
		indexOffsetToMotionProgress,
		stepCardMotion,
		velocityToMotionProgress
	} from '$lib/utils/cardMotion';
	import { type PageData } from '../../routes/$types';
	import { introSectionStore } from '$lib/stores/introSection';

	let easeFactor = 0.02;
	let imageMat = $state() as ShaderMaterial;
	let imageGeo = $state() as PlaneGeometry;
	let {
		texture,
		index,
		works,
		home = false,
		gallery = false,
		data,
		homeAspectRatio
	}: {
		texture: Texture;
		index: number;
		works: boolean;
		gallery?: boolean;
		home?: boolean;
		data: Required<PageData>;
		homeAspectRatio?: number;
	} = $props();
	function resolveSharedTransition() {
		const pending = sharedCardTransitionStore.value;
		if (!pending) return null;
		if (pending.direction === 'to-work') {
			return works && index === 0 && page.params.slug === pending.slug ? pending : null;
		}
		return !works && page.url.pathname === '/' && index === pending.index ? pending : null;
	}
	const initialSharedTransition = resolveSharedTransition();
	const shouldCoverTexture = $derived(home && !!homeAspectRatio);
	let sharedTransitionTarget = $state(initialSharedTransition);
	let handoffInProgress = $state(Boolean(initialSharedTransition));
	const isReturningHomeCard = $derived(
		page.url.pathname === '/' &&
			!works &&
			handoffInProgress &&
			sharedTransitionTarget?.direction === 'to-home' &&
			index === sharedTransitionTarget.index
	);
	const slug = $derived(works ? page.params.slug : data.projects[index].slug.current.toString());
	const img = { scale: 1 };
	const { size } = useThrelte();
	let image: Mesh | null = $state(null);
	let loadIn = $state(true);
	let initialLoadComplete = $state(false);
	let full = $state(false);
	let prevParams = $state('');
	let suppressUpdates = $state(false);
	let aberrationIntensity = 0.0;
	let mousePosition = { x: 0.5, y: 0.5 };
	let targetMousePosition = { x: 0.5, y: 0.5 };
	let prevPosition = { x: 0.5, y: 0.5 };
	let transform = $state(
		initialSharedTransition
			? { ...initialSharedTransition.transform }
			: { x: 0, y: 0, z: 0, scale: 1, opacity: 0 }
	);
	let motionState = $state(createCardMotionState());
	let lastReportedWorkReadyKey = $state('');
	let settledWorkReadyFrame = $state<number | null>(null);
	let fullscreenZoom = $state(1);
	let fullscreenPan = $state({ x: 0, y: 0 });
	let fullscreenPointerDragging = $state(false);
	let fullscreenDragMoved = $state(false);
	let fullscreenDragStart = $state({ x: 0, y: 0 });
	let fullscreenPanStart = $state({ x: 0, y: 0 });
	let fullscreenTouchMode = $state<'none' | 'pan' | 'pinch'>('none');
	let fullscreenPinchStartDistance = $state(0);
	let fullscreenPinchStartZoom = $state(1);
	let fullscreenTouchPanStart = $state({ x: 0, y: 0 });
	let fullscreenTouchCenterStart = $state({ x: 0, y: 0 });
	let fullscreenTouchCleanup: (() => void) | null = null;
	// Set by handleClick so escapeListener knows the raycaster handled the event
	// and shouldn't also close the lightbox.
	let meshHandledClick = false;
	// Prevents synthesized click (fired ~300ms after touchend) from double-toggling
	let touchJustHandled = false;
	let highResTexture = $state<Texture | null>(null);
	let highResLoadGeneration = 0;

	function buildHighResUrl(url: string): string | undefined {
		if (!url || /\.(mp4|webm)$/i.test(url) || !url.includes('cdn.sanity.io')) return undefined;
		// Strip any existing query params we set, then add high-quality ones
		const base = url.split('?')[0];
		return `${base}?auto=format&fit=max&q=95&w=3840`;
	}

	const highResUrl = $derived.by((): string | undefined => {
		if (!works) return undefined;
		const project = data.projects.find((p) => p.slug.current === page.params.slug);
		if (!project) return undefined;
		if (index === 0) {
			const rawUrl = project.thumbnail?.asset?.url;
			return rawUrl ? buildHighResUrl(rawUrl) : undefined;
		}
		const item = project.content?.[index - 1];
		if (!item) return undefined;
		const rawUrl = item.image?.url ?? item.imageLight?.url;
		return rawUrl ? buildHighResUrl(rawUrl) : undefined;
	});

	function swapToHighResTexture() {
		const url = highResUrl;
		if (!url || (texture as any).isVideoTexture === true) return;
		const gen = ++highResLoadGeneration;
		new TextureLoader().load(url, (tex) => {
			if (gen !== highResLoadGeneration) {
				tex.dispose();
				return;
			}
			tex.colorSpace = SRGBColorSpace;
			tex.magFilter = LinearFilter;
			tex.minFilter = LinearMipmapLinearFilter;
			tex.generateMipmaps = true;
			tex.needsUpdate = true;
			highResTexture = tex;
			// Only swap in if we're still in fullscreen for this card
			if (imageMat && full) {
				imageMat.uniforms.u_texture.value = tex;
				imageMat.uniformsNeedUpdate = true;
			}
		});
	}

	function revertToLowResTexture() {
		// Cancel any in-flight high-res load
		++highResLoadGeneration;
		if (imageMat) {
			imageMat.uniforms.u_texture.value = texture;
			imageMat.uniformsNeedUpdate = true;
		}
		if (highResTexture) {
			const toDispose = highResTexture;
			highResTexture = null;
			if (typeof window !== 'undefined') {
				window.requestAnimationFrame(() => toDispose.dispose());
			} else {
				toDispose.dispose();
			}
		}
	}

	function resetFullscreenInteractionState() {
		fullscreenZoom = 1;
		fullscreenPan = { x: 0, y: 0 };
		fullscreenPointerDragging = false;
		fullscreenDragMoved = false;
		fullscreenTouchMode = 'none';
		fullscreenPinchStartDistance = 0;
		fullscreenPinchStartZoom = 1;
	}

	function getFullscreenBaseSize() {
		return {
			width: Math.max(0, imageGeo?.parameters.width ?? 0) * Math.max(transform.scale, 0),
			height: Math.max(0, imageGeo?.parameters.height ?? 0) * Math.max(transform.scale, 0)
		};
	}

	function getFullscreenPanBounds(zoom = fullscreenZoom) {
		const { width, height } = getFullscreenBaseSize();
		return {
			x: Math.max(0, (width * zoom - width) / 2),
			y: Math.max(0, (height * zoom - height) / 2)
		};
	}

	function clampFullscreenPan(pan: { x: number; y: number }, zoom = fullscreenZoom) {
		const bounds = getFullscreenPanBounds(zoom);
		return {
			x: Math.max(-bounds.x, Math.min(bounds.x, pan.x)),
			y: Math.max(-bounds.y, Math.min(bounds.y, pan.y))
		};
	}

	function setFullscreenZoom(nextZoom: number) {
		const clampedZoom = Math.max(1, Math.min(4, nextZoom));
		fullscreenZoom = clampedZoom;
		fullscreenPan =
			clampedZoom <= 1 ? { x: 0, y: 0 } : clampFullscreenPan(fullscreenPan, clampedZoom);
	}

	function toggleFullscreenZoom() {
		setFullscreenZoom(fullscreenZoom > 1.01 ? 1 : 2.2);
	}

	function toggleVideoPlayback() {
		const el = document.getElementById(workVideoId());
		if (!(el instanceof HTMLVideoElement)) return;
		if (el.paused) {
			el.play();
			optionsStore.videoPaused = false;
		} else {
			el.pause();
			optionsStore.videoPaused = true;
		}
	}

	function cleanupFullscreenTouchListeners() {
		fullscreenTouchCleanup?.();
		fullscreenTouchCleanup = null;
	}

	function handleFullscreenPointerMove(event: PointerEvent) {
		if (!fullscreenPointerDragging || !full || !works || fullscreenZoom <= 1) return;
		event.preventDefault();
		const dx = event.clientX - fullscreenDragStart.x;
		const dy = event.clientY - fullscreenDragStart.y;
		// Only mark as a drag after 5 px of movement to avoid click-jitter false positives
		if (Math.hypot(dx, dy) >= 5) fullscreenDragMoved = true;
		fullscreenPan = clampFullscreenPan({
			x: fullscreenPanStart.x + dx,
			y: fullscreenPanStart.y - dy
		});
	}

	function stopFullscreenPointerDrag() {
		if (typeof window === 'undefined') return;
		fullscreenPointerDragging = false;
		window.removeEventListener('pointermove', handleFullscreenPointerMove);
		window.removeEventListener('pointerup', stopFullscreenPointerDrag);
		window.removeEventListener('pointercancel', stopFullscreenPointerDrag);
	}

	function startFullscreenPointerDrag(event: IntersectionEvent<PointerEvent>) {
		if (!full || !works || fullscreenZoom <= 1) return;
		fullscreenPointerDragging = true;
		fullscreenDragMoved = false;
		fullscreenDragStart = {
			x: event.nativeEvent.clientX,
			y: event.nativeEvent.clientY
		};
		fullscreenPanStart = { ...fullscreenPan };
		window.addEventListener('pointermove', handleFullscreenPointerMove, { passive: false });
		window.addEventListener('pointerup', stopFullscreenPointerDrag);
		window.addEventListener('pointercancel', stopFullscreenPointerDrag);
	}

	function getTouchDistance(touches: TouchList) {
		if (touches.length < 2) return 0;
		const first = touches[0];
		const second = touches[1];
		return Math.hypot(second.clientX - first.clientX, second.clientY - first.clientY);
	}

	function getTouchCenter(touches: TouchList) {
		if (!touches.length) return { x: 0, y: 0 };
		if (touches.length === 1) return { x: touches[0].clientX, y: touches[0].clientY };
		return {
			x: (touches[0].clientX + touches[1].clientX) / 2,
			y: (touches[0].clientY + touches[1].clientY) / 2
		};
	}

	$effect(() => {
		full;
		works;
		untrack(() => {
			cleanupFullscreenTouchListeners();
			if (typeof window === 'undefined' || !full || !works) {
				if (!full) resetFullscreenInteractionState();
				return;
			}
			const touchTapStart = { x: 0, y: 0 };
			let touchTapMoved = false;
			// Track whether the gesture started as a pinch (2-finger)
			let gestureStartedAsPinch = false;

			const handleTouchStart = (event: TouchEvent) => {
				if (!full || !works) return;
				// Always prevent default in fullscreen so iOS doesn't hijack pinch-to-zoom
				// before our 2nd-finger touchstart fires. Tap logic lives in touchend.
				event.preventDefault();

				if (event.touches.length >= 2) {
					gestureStartedAsPinch = true;
					fullscreenTouchMode = 'pinch';
					fullscreenPinchStartDistance = getTouchDistance(event.touches);
					fullscreenPinchStartZoom = fullscreenZoom;
					fullscreenTouchCenterStart = getTouchCenter(event.touches);
					fullscreenTouchPanStart = { ...fullscreenPan };
					return;
				}

				if (event.touches.length === 1) {
					gestureStartedAsPinch = false;
					const t = event.touches[0];
					touchTapStart.x = t.clientX;
					touchTapStart.y = t.clientY;
					touchTapMoved = false;

					if (fullscreenZoom > 1) {
						fullscreenTouchMode = 'pan';
						fullscreenTouchPanStart = { ...fullscreenPan };
						fullscreenTouchCenterStart = { x: t.clientX, y: t.clientY };
					}
				}
			};

			const handleTouchMove = (event: TouchEvent) => {
				if (!full || !works) return;

				if (fullscreenTouchMode === 'pinch' && event.touches.length >= 2) {
					event.preventDefault();
					const nextDistance = getTouchDistance(event.touches);
					const nextCenter = getTouchCenter(event.touches);
					if (fullscreenPinchStartDistance > 0) {
						const nextZoom =
							fullscreenPinchStartZoom * (nextDistance / fullscreenPinchStartDistance);
						setFullscreenZoom(nextZoom);
						// Pan to follow the pinch center as fingers drift across the screen
						fullscreenPan = clampFullscreenPan({
							x: fullscreenTouchPanStart.x + (nextCenter.x - fullscreenTouchCenterStart.x),
							y: fullscreenTouchPanStart.y - (nextCenter.y - fullscreenTouchCenterStart.y)
						});
					}
					return;
				}

				if (fullscreenTouchMode === 'pan' && event.touches.length === 1 && fullscreenZoom > 1) {
					event.preventDefault();
					const center = getTouchCenter(event.touches);
					fullscreenPan = clampFullscreenPan({
						x: fullscreenTouchPanStart.x + (center.x - fullscreenTouchCenterStart.x),
						y: fullscreenTouchPanStart.y - (center.y - fullscreenTouchCenterStart.y)
					});
				}

				// Track movement for tap-vs-drag detection (single finger)
				if (event.touches.length === 1) {
					const t = event.touches[0];
					if (Math.hypot(t.clientX - touchTapStart.x, t.clientY - touchTapStart.y) > 8) {
						touchTapMoved = true;
					}
				}
			};

			const handleTouchEnd = (event: TouchEvent) => {
				if (!full || !works) return;

				if (fullscreenTouchMode === 'pinch') {
					if (fullscreenZoom > 1) {
						// Fingers lifted but still zoomed — transition to pan for remaining finger
						fullscreenTouchMode = event.touches.length === 1 ? 'pan' : 'none';
						if (fullscreenTouchMode === 'pan') {
							fullscreenTouchPanStart = { ...fullscreenPan };
							fullscreenTouchCenterStart = {
								x: event.touches[0].clientX,
								y: event.touches[0].clientY
							};
						}
					} else {
						// Pinched all the way back to 1× — close the lightbox
						fullscreenTouchMode = 'none';
						touchJustHandled = true;
						setTimeout(() => (touchJustHandled = false), 600);
						updateFullscreen(false);
					}
					return;
				}

				// Was a single-touch tap (no significant drag)
				if (!touchTapMoved && !gestureStartedAsPinch && event.changedTouches.length === 1) {
					const t = event.changedTouches[0];

					if (fullscreenZoom > 1) {
						// Tapped while zoomed in: zoom back out to 1×
						touchJustHandled = true;
						setTimeout(() => (touchJustHandled = false), 600);
						setFullscreenZoom(1);
						fullscreenTouchMode = 'none';
						return;
					}

					// At zoom=1: hit-test the mesh using world-to-pixel math.
					// Camera is at z=600, FOV set so tan(fov/2) = height/2 / 600
					// → 1 world unit == 1 CSS pixel at z=0 (mesh z ≈ 0).
					// Mesh center in pixels = viewport center (0,0 world → vw/2, vh/2 screen).
					const vw = window.innerWidth;
					const vh = window.innerHeight;
					const isVideo = (texture as any).isVideoTexture === true;
					// Mesh half-extents in pixels = world-unit half-extents × scale
					const halfW = (imageGeo?.parameters.width ?? vw * 0.85) * transform.scale * 0.5;
					const halfH = (imageGeo?.parameters.height ?? vh * 0.85) * transform.scale * 0.5;
					// Mesh screen-space center (accounting for pan)
					const cx = vw / 2 + transform.x + fullscreenPan.x;
					const cy = vh / 2 - (transform.y + fullscreenPan.y); // y is flipped

					const insideMesh =
						t.clientX >= cx - halfW &&
						t.clientX <= cx + halfW &&
						t.clientY >= cy - halfH &&
						t.clientY <= cy + halfH;

					touchJustHandled = true;
					setTimeout(() => (touchJustHandled = false), 600);
					if (insideMesh) {
						if (isVideo) {
							toggleVideoPlayback();
						} else {
							toggleFullscreenZoom();
						}
					} else {
						updateFullscreen(false);
					}
				}

				fullscreenTouchMode = 'none';
			};
			window.addEventListener('touchstart', handleTouchStart, { passive: false });
			window.addEventListener('touchmove', handleTouchMove, { passive: false });
			window.addEventListener('touchend', handleTouchEnd);
			window.addEventListener('touchcancel', handleTouchEnd);
			fullscreenTouchCleanup = () => {
				window.removeEventListener('touchstart', handleTouchStart);
				window.removeEventListener('touchmove', handleTouchMove);
				window.removeEventListener('touchend', handleTouchEnd);
				window.removeEventListener('touchcancel', handleTouchEnd);
			};
		});
	});

	function reportWorkReady() {
		if (!works) return;
		const readyKey = `${slug}:${index}`;
		if (lastReportedWorkReadyKey === readyKey) return;
		lastReportedWorkReadyKey = readyKey;
		workRouteReadyStore.markReady(slug ?? '', readyKey);
	}

	function clearSettledWorkReadyFrame() {
		if (typeof window === 'undefined' || settledWorkReadyFrame === null) return;
		window.cancelAnimationFrame(settledWorkReadyFrame);
		settledWorkReadyFrame = null;
	}

	function scheduleSettledWorkReady() {
		if (!works || typeof window === 'undefined' || settledWorkReadyFrame !== null) return;
		settledWorkReadyFrame = window.requestAnimationFrame(() => {
			settledWorkReadyFrame = null;
			runWhenWorkTargetReady(() => {
				if (
					!works ||
					loadIn ||
					!initialLoadComplete ||
					handoffInProgress ||
					hidden ||
					full ||
					animationStore.isTransitioning
				) {
					return;
				}
				syncWorkTransform();
				window.requestAnimationFrame(() => {
					if (
						!works ||
						loadIn ||
						!initialLoadComplete ||
						handoffInProgress ||
						hidden ||
						full ||
						animationStore.isTransitioning
					) {
						return;
					}
					reportWorkReady();
				});
			});
		});
	}

	function updateAspectUniforms(textureAspectValue?: number) {
		if (!imageMat) return;
		if (typeof textureAspectValue === 'number' && isFinite(textureAspectValue)) {
			imageMat.uniforms.textureAspect.value = textureAspectValue;
		}
		if (geometryArgs[0] && geometryArgs[1]) {
			imageMat.uniforms.planeAspect.value = geometryArgs[0] / geometryArgs[1];
		}
		imageMat.uniformsNeedUpdate = true;
	}

	// Calculate texture aspect ratio
	let geometryArgs = $state(
		initialSharedTransition
			? [initialSharedTransition.geometry.width, initialSharedTransition.geometry.height]
			: [1000, 1000 / (16 / 9)]
	);

	// const currentProject = $derived(page.params.slug || index === countStore.activeIndex || works);

	// change transform based on page state
	$effect(() => {
		initialLoadComplete;
		handoffInProgress;
		// this make sures the effect only runs when initialLoadComplete actually changes value.
		let prevInitialLoad = initialLoadComplete;
		works;
		return () => {
			if (prevInitialLoad !== initialLoadComplete && !handoffInProgress) {
				const nextPos = initialLoadComplete
					? works
						? projectPage(index, $size, works, imageGeo, $size.width)
						: centerPos(index)
					: initialPos(index);
				// Preserve current opacity so this positional reset never overrides
				// the opacity controlled by tweenOpacity / the transition system.
				transform = { ...nextPos, opacity: transform.opacity };
				prevInitialLoad = initialLoadComplete;
			}
		};
	});

	const hidden = $derived(
		// gpt modal opened
		gptStore.opened ||
			// while the landing page is restoring after a shared return, only the returning card may render
			(!works &&
				page.url.pathname === '/' &&
				homeTransitionStore.pending &&
				!isReturningHomeCard) ||
			// intro section owns the homepage hero before the cards take over
			(home && ($introSectionStore.active || $introSectionStore.progress < 1)) ||
			// not current project in the work page - hide ALL home cards on work pages
			(!works && page.url.pathname.includes('work')) ||
			// on home but before current index
			(index < countStore.activeIndex && page.url.pathname === '/' && !isReturningHomeCard) ||
			// in fullscreen but not this image
			(optionsStore.fullscreen && !full) ||
			// during gallery transition
			loadStore.galleryTransitioning ||
			// in gallery page TODO: change this
			page.route.id?.includes('gallery') ||
			// on home but before current index (only applies to home page)
			(page.url.pathname === '/' && index < countStore.activeIndex && !isReturningHomeCard)
	);

	function tweenOpacity(targetOpacity: number, ease: string) {
		gsap.killTweensOf(transform, 'opacity');
		gsap.to(transform, {
			opacity: targetOpacity,
			duration: 0.3,
			ease
		});
	}

	$effect(() => {
		hidden;
		initialLoadComplete;
		loadIn;
		// For works detail cards (index > 0), gate fade-in on the hero card (index 0)
		// having completed its 0.5s shared-element animation and reported ready.
		// workRouteReadyStore.count is a reactive $state getter — subscribing here
		// causes the effect to re-run when the hero calls reportWorkReady().
		// This prevents detail cards fading in while the hero transition is still playing.
		workRouteReadyStore.readyCount;
		// Track homeNavigatingToWork outside untrack so the effect re-runs when it changes.
		const homeNavToWork = animationStore.homeNavigatingToWork;
		untrack(() => {
			const heroReady =
				!works || index === 0 || workRouteReadyStore.hasKey(slug ?? '', `${slug}:0`);
			// During home→work transition (0.3s shrink), non-active home cards should
			// fade out immediately — they'd otherwise remain at their current opacity.
			const fadingOutForNavigation = !works && homeNavToWork && !isNavigating;
			if (hidden || fadingOutForNavigation || (works && index > 0 && !heroReady)) {
				tweenOpacity(0, 'power2.out');
			} else if (initialLoadComplete && !loadIn && heroReady) {
				tweenOpacity(1, 'power2.in');
			}
		});
	});

	// Update image on scroll or size changes
	$effect(() => {
		scrollStore.scroll;
		$size;
		loadIn;
		handoffInProgress;
		untrack(() => {
			if (loadIn || !initialLoadComplete || handoffInProgress) return;
			// Do not reposition home cards while a return transition is pending.
			if (homeTransitionStore.pending && !works) return;
			// Do not reposition/re-opacity home cards while navigating to work —
			// updateImage would kill the tweenOpacity(0) tween and restore homePos opacity.
			if (animationStore.homeNavigatingToWork && !works) return;
			// When in fullscreen the geometry effect is responsible for re-snapping
			// after resize (it has the updated imageGeo). Skip here to avoid a race
			// where this effect fires with stale geometry dimensions.
			if (works && full) return;
			// Skip hidden work cards while lightbox is active — they are already at
			// opacity 0 and don't need repositioning; calling updateImage on them
			// would kill running opacity tweens and could flash them briefly visible.
			if (works && hidden) return;
			if (works && !hidden) {
				syncWorkTransform();
				return;
			}
			updateImage(0, 0.01);
		});
	});

	// update image on transition & fullscreen status
	$effect(() => {
		prevParams;
		page.params.slug;
		page.url.hash;
		handoffInProgress;
		// optionsStore.fullscreen;
		untrack(() => {
			// Don't run during initial load animation
			if ((!initialLoadComplete && !works) || handoffInProgress) return;

			if (page.url.hash === '#reels' && slug === 'reels') {
				updateFullscreen(true);
				// window.addEventListener('keydown', escapeListener);
			} else {
				updateFullscreen(false, full && slug === 'reels');
				// if (full) window.removeEventListener('keydown', escapeListener);
			}
			if (full || prevParams === page.params.slug) return;
			prevParams = page.params.slug || '';
			// if (index === 0) console.log('[NEXT PR TRANSITION]', index);
			// scrollStore.scroll = document.documentElement.scrollTop;
			// const duration = !works && page.url.pathname.includes('work') ? 0.01 : 0.5
			runWhenWorkTargetReady(() => {
				updateImage(0.2, 0.5, () => {
					loadIn = false;
					scheduleSettledWorkReady();
					if (!works) {
						animationStore.isTransitioning = false;
					}
				});
			});
		});
	});

	// homepage && agent modal state card update
	$effect(() => {
		animationStore.isTransitioning;
		loadIn;
		initialLoadComplete;
		handoffInProgress;
		hidden;
		// NOTE: `full` is intentionally NOT tracked here. When the lightbox closes,
		// updateFullscreen(false) already calls updateImage(0, 0.5) for the smooth
		// close animation. If `full` were tracked, this effect would re-run and
		// scheduleSettledWorkReady → syncWorkTransform would do an instant
		// transform assignment that overrides the 0.5s gsap tween.
		page.params.slug;
		untrack(() => {
			if (!works) return;
			scheduleSettledWorkReady();
		});
	});

	$effect(() => {
		countStore.inertiaIndex;
		gptStore.opened;
		loadStore.galleryTransitioning;
		handoffInProgress;
		untrack(() => {
			if (loadIn || !initialLoadComplete || handoffInProgress) return;
			// While a home-return transition is pending, non-returning cards are
			// pre-placed by effect 976 and hidden (opacity 0). Suppressing the 0.5s
			// updateImage here prevents a ScrollTrigger.update() pixel-rounding
			// side-effect from firing a stale-viewportTop tween that would make the
			// cards visibly slide after the transition reveals them.
			if (homeTransitionStore.pending && !works) return;
			// Do not reposition/re-opacity home cards while navigating to work —
			// updateImage would kill the tweenOpacity(0) tween and restore homePos opacity.
			if (animationStore.homeNavigatingToWork && !works) return;
			// Fade out when transitioning to gallery
			if (loadStore.galleryTransitioning && !works) {
				gsap.to(transform, {
					opacity: 0,
					duration: 0.4
				});
				return;
			}
			// console.log('[HOMEPAGE UPDATE]', index);
			// const duration = !works && page.url.pathname.includes('work') ? 0.01 : 0.5
			queueMicrotask(() => updateImage(0, 0.5));
		});
	});

	//theme
	// $effect(() => {
	// 	if (!imageMat) return;
	// 	const invertedValue = optionsStore.dark ? 0.0 : 1.0;
	// 	imageMat.uniforms.inverted.value = invertedValue;
	// 	imageMat.uniformsNeedUpdate = true;
	// 	untrack(() => console.log(slug, works, 'inverted:', imageMat.uniforms.inverted.value));
	// });

	// Hero card on a work page (index=0) shares the layout's thumbnail video (id=slug).
	// Content cards (index ≥ 1) use videos created by ThreeScene with 0-based ids (slug-0, slug-1…).
	function workVideoId() {
		if (!works) return slug ?? '';
		return index === 0 ? (slug ?? '') : `${slug}-${index - 1}`;
	}

	function updateFullscreen(bool: boolean, updateStore = true) {
		if (updateStore) optionsStore.fullscreen = bool;
		const el = document.getElementById(workVideoId());
		if (el instanceof HTMLVideoElement) {
			el.muted = !bool;
			el.currentTime = 0;
			if (bool) el.play();
		}
		full = bool;
		if (bool) {
			resetFullscreenInteractionState();
			gsap.to(img, {
				scale: 1
			});
			swapToHighResTexture();
			// we have to set timeout here so the click doesn't run this too on the same event loop
			setTimeout(() => document.addEventListener('click', escapeListener), 0);
			window.addEventListener('keydown', escapeListener);
		} else {
			resetFullscreenInteractionState();
			stopFullscreenPointerDrag();
			cleanupFullscreenTouchListeners();
			revertToLowResTexture();
			optionsStore.videoPaused = false;
			document.removeEventListener('click', escapeListener);
			window.removeEventListener('keydown', escapeListener);
		}
		// Don't update during initial load animation
		if (initialLoadComplete) {
			updateImage(0, 0.5);
		}
	}

	function escapeListener(e: KeyboardEvent | MouseEvent) {
		// Don't handle if gpt is open
		if (gptStore.opened) return;
		// If handleClick already processed this event (raycaster hit the mesh),
		// clear the flag and bail — we don't want to double-close or double-zoom.
		if (e instanceof MouseEvent && meshHandledClick) {
			meshHandledClick = false;
			return;
		}

		if (
			(e instanceof KeyboardEvent && e.key.toLowerCase() === 'escape') ||
			e instanceof MouseEvent
		) {
			// e.stopPropagation();
			updateFullscreen(false);
			if (slug === 'reels' && page.url.hash === '#reels') {
				goto('/');
			}
		}
		// stopPropagation = false;
	}

	function navigateToWork(targetPath: string) {
		if (isNavigating) return;
		const targetSlug = targetPath.split('/').pop() ?? '';

		suppressUpdates = true;
		isNavigating = true;
		animationStore.homeNavigatingToWork = true;

		gsap.to(transform, {
			scale: transform.scale * 0.75,
			ease: 'power3.out',
			duration: 0.3,
			onComplete: () => {
				sharedCardTransitionStore.set({
					direction: 'to-work',
					index,
					slug: targetSlug,
					geometry: {
						width: imageGeo.parameters.width,
						height: imageGeo.parameters.height
					},
					transform: {
						x: transform.x,
						y: transform.y,
						z: transform.z,
						scale: transform.scale,
						opacity: transform.opacity
					}
				});
				goto(targetPath).finally(() => {
					isNavigating = false;
					suppressUpdates = false;
					animationStore.homeNavigatingToWork = false;
					updateImage(0, 0.5);
				});
			}
		});
	}

	function handleClick(event: IntersectionEvent<'click'>, index: number) {
		if (hidden) return;
		// Skip synthesized click events that fire ~300ms after a touchend we already handled
		if (touchJustHandled) {
			meshHandledClick = true;
			return;
		}
		// Only set the flag when already in fullscreen: the opening click doesn't
		// need guarding (escapeListener isn't registered yet at that point).
		if (full) meshHandledClick = true;
		event.stopPropagation();
		if (full && works && fullscreenDragMoved) {
			fullscreenDragMoved = false;
			return;
		}
		// If in enlarged mode, make it smaller
		if (full && works) {
			const isVideo = (texture as any).isVideoTexture === true;
			if (isVideo) {
				toggleVideoPlayback();
			} else {
				toggleFullscreenZoom();
			}
		} else if (full && slug !== 'reels') {
			updateFullscreen(false);
		} else if (slug === 'reels' && page.url.hash === '#reels') {
			goto('/');
			// if in works or reels, make it large
		} else if (page.url.pathname.includes('work') && !full) {
			updateFullscreen(true);
		} else if (!page.params.slug) {
			if (countStore.activeIndex !== index) {
				countStore.inertiaIndex = index;
				return;
			}

			if (slug === 'reels' || index === 0) {
				goto('/#reels');
			} else {
				navigateToWork(`/work/${slug}`);
			}
		}
	}

	function handleEnter(event: IntersectionEvent<'pointerover'>) {
		// disable hover effect when hidden or fullscreen
		if (hidden || full) return;
		gsap.to(img, {
			scale: 1.15
		});
		cursorStore.cursorState = 'link';
	}

	function handleLeave(event: IntersectionEvent<'pointerleave'>) {
		// disable hover effect when hidden or fullscreen
		if (hidden || full) return;
		gsap.to(img, {
			scale: 1
		});
		easeFactor = 0.05;
		targetMousePosition = { ...prevPosition };
		cursorStore.cursorState = '';
	}

	function handleMove(event: IntersectionEvent<'pointermove'>) {
		// disable hover effect when hidden or fullscreen or in works page
		if (hidden || full || works) return;
		easeFactor = 0.02;
		prevPosition = { ...targetMousePosition };
		targetMousePosition.x = event.uv!.x;
		targetMousePosition.y = event.uv!.y;
		aberrationIntensity = 2.25;
	}

	function heroTransitionTargetReady() {
		if (!works || index !== 0) return true;
		const mediaEl = document.getElementById(`media-${index}`) as
			| HTMLImageElement
			| HTMLVideoElement
			| null;
		if (!mediaEl || !imageGeo) return false;
		const rect = mediaEl.getBoundingClientRect();
		return rect.width > 32 && rect.height > 32;
	}

	function workTargetReady() {
		if (!works) return true;
		const mediaEl = document.getElementById(`media-${index}`) as
			| HTMLImageElement
			| HTMLVideoElement
			| null;
		if (!mediaEl || !imageGeo) return false;
		const rect = mediaEl.getBoundingClientRect();
		return rect.width > 24 && rect.height > 24;
	}

	function runWhenWorkTargetReady(callback: () => void, maxAttempts = 18) {
		if (!works || typeof window === 'undefined') {
			callback();
			return;
		}

		let attempts = 0;
		const waitForStableTarget = () => {
			if (workTargetReady() || attempts >= maxAttempts) {
				callback();
				return;
			}
			attempts += 1;
			window.requestAnimationFrame(waitForStableTarget);
		};

		window.requestAnimationFrame(waitForStableTarget);
	}

	function startConsumedSharedTransition(transition: NonNullable<typeof sharedTransitionTarget>) {
		const finishTransition = () => {
			handoffInProgress = false;
			sharedTransitionTarget = null;
			if (works) {
				syncWorkTransform();
			}
		};

		const run = () => {
			updateImage(0, transition.direction === 'to-work' ? 0.5 : 0.01, () => {
				if (transition.direction === 'to-home' && homeTransitionStore.pending) return;
				finishTransition();
			});
		};

		if (transition.direction !== 'to-work') {
			run();
			return;
		}

		let attempts = 0;
		const waitForStableHero = () => {
			if (heroTransitionTargetReady() || attempts >= 12) {
				run();
				return;
			}
			attempts += 1;
			window.requestAnimationFrame(waitForStableHero);
		};

		window.requestAnimationFrame(waitForStableHero);
	}

	$effect(() => {
		homeTransitionStore.pending;
		handoffInProgress;
		sharedTransitionTarget?.direction;
		untrack(() => {
			if (
				!handoffInProgress ||
				sharedTransitionTarget?.direction !== 'to-home' ||
				homeTransitionStore.pending
			) {
				return;
			}
			handoffInProgress = false;
			sharedTransitionTarget = null;
			animationStore.isTransitioning = false;
		});
	});

	$effect(() => {
		homeTransitionStore.pending;
		initialLoadComplete;
		imageGeo;
		$size;
		untrack(() => {
			if (
				!home ||
				works ||
				page.url.pathname !== '/' ||
				!homeTransitionStore.pending ||
				!imageGeo ||
				!initialLoadComplete ||
				isReturningHomeCard
			) {
				return;
			}
			// Pre-place at viewportTop=0. During a home-return the category section
			// hasn't been re-pinned by ScrollTrigger yet, so
			// projectSectionStore.viewportTop may be a large transient value. Using
			// the eventual pinned value (0) avoids a visible slide when the cards
			// become opaque after homeTransitionStore.clear().
			transform = {
				...transform,
				...homePos(index, imageGeo, $size, 0),
				opacity: 0
			};
		});
	});

	function syncWorkTransform() {
		if (!works || !imageGeo || hidden || full || !workTargetReady()) return;
		const { opacity: _opacity, ...pos } = projectPage(index, $size, works, imageGeo, $size.width);
		transform = { ...transform, ...pos };
	}

	function scrollWorkPageToTop() {
		if (typeof window === 'undefined') return Promise.resolve();
		const scrollRoot = document.scrollingElement ?? document.documentElement;
		const start = Math.max(window.scrollY, scrollRoot?.scrollTop ?? 0);
		if (start <= 1) return Promise.resolve();

		return new Promise<void>((resolve) => {
			const scrollState = { top: start };
			gsap.to(scrollState, {
				top: 0,
				duration: 0.3,
				ease: 'power2.out',
				overwrite: true,
				onUpdate: () => {
					window.scrollTo({ top: scrollState.top, left: 0, behavior: 'auto' });
					scrollStore.scroll = scrollState.top;
				},
				onComplete: () => {
					window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
					scrollStore.scroll = 0;
					resolve();
				}
			});
		});
	}

	// Update image position and scale based on current state
	function updateImage(delay = 0, duration = 0.01, callback?: () => void) {
		if (!loadStore.loaded || suppressUpdates) return;
		let pos;
		// if homepage
		if (home) {
			pos = homePos(index, imageGeo, $size);
			// if hidden
		} else if (hidden) {
			// pos = initialPos(index);
			pos = transform;
			pos.opacity = 0;
			// if fullscreen
		} else if (full) {
			pos = fullscreen(index, imageGeo, $size);
			// if work page & work card
		} else if (works) {
			// console.log('[WORK PAGE UPDATE]', index);
			pos = projectPage(index, $size, works, imageGeo, $size.width);
			// For detail cards (index > 0), opacity is gated by workRouteReadyStore
			// via the tweenOpacity effect. Strip it here so the positional snap from
			// syncInitialPosition / updateImage never races the fade-in gate.
			if (index > 0) {
				pos = { ...pos };
				delete (pos as Partial<typeof pos>).opacity;
			}
		}

		if (!data.projectsLength) return;
		// For works detail cards (index > 0), opacity is exclusively controlled by
		// tweenOpacity. Scope the kill to positional properties only so the fade-in
		// tween isn't cancelled by a positional updateImage call.
		gsap.killTweensOf(transform, works && index > 0 ? 'x,y,z,scale' : undefined);
		gsap.to(transform, {
			...pos,
			delay,
			duration,
			overwrite: 'auto',
			onComplete: callback ? callback : () => {}
		});
	}

	// useTask(() => {
	// 	// watch fulllscreen
	// 	optionsStore.options.fullscreen;
	// 	untrack(() => {
	// 		updateImage(0, 0.5)
	// 	})
	// })

	useTask(() => {
		mousePosition.x += (targetMousePosition.x - mousePosition.x) * easeFactor;
		mousePosition.y += (targetMousePosition.y - mousePosition.y) * easeFactor;
		imageMat.uniforms.scale.value = img.scale;
		imageMat.uniforms.u_mouse.value.set(mousePosition.x, mousePosition.y);
		imageMat.uniforms.opacity.value = transform.opacity;
		imageMat.uniforms.uCoverTexture.value = shouldCoverTexture;

		imageMat.uniforms.u_prevMouse.value.set(prevPosition.x, prevPosition.y);

		aberrationIntensity = works ? 0.0 : Math.max(0.0, aberrationIntensity - 0.02);
		imageMat.uniforms.u_aberrationIntensity.value = aberrationIntensity;

		const motionProgress = works
			? Math.abs(scrollStore.velocity) < 18
				? 0
				: velocityToMotionProgress(scrollStore.velocity, 1100)
			: indexOffsetToMotionProgress(countStore.inertiaIndex - countStore.activeIndex);

		// Update screen position for bend calculation
		// transform.y is world position, scrollStore.scroll is how much we've scrolled
		// To get viewport position: world Y + scroll offset
		const viewportY = transform.y + scrollStore.scroll;
		imageMat.uniforms.uScreenPosition.value.set(transform.x, viewportY);
		imageMat.uniforms.uScreenCenter.value.set(0, scrollStore.scroll); // Center moves with scroll

		const normalizedX = transform.x / Math.max($size.width / 2, 1);
		motionState = stepCardMotion(motionState, {
			motionProgress,
			normalizedX,
			enableRoll: works,
			bendMax: works ? 52 : 50,
			rotationMax: works ? 0.012 : 0.15,
			zoomMax: works ? 0.08 : 0.25,
			textureRotationMax: works ? 0.028 : 0.1,
			threshold: works ? 0.055 : 0.1,
			easingPower: works ? 2.4 : 3
		});
		imageMat.uniforms.uBendAmplitude.value = motionState.bendAmount;
		imageMat.uniforms.uRotation.value = motionState.rotationAmount;
		imageMat.uniforms.uEnableRoll.value = works;
		imageMat.uniforms.uTextureZoom.value = motionState.textureZoom;
		imageMat.uniforms.uTextureRotation.value = motionState.textureRotation;
		// Only static image textures are uploaded as SRGB8 (hardware-linearized on sample).
		// VideoTextures are RGBA8 — no hardware linearization — so no re-encoding needed.
		const isVideoTex = (texture as any).isVideoTexture === true;
		const needsColorspaceConversion = !isVideoTex;
		const invertAfterOutput = needsColorspaceConversion && !optionsStore.dark;
		imageMat.uniforms.uApplyOutputColorSpace.value = needsColorspaceConversion;
		imageMat.uniforms.uInvertAfterOutputColorSpace.value = invertAfterOutput;
		imageMat.uniforms.inverted.value = !optionsStore.dark && !invertAfterOutput ? 1.0 : 0.0;
		if (
			home &&
			page.url.pathname === '/' &&
			index === countStore.activeIndex &&
			imageGeo &&
			!hidden
		) {
			currentHomeCardSnapshotStore.set({
				index,
				slug: slug ?? '',
				geometry: {
					width: imageGeo.parameters.width,
					height: imageGeo.parameters.height
				},
				transform: {
					x: transform.x,
					y: transform.y,
					z: transform.z,
					scale: transform.scale,
					opacity: transform.opacity
				}
			});
		}
		imageMat.uniformsNeedUpdate = true;
	});

	onMount(() => {
		texture.needsUpdate = true;
		// const html = document.documentElement;
		// scrollStore.scroll = html.scrollTop;
		const transition = initialSharedTransition ?? resolveSharedTransition();
		if (transition) {
			sharedCardTransitionStore.clear();
			geometryArgs = [transition.geometry.width, transition.geometry.height];
			transform = { ...transition.transform };
			sharedTransitionTarget = transition;
			handoffInProgress = true;
			initialLoadComplete = true;
			loadIn = false;
			queueMicrotask(() => {
				if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
					window.requestAnimationFrame(() => {
						window.requestAnimationFrame(() => startConsumedSharedTransition(transition));
					});
				} else {
					startConsumedSharedTransition(transition);
				}
			});
			return;
		}

		initialLoadComplete = true;
		loadIn = false;
		const syncInitialPosition = () =>
			runWhenWorkTargetReady(() =>
				updateImage(0, 0.01, () => {
					scheduleSettledWorkReady();
				})
			);
		queueMicrotask(() => {
			if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
				window.requestAnimationFrame(() => {
					window.requestAnimationFrame(syncInitialPosition);
				});
			} else {
				syncInitialPosition();
			}
		});
		// if (page.params.slug) {
		// 	console.log('[PROJECT TRANSITION]', index);
		// 	projectTransition();
		// }
		// } else {
		// 	gsap.to(transform, {
		// 		...enlarged(index),
		// 		onComplete: () => {
		// 			updateImage(1.5, 0.5, () => {loadIn = false});
		// 		}
		// 	});
		// }
	});

	// $effect(() => {
	// 	$page.url.hash;
	// 	untrack(() => {
	// 		if (slug !== 'reels') return;
	// 		if ($page.url.hash === '#reels') {
	// 			updateFullscreen(true);
	// 		} else {
	// 			updateFullscreen(false);
	// 		}
	// 	});
	// });

	let lastPathname = page.url.pathname;

	$effect(() => {
		const currentPath = page.url.pathname;
		initialLoadComplete;
		loadIn;
		handoffInProgress;
		untrack(() => {
			if (
				currentPath === '/' &&
				lastPathname?.includes('work') &&
				!handoffInProgress &&
				!homeTransitionStore.pending
			) {
				initialLoadComplete = true;
				loadIn = false;
				suppressUpdates = false;
				const rerun = () => updateImage(0, 0.01);
				if (typeof window !== 'undefined' && 'requestAnimationFrame' in window) {
					window.requestAnimationFrame(rerun);
				} else {
					rerun();
				}
			}
			lastPathname = currentPath;
		});
	});

	// Ensure suppressed updates are released once we land back on the home page.
	// Only clear the flag when we are NOT in the middle of a navigate-to-work
	// animation: setting suppressUpdates=true while already on '/' (inside
	// navigateToWork) would otherwise immediately flip it back to false, which
	// lets pending updateImage microtasks overwrite the shrink tween.
	$effect(() => {
		suppressUpdates;
		page.url.pathname;
		untrack(() => {
			if (!suppressUpdates || page.url.pathname !== '/' || isNavigating) return;
			suppressUpdates = false;
		});
	});

	// Watch for texture dimension changes and update geometry
	$effect(() => {
		if (!texture || !texture.image) return;
		handoffInProgress;
		const img = texture.image;
		const width = img.videoWidth || img.width;
		const height = img.videoHeight || img.height;
		let expected;
		//works page
		if (works && width > 0 && height > 0) {
			const aspect = width / height;
			let w = $size.width * aspect * 0.25;
			let h = $size.width * 0.25;
			if (w > $size.width) {
				h = ($size.width / aspect) * 0.25;
				w = $size.width * 0.25;
			}
			expected = [w, h];
			// landing page
		} else if (width > 0 && height > 0) {
			const aspect = width / height;
			const targetAspect = home && homeAspectRatio ? homeAspectRatio : aspect;
			let w = $size.width * 0.5;
			let h = w / targetAspect;
			if (h > $size.width) {
				h = $size.width * 0.5;
				w = h * targetAspect;
			}
			expected = [w, h];
		} else {
			const fallbackAspect = home && homeAspectRatio ? homeAspectRatio : 16 / 9;
			expected = [$size.width * 0.5, ($size.width / fallbackAspect) * 0.5];
		}
		const textureAspectVal = width > 0 && height > 0 ? width / height : 16 / 9;
		if (geometryArgs[0] !== expected[0] || geometryArgs[1] !== expected[1]) {
			const currentWidth = geometryArgs[0] || imageGeo?.parameters.width || 0;
			const currentScale = transform.scale;
			geometryArgs = [...expected, 32, 32];
			if (handoffInProgress && currentWidth > 0 && expected[0] > 0 && currentScale > 0) {
				const preservedVisibleWidth = currentWidth * currentScale;
				transform = {
					...transform,
					scale: preservedVisibleWidth / expected[0]
				};
			}
			if (imageGeo && image) {
				imageGeo.dispose();
				const newGeo = new PlaneGeometry(...geometryArgs);
				image.geometry = newGeo;
				imageGeo = newGeo;
			}
		}
		updateAspectUniforms(textureAspectVal);
		if (works && initialLoadComplete && !loadIn && !handoffInProgress) {
			// Read `full` inside untrack so this effect does NOT subscribe to it.
			// This prevents the effect from re-running when the lightbox opens/closes,
			// which would call updateImage(0,0.01) and kill the 0.5s closing tween.
			// The effect still re-runs for legitimate deps: $size (resize), texture changes.
			untrack(() => {
				if (full) {
					// Geometry was rebuilt due to resize while in fullscreen.
					updateImage(0, 0.01);
				} else if (hidden) {
					// Ensure hidden cards stay at opacity 0 after a geometry rebuild.
					tweenOpacity(0, 'power2.out');
				} else {
					queueMicrotask(() => runWhenWorkTargetReady(() => syncWorkTransform()));
				}
			});
		}
	});

	// exit transition to home
	let isNavigating = false;
	beforeNavigate(({ to, cancel }) => {
		if (!to) return;
		if (!home && index === 0 && to.url.pathname === '/' && !isNavigating) {
			suppressUpdates = true;
			cancel();
			isNavigating = true;
			updateFullscreen(false);
			initialLoadComplete = false;
			loadIn = true;

			void scrollWorkPageToTop().then(() => {
				if (works) {
					syncWorkTransform();
				}
				gsap.to(transform, {
					...homePos(countStore.activeIndex, imageGeo, $size),
					duration: 0.5,
					ease: 'power3.out',
					onComplete: () => {
						sharedCardTransitionStore.set({
							direction: 'to-home',
							index: countStore.activeIndex,
							slug: slug ?? '',
							geometry: {
								width: imageGeo.parameters.width,
								height: imageGeo.parameters.height
							},
							transform: {
								x: transform.x,
								y: transform.y,
								z: transform.z,
								scale: transform.scale,
								opacity: transform.opacity
							}
						});
						goto('/', { noScroll: true }).then(() => {
							isNavigating = false;
							suppressUpdates = false;
						});
					}
				});
			});
		}
	});

	onDestroy(() => {
		clearSettledWorkReadyFrame();
		stopFullscreenPointerDrag();
		cleanupFullscreenTouchListeners();
		revertToLowResTexture();
	});
</script>

<T.Mesh
	bind:ref={image as Mesh}
	scale={transform.scale * fullscreenZoom}
	position={[transform.x + fullscreenPan.x, transform.y + fullscreenPan.y, transform.z]}
	onclick={(e: IntersectionEvent<'click'>) => {
		handleClick(e, index);
	}}
	onpointerdown={(e: IntersectionEvent<PointerEvent>) => startFullscreenPointerDrag(e)}
	userData={{
		skipPostFX: works
	}}
	onpointerover={(e: IntersectionEvent<'pointerover'>) => handleEnter(e)}
	onpointerleave={(e: IntersectionEvent<'pointerleave'>) => handleLeave(e)}
	onpointermove={(e: IntersectionEvent<'pointermove'>) => handleMove(e)}
>
	<T.PlaneGeometry bind:ref={imageGeo} args={[...geometryArgs, 32, 32]} />

	<T.ShaderMaterial
		bind:ref={imageMat}
		uniforms={{
			u_mouse: { value: new Vector2() },
			u_prevMouse: { value: new Vector2() },
			u_aberrationIntensity: { value: 0.0 },
			u_texture: { value: texture },
			uBendAmplitude: { value: 10.0 },
			uBendStrength: { value: 0.25 },
			uRotation: { value: 0.0 },
			uEnableRoll: { value: works },
			uTextureZoom: { value: 1.0 },
			uTextureRotation: { value: 0.0 },
			uScreenPosition: { value: new Vector2(0, 0) },
			uScreenCenter: { value: new Vector2(0, 0) },
			textureAspect: {
				value: (() => {
					if (texture && texture.image) {
						const width = texture.image.videoWidth || texture.image.width;
						const height = texture.image.videoHeight || texture.image.height;
						return width && height ? width / height : 16 / 9;
					}
					return 16 / 9;
				})()
			},
			planeAspect: {
				value: (() => {
					if (geometryArgs && geometryArgs[0] && geometryArgs[1]) {
						return geometryArgs[0] / geometryArgs[1];
					}
					return 16 / 9;
				})()
			},
			uCoverTexture: { value: shouldCoverTexture },
			uApplyOutputColorSpace: { value: (texture as any).isVideoTexture !== true },
			uInvertAfterOutputColorSpace: {
				value: (texture as any).isVideoTexture !== true && !optionsStore.dark
			},
			scale: { value: 1 },
			inverted: {
				value: !optionsStore.dark && (texture as any).isVideoTexture === true ? 1.0 : 0.0
			},
			opacity: { value: 0.0 }
		}}
		transparent={true}
		depthWrite={false}
		{vertexShader}
		{fragmentShader}
	/>
</T.Mesh>
