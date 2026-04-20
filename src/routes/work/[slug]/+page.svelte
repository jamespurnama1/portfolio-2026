<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		animationStore,
		countStore,
		gptStore,
		homeTransitionStore,
		loadStore,
		scrollStore,
		sharedCardTransitionStore,
		workRouteReadyStore
	} from '$lib/stores/index.svelte';
	import Section from '$lib/components/Section.svelte';
	import ScrambleText from '$lib/components/ScrambleText.svelte';
	import { gsap } from 'gsap';
	import { onMount, tick, untrack } from 'svelte';
	import { type PageData } from './$types';
	import { optionsStore } from '$lib/stores/options.svelte';
	import type { Post } from '$lib/types';
	import caret from '$lib/images/caret.svg';
	import chroma from 'chroma-js';
	import { cardDimensionsStore } from '$lib/stores/cardDimensions.svelte';
	import { browser } from '$app/environment';
	import type { ScrollTrigger as ScrollTriggerInstance } from 'gsap/ScrollTrigger';

	const { data }: { data: Required<PageData> } = $props();
	let caretEl = $state() as HTMLImageElement;
	let innerWidth = $state(0);
	let scrollHeight = $state(0);
	let innerHeight = $state(0);
	let animating = true;
	let tl = gsap.timeline();
	let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null;
	let canvasContainerEl = $state<HTMLElement | null>(null);
	let scrollTriggerRefreshFrame = $state<number | null>(null);
	let nativeMediaFallbackVisible = $state(false);
	let nativeMediaFallbackHideFrame = $state<number | null>(null);
	let nativeMediaFallbackHideTimeout = $state<number | null>(null);
	// Suppress hero native fallback during shared element transition to prevent duplicate image
	const _initPendingTransition = browser ? sharedCardTransitionStore.value : null;
	let suppressHeroFallbackDuringHandoff = $state(
		_initPendingTransition?.direction === 'to-work' &&
			_initPendingTransition?.slug === page.params.slug
	);
	let nextProjectVisualProgressAnimated = $state(0);
	let nextProjectVisualProgressFrame = $state<number | null>(null);
	let articleEl = $state<HTMLElement | null>(null);
	let bottomSentinelEl = $state<HTMLElement | null>(null);
	let nextProjectOverlayEl = $state<HTMLElement | null>(null);
	let nextProjectOverlayCopyEl = $state<HTMLElement | null>(null);
	let bottomSentinelDistance = $state(Infinity);
	let nextProjectTriggerProgress = $state(0);
	let nextProjectNavigationPending = $state(false);
	let nextProjectThresholdReached = $state(false);
	let touchTrackingActive = $state(false);
	let touchStartY = $state<number | null>(null);
	let touchStartProgress = $state(0);
	let lastTouchY = $state(0);
	let pointerDecayTimeout = $state<number | null>(null);
	let pointerDecayFrame = $state<number | null>(null);
	let lastPointerDecayTime = $state(0);
	let nextProjectTransitionActive = $state(false);
	let nextProjectTransitionEntering = $state(false);
	let transitionNextProjectTitle = $state('');
	let transitionNextColorScale = $state<string[]>([]);
	let nextProjectPreviewScale = $state(0.34);
	let nextProjectPreviewOpacity = $state(0);
	let nextProjectPreviewCopyY = $state(40);
	let nextProjectPreviewCopyOpacity = $state(0);
	let nextProjectCancelAnimating = $state(false);
	let transitionScrollLocked = $state(false);
	let nextProjectStatusScrambleActive = $state(false);
	let nextProjectStatusScrambleTimeout = $state<number | null>(null);
	let nextProjectStatusPhase = $state<'prompt' | 'opening'>('prompt');
	const NEXT_PROJECT_ENGAGE_ZONE = 96;
	const NEXT_PROJECT_RESET_ZONE = 420;
	const NEXT_PROJECT_POINTER_THRESHOLD = 100;
	const NEXT_PROJECT_TOUCH_THRESHOLD = 360;
	const NEXT_PROJECT_POINTER_MIN_LINES = 0.35;
	const NEXT_PROJECT_POINTER_MAX_TRIGGER_LINES = 3.2;
	const NEXT_PROJECT_POINTER_IDLE_MS = 500;
	const NEXT_PROJECT_POINTER_DECAY_PER_SECOND = 1.8;
	const sanityImageParams = $derived.by(() => {
		const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
		const baseWidth = innerWidth || fallbackWidth;
		const targetWidth = Math.min(Math.max(Math.round(baseWidth || 1920), 480), 2560);
		return `auto=format&fit=max&q=85&w=${targetWidth}`;
	});

	function withSanityImageParams(url?: string) {
		if (!url || /\.(mp4|webm)$/i.test(url) || !url.includes('cdn.sanity.io')) {
			return url ?? '';
		}
		return `${url}${url.includes('?') ? '&' : '?'}${sanityImageParams}`;
	}

	function getViewportScrollTop() {
		const scrollRoot = document.scrollingElement ?? document.documentElement;
		return Math.max(window.scrollY, scrollRoot?.scrollTop ?? 0);
	}

	function getBottomSentinelDistance() {
		if (!bottomSentinelEl) {
			const scrollRoot = document.scrollingElement ?? document.documentElement;
			const fallbackScrollHeight = Math.max(
				scrollRoot?.scrollHeight ?? 0,
				document.documentElement.scrollHeight,
				innerHeight
			);
			return Math.max(0, fallbackScrollHeight - (getViewportScrollTop() + innerHeight));
		}
		const rect = bottomSentinelEl.getBoundingClientRect();
		return rect.bottom - innerHeight;
	}

	function getDocumentScrollHeight() {
		const scrollRoot = document.scrollingElement ?? document.documentElement;
		return Math.max(
			scrollRoot?.scrollHeight ?? 0,
			document.documentElement.scrollHeight,
			innerHeight
		);
	}

	function updateScrollMetrics() {
		scrollStore.scroll = getViewportScrollTop();
		scrollHeight = getDocumentScrollHeight();
		bottomSentinelDistance = getBottomSentinelDistance();
	}

	function vibrateThreshold(reached: boolean) {
		if (typeof navigator === 'undefined' || !('vibrate' in navigator)) return;
		navigator.vibrate(reached ? 16 : 8);
	}

	function setNextProjectTriggerProgress(nextProgress: number, triggerNavigation = true) {
		const previousProgress = nextProjectTriggerProgress;
		if (nextProgress > 0 && nextProjectCancelAnimating) {
			nextProjectCancelAnimating = false;
			gsap.killTweensOf([nextProjectOverlayEl, nextProjectOverlayCopyEl]);
		}
		const clampedProgress = Math.min(1, Math.max(0, nextProgress));
		const reached = clampedProgress >= 1;
		if (reached !== nextProjectThresholdReached) {
			nextProjectThresholdReached = reached;
			vibrateThreshold(reached);
		}
		nextProjectTriggerProgress = clampedProgress;
		if (
			clampedProgress === 0 &&
			previousProgress > 0 &&
			!nextProjectTransitionActive &&
			!nextProjectTransitionEntering &&
			!nextProjectNavigationPending
		) {
			startNextProjectCancelAnimation();
		}
		if (reached && triggerNavigation) {
			void triggerNextProjectNavigation();
		}
	}

	function stopPointerDecay() {
		if (pointerDecayTimeout !== null) {
			window.clearTimeout(pointerDecayTimeout);
			pointerDecayTimeout = null;
		}
		if (pointerDecayFrame !== null) {
			window.cancelAnimationFrame(pointerDecayFrame);
			pointerDecayFrame = null;
		}
	}

	function startPointerDecay() {
		if (typeof window === 'undefined' || nextProjectNavigationPending || touchTrackingActive)
			return;
		stopPointerDecay();
		lastPointerDecayTime = performance.now();
		const decay = (now: number) => {
			const elapsedMs = now - lastPointerDecayTime;
			lastPointerDecayTime = now;
			const decayAmount = (elapsedMs / 1000) * NEXT_PROJECT_POINTER_DECAY_PER_SECOND;
			if (nextProjectTriggerProgress <= 0 || bottomSentinelDistance > NEXT_PROJECT_RESET_ZONE) {
				setNextProjectTriggerProgress(0, false);
				pointerDecayFrame = null;
				return;
			}
			setNextProjectTriggerProgress(nextProjectTriggerProgress - decayAmount, false);
			if (nextProjectTriggerProgress <= 0) {
				pointerDecayFrame = null;
				return;
			}
			pointerDecayFrame = window.requestAnimationFrame(decay);
		};
		pointerDecayTimeout = window.setTimeout(() => {
			pointerDecayTimeout = null;
			pointerDecayFrame = window.requestAnimationFrame(decay);
		}, NEXT_PROJECT_POINTER_IDLE_MS);
	}

	function normalizeWheelToLines(event: WheelEvent) {
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY;
		if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 24;
		return event.deltaY / 16;
	}

	function clearNextProjectStatusScrambleTimeout() {
		if (!browser || nextProjectStatusScrambleTimeout === null) return;
		window.clearTimeout(nextProjectStatusScrambleTimeout);
		nextProjectStatusScrambleTimeout = null;
	}

	function stopNextProjectStatusScramble() {
		clearNextProjectStatusScrambleTimeout();
		nextProjectStatusScrambleActive = false;
	}

	function triggerNextProjectStatusScramble(durationMs = 680) {
		if (!browser) return;
		stopNextProjectStatusScramble();
		requestAnimationFrame(() => {
			nextProjectStatusScrambleActive = true;
			nextProjectStatusScrambleTimeout = window.setTimeout(() => {
				nextProjectStatusScrambleActive = false;
				nextProjectStatusScrambleTimeout = null;
			}, durationMs);
		});
	}

	function startNextProjectCancelAnimation() {
		if (
			nextProjectCancelAnimating ||
			nextProjectTransitionActive ||
			nextProjectTransitionEntering ||
			!nextProjectOverlayEl ||
			!nextProjectOverlayCopyEl
		) {
			return;
		}
		nextProjectCancelAnimating = true;
		gsap.killTweensOf([nextProjectOverlayEl, nextProjectOverlayCopyEl]);
		gsap
			.timeline({
				defaults: { ease: 'power2.inOut' },
				onComplete: () => {
					nextProjectCancelAnimating = false;
					if (nextProjectOverlayEl) {
						gsap.set(nextProjectOverlayEl, { clearProps: 'transform,opacity' });
					}
					if (nextProjectOverlayCopyEl) {
						gsap.set(nextProjectOverlayCopyEl, { clearProps: 'transform,opacity' });
					}
				}
			})
			.to(
				nextProjectOverlayCopyEl,
				{ y: nextProjectPreviewCopyY + 72, opacity: 0, duration: 0.34, overwrite: 'auto' },
				0
			)
			.to(
				nextProjectOverlayEl,
				{
					scaleY: 0.22,
					opacity: 0,
					duration: 0.34,
					transformOrigin: '50% 100%',
					overwrite: 'auto'
				},
				0.04
			);
	}

	function resetNextProjectTrigger() {
		stopPointerDecay();
		const shouldAnimateOut =
			!nextProjectTransitionActive &&
			!nextProjectTransitionEntering &&
			nextProjectTriggerProgress > 0;
		if (nextProjectThresholdReached) {
			vibrateThreshold(false);
		}
		nextProjectThresholdReached = false;
		nextProjectTriggerProgress = 0;
		nextProjectNavigationPending = false;
		nextProjectStatusPhase = 'prompt';
		stopNextProjectStatusScramble();
		touchTrackingActive = false;
		touchStartY = null;
		touchStartProgress = 0;
		if (!nextProjectTransitionActive) {
			gsap.killTweensOf([articleEl, nextProjectOverlayEl, nextProjectOverlayCopyEl]);
			if (articleEl) gsap.set(articleEl, { clearProps: 'transform,opacity' });
			if (shouldAnimateOut) {
				startNextProjectCancelAnimation();
			} else if (!nextProjectCancelAnimating) {
				if (nextProjectOverlayEl)
					gsap.set(nextProjectOverlayEl, { clearProps: 'transform,opacity' });
				if (nextProjectOverlayCopyEl)
					gsap.set(nextProjectOverlayCopyEl, { clearProps: 'transform,opacity' });
			}
		}
	}

	function setCanvasTransitionHidden(hidden: boolean) {
		if (!browser) return;
		if (!canvasContainerEl) return;
		gsap.killTweensOf(canvasContainerEl);
		gsap.to(canvasContainerEl, {
			autoAlpha: hidden ? 0 : 1,
			duration: hidden ? 0.18 : 0.28,
			ease: hidden ? 'power2.out' : 'power2.inOut',
			overwrite: 'auto'
		});
	}

	function preventTransitionScroll(event: Event) {
		if (!transitionScrollLocked) return;
		event.preventDefault();
	}

	function preventTransitionKeyScroll(event: KeyboardEvent) {
		if (!transitionScrollLocked) return;
		if (
			event.key === 'ArrowUp' ||
			event.key === 'ArrowDown' ||
			event.key === 'PageUp' ||
			event.key === 'PageDown' ||
			event.key === 'Home' ||
			event.key === 'End' ||
			event.key === ' ' ||
			event.code === 'Space'
		) {
			event.preventDefault();
		}
	}

	function setTransitionScrollLocked(locked: boolean) {
		if (!browser || transitionScrollLocked === locked) return;
		transitionScrollLocked = locked;
		if (locked) {
			window.addEventListener('wheel', preventTransitionScroll, { passive: false });
			window.addEventListener('touchmove', preventTransitionScroll, { passive: false });
			window.addEventListener('keydown', preventTransitionKeyScroll, { passive: false });
		} else {
			window.removeEventListener('wheel', preventTransitionScroll);
			window.removeEventListener('touchmove', preventTransitionScroll);
			window.removeEventListener('keydown', preventTransitionKeyScroll);
		}
		if (locked) {
			document.documentElement.style.overflow = 'hidden';
			document.body.style.overflow = 'hidden';
		} else {
			document.documentElement.style.overflow = '';
			document.body.style.overflow = '';
		}
	}

	function clearNativeMediaFallbackHide() {
		if (!browser) return;
		if (nativeMediaFallbackHideFrame !== null) {
			window.cancelAnimationFrame(nativeMediaFallbackHideFrame);
			nativeMediaFallbackHideFrame = null;
		}
		if (nativeMediaFallbackHideTimeout !== null) {
			window.clearTimeout(nativeMediaFallbackHideTimeout);
			nativeMediaFallbackHideTimeout = null;
		}
	}

	function showNativeMediaFallback() {
		clearNativeMediaFallbackHide();
		nativeMediaFallbackVisible = true;
	}

	function beginWorkRouteReadyTracking() {
		const expectedDetailCount = (current?.content ?? []).filter(
			(item) => item?.image || item?.imageLight || item?.video
		).length;
		workRouteReadyStore.begin(page.params.slug ?? '', 1 + expectedDetailCount);
	}

	function scheduleHideNativeMediaFallback() {
		if (!browser) {
			nativeMediaFallbackVisible = false;
			return;
		}
		clearNativeMediaFallbackHide();
		const checkReady = () => {
			if (
				loadStore.cardLoading ||
				nextProjectTransitionActive ||
				nextProjectTransitionEntering ||
				workRouteReadyStore.slug !== page.params.slug ||
				!workRouteReadyStore.isReady
			) {
				nativeMediaFallbackHideFrame = window.requestAnimationFrame(checkReady);
				return;
			}
			nativeMediaFallbackHideTimeout = window.setTimeout(() => {
				nativeMediaFallbackVisible = false;
				nativeMediaFallbackHideTimeout = null;
			}, 120);
			nativeMediaFallbackHideFrame = null;
		};
		nativeMediaFallbackHideFrame = window.requestAnimationFrame(checkReady);
	}

	function scheduleScrollTriggerRefresh() {
		if (!browser || !ScrollTrigger || scrollTriggerRefreshFrame !== null) return;
		scrollTriggerRefreshFrame = window.requestAnimationFrame(() => {
			scrollTriggerRefreshFrame = null;
			ScrollTrigger?.refresh();
		});
	}

	function stopNextProjectVisualSmoothing() {
		if (!browser || nextProjectVisualProgressFrame === null) return;
		window.cancelAnimationFrame(nextProjectVisualProgressFrame);
		nextProjectVisualProgressFrame = null;
	}

	function finalizeWorkTransitionVisibility() {
		if (!browser) {
			animationStore.isTransitioning = false;
			nativeMediaFallbackVisible = false;
			return;
		}
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				setTransitionScrollLocked(false);
				animationStore.isTransitioning = false;
				scheduleHideNativeMediaFallback();
			});
		});
	}

	// const mapper = gsap.utils.mapRange(0, 300, 0, 100);
	// const mapper2 = gsap.utils.mapRange(0, 300, 88, 15);
	//
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
		current = data.projects.find((x) => x.slug.current === page.params.slug);
		if (!current) {
			goto('/404');
			throw new Error('not found');
		}
		if (typeof currIndex === 'number') countStore.inertiaIndex = currIndex;
	}

	async function triggerNextProjectNavigation() {
		if (
			nextProjectNavigationPending ||
			typeof currIndex !== 'number' ||
			typeof nextProjectIndex !== 'number'
		) {
			return;
		}
		transitionNextProjectTitle = data.projects[nextProjectIndex].title;
		transitionNextColorScale = [...nextColorScale];
		showNativeMediaFallback();
		workRouteReadyStore.reset();
		setTransitionScrollLocked(true);
		setCanvasTransitionHidden(true);
		nextProjectTransitionActive = true;
		nextProjectNavigationPending = true;
		nextProjectStatusPhase = 'prompt';
		await tick();
		await new Promise<void>((resolve) => {
			if (!articleEl || !nextProjectOverlayEl || !nextProjectOverlayCopyEl) {
				resolve();
				return;
			}
			gsap.killTweensOf([articleEl, nextProjectOverlayEl, nextProjectOverlayCopyEl]);
			gsap.set(nextProjectOverlayEl, {
				opacity: Math.max(nextProjectPreviewOpacity, 0.24),
				scaleY: nextProjectPreviewScale,
				transformOrigin: '50% 100%'
			});
			gsap.set(nextProjectOverlayCopyEl, {
				y: nextProjectPreviewCopyY,
				opacity: Math.max(nextProjectPreviewCopyOpacity, 0.72)
			});
			gsap
				.timeline({ defaults: { ease: 'power3.inOut' }, onComplete: resolve })
				.to(articleEl, { yPercent: -100, opacity: 0, duration: 2.44, ease: 'power3.in' }, 0)
				.to(nextProjectOverlayEl, { scaleY: 1, opacity: 1, duration: 2.96 }, 0)
				.to(
					nextProjectOverlayCopyEl,
					{ y: nextProjectTransitionCenterY, opacity: 1, duration: 2.96 },
					0.04
				)
				.call(
					() => {
						nextProjectStatusPhase = 'opening';
						triggerNextProjectStatusScramble();
					},
					[],
					1.72
				);
		});
		window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		updateScrollMetrics();
		nextProjectTransitionEntering = true;
		await goto(`/work/${data.projects[nextProjectIndex].slug.current}`, { noScroll: true });
	}

	function updateNextProjectTrigger(delta: number, threshold: number) {
		if (typeof currIndex !== 'number' || typeof nextProjectIndex !== 'number') return;
		const normalizedDelta = Math.sign(delta) * Math.min(Math.abs(delta), 48);
		setNextProjectTriggerProgress(
			nextProjectTriggerProgress + normalizedDelta / Math.max(threshold, 1)
		);
	}

	function getPointerTriggerDelta(event: WheelEvent) {
		const deltaLines = normalizeWheelToLines(event);
		const magnitude = Math.abs(deltaLines);
		if (magnitude < NEXT_PROJECT_POINTER_MIN_LINES) return 0;
		if (deltaLines > 0 && magnitude > NEXT_PROJECT_POINTER_MAX_TRIGGER_LINES) return 0;
		const clamped = Math.min(magnitude, NEXT_PROJECT_POINTER_MAX_TRIGGER_LINES);
		return Math.sign(deltaLines) * clamped;
	}

	function handleBottomWheel(event: WheelEvent) {
		if (page.url.pathname !== `/work/${page.params.slug}`) return;
		if (
			nextProjectNavigationPending ||
			nextProjectTransitionActive ||
			nextProjectTransitionEntering
		) {
			event.preventDefault();
			return;
		}
		if (typeof currIndex !== 'number' || typeof nextProjectIndex !== 'number') return;
		const distanceToBottom = getBottomSentinelDistance();
		if (distanceToBottom <= NEXT_PROJECT_ENGAGE_ZONE) {
			const pointerDelta = getPointerTriggerDelta(event);
			if (event.deltaY > 0) {
				event.preventDefault();
				if (pointerDelta > 0) {
					updateNextProjectTrigger(pointerDelta, NEXT_PROJECT_POINTER_THRESHOLD);
					startPointerDecay();
				}
				return;
			}
			if (event.deltaY < 0 && nextProjectTriggerProgress > 0 && pointerDelta < 0) {
				updateNextProjectTrigger(pointerDelta, NEXT_PROJECT_POINTER_THRESHOLD);
				startPointerDecay();
			}
			return;
		}
		if (distanceToBottom > NEXT_PROJECT_RESET_ZONE && nextProjectTriggerProgress > 0) {
			resetNextProjectTrigger();
		}
	}

	function handleBottomTouchStart(event: TouchEvent) {
		if (page.url.pathname !== `/work/${page.params.slug}`) return;
		if (
			nextProjectNavigationPending ||
			nextProjectTransitionActive ||
			nextProjectTransitionEntering
		) {
			event.preventDefault();
			return;
		}
		if (typeof currIndex !== 'number' || typeof nextProjectIndex !== 'number') return;
		if (getBottomSentinelDistance() > NEXT_PROJECT_ENGAGE_ZONE) {
			touchTrackingActive = false;
			return;
		}
		lastTouchY = event.touches[0]?.clientY ?? 0;
		touchStartY = lastTouchY;
		touchStartProgress = nextProjectTriggerProgress;
		touchTrackingActive = true;
	}

	function handleBottomTouchMove(event: TouchEvent) {
		if (!touchTrackingActive) return;
		if (
			nextProjectNavigationPending ||
			nextProjectTransitionActive ||
			nextProjectTransitionEntering
		) {
			event.preventDefault();
			return;
		}
		if (page.url.pathname !== `/work/${page.params.slug}`) return;
		if (typeof currIndex !== 'number' || typeof nextProjectIndex !== 'number') return;
		const currentTouchY = event.touches[0]?.clientY ?? lastTouchY;
		const originY = touchStartY ?? currentTouchY;
		const deltaFromOrigin = originY - currentTouchY;
		const nextProgress =
			touchStartProgress + deltaFromOrigin / Math.max(NEXT_PROJECT_TOUCH_THRESHOLD, 1);
		lastTouchY = currentTouchY;
		if (deltaFromOrigin < 0 && nextProgress <= 0) {
			touchTrackingActive = false;
			touchStartY = currentTouchY;
			touchStartProgress = 0;
			setNextProjectTriggerProgress(0, false);
			return;
		}
		event.preventDefault();
		setNextProjectTriggerProgress(nextProgress, false);
	}

	function handleBottomTouchEnd() {
		touchTrackingActive = false;
		touchStartY = null;
		touchStartProgress = nextProjectTriggerProgress;
		if (!nextProjectNavigationPending && nextProjectTriggerProgress >= 1) {
			void triggerNextProjectNavigation();
			return;
		}
		if (!nextProjectNavigationPending && nextProjectTriggerProgress < 1) {
			setNextProjectTriggerProgress(0);
		}
	}

	let delay = $state(false);

	afterNavigate(({ to }) => {
		if (to?.url.pathname.includes('work')) {
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		}
		updateCurrent();
		beginWorkRouteReadyTracking();
		showNativeMediaFallback();
		if (nextProjectTransitionEntering) {
			nextProjectStatusPhase = 'opening';
			stopNextProjectStatusScramble();
			void (async () => {
				updateScrollMetrics();
				await tick();
				scheduleScrollTriggerRefresh();
				if (!articleEl || !nextProjectOverlayEl || !nextProjectOverlayCopyEl) {
					nextProjectTransitionActive = false;
					nextProjectTransitionEntering = false;
					transitionNextProjectTitle = '';
					transitionNextColorScale = [];
					animateIn();
					return;
				}
				gsap.killTweensOf([articleEl, nextProjectOverlayEl, nextProjectOverlayCopyEl]);
				gsap.set(articleEl, { yPercent: 100, opacity: 0 });
				gsap.set(nextProjectOverlayEl, {
					opacity: 1,
					scaleY: 1,
					transformOrigin: '50% 100%'
				});
				gsap.set(nextProjectOverlayCopyEl, { y: nextProjectTransitionCenterY, opacity: 1 });
				gsap
					.timeline({ defaults: { ease: 'power3.out' } })
					.to(articleEl, { yPercent: 0, opacity: 1, duration: 2.56 }, 1.72)
					.to(
						nextProjectOverlayCopyEl,
						{ y: nextProjectTransitionCenterY - 72, opacity: 0, duration: 1.08 },
						0.72
					)
					.to(
						nextProjectOverlayEl,
						{
							opacity: 0,
							scaleY: 1.02,
							duration: 1.68,
							onComplete: () => {
								setCanvasTransitionHidden(false);
								finalizeWorkTransitionVisibility();
								nextProjectTransitionActive = false;
								nextProjectTransitionEntering = false;
								transitionNextProjectTitle = '';
								transitionNextColorScale = [];
								animateIn();
							}
						},
						1.08
					);
			})();
		} else {
			nextProjectStatusPhase = 'prompt';
			stopNextProjectStatusScramble();
			setCanvasTransitionHidden(false);
			animationStore.isTransitioning = false;
			scheduleHideNativeMediaFallback();
			animateIn();
		}
		setTimeout(() => (delay = false), 3000);
	});

	const base = $derived(optionsStore.dark ? '#000000' : '#ffffff');
	const currIndex = $derived(current ? data.projects.map((x) => x._id).indexOf(current._id) : null);
	const nextProjectIndex = $derived.by(() => {
		if (typeof currIndex !== 'number' || data.projects.length <= 2) {
			return data.projects.length > 1 ? 1 : null;
		}
		const firstProjectIndex = 1;
		const lastProjectIndex = data.projects.length - 1;
		if (currIndex < firstProjectIndex || currIndex >= lastProjectIndex) return firstProjectIndex;
		return currIndex + 1;
	});
	const inputColor = $derived(current ? current.color.hex : base);
	const nextInputColor = $derived(
		typeof nextProjectIndex === 'number' && data.projects[nextProjectIndex]?.color
			? data.projects[nextProjectIndex].color.hex
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
	const heroMediaUrl = $derived(
		current ? withSanityImageParams(current.thumbnail?.asset?.url) : ''
	);
	const heroLightImageUrl = $derived(
		current ? withSanityImageParams(current.thumbnailImage?.asset?.url) : ''
	);
	const heroHasVideo = $derived(/\.(mp4|webm)$/i.test(heroMediaUrl));
	const heroImage = $derived(
		heroMediaUrl && !heroHasVideo
			? {
					_id: current?._id ?? 'hero-image',
					originalFilename: current?.thumbnail?.asset?.originalFilename ?? '',
					size: current?.thumbnail?.asset?.size ?? 0,
					url: heroMediaUrl
				}
			: undefined
	);
	const heroImageLight = $derived(
		heroLightImageUrl
			? {
					_id: `${current?._id ?? 'hero-image'}-light`,
					originalFilename: current?.thumbnailImage?.asset?.originalFilename ?? '',
					size: current?.thumbnailImage?.asset?.size ?? 0,
					url: heroLightImageUrl
				}
			: undefined
	);
	const heroVideo = $derived(
		heroHasVideo
			? {
					_id: current?._id ?? 'hero-video',
					originalFilename: current?.thumbnail?.asset?.originalFilename ?? '',
					size: current?.thumbnail?.asset?.size ?? 0,
					url: heroMediaUrl
				}
			: undefined
	);

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (!page.url.pathname.includes('work')) return;
			requestAnimationFrame(() => {
				updateScrollMetrics();
			});
		});
	});

	onMount(() => {
		let cleanup: (() => void) | undefined;

		void (async () => {
			if (!browser) return;
			const scrollTriggerModule = await import('gsap/ScrollTrigger');
			ScrollTrigger = scrollTriggerModule.ScrollTrigger;
			gsap.registerPlugin(ScrollTrigger);
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
			animateIn();
			updateCurrent();
			updateScrollMetrics();
			await tick();
			updateScrollMetrics();
			window.addEventListener('wheel', handleBottomWheel, { passive: false });
			window.addEventListener('touchstart', handleBottomTouchStart, { passive: true });
			window.addEventListener('touchmove', handleBottomTouchMove, { passive: false });
			window.addEventListener('touchend', handleBottomTouchEnd, { passive: true });
			window.addEventListener('resize', updateScrollMetrics, { passive: true });
			canvasContainerEl = document.querySelector('.canvas-container') as HTMLElement | null;
			beginWorkRouteReadyTracking();
			showNativeMediaFallback();
			animationStore.isTransitioning = false;
			scheduleHideNativeMediaFallback();
			scheduleScrollTriggerRefresh();
			requestAnimationFrame(() => {
				const projectListTargets = gsap.utils.toArray<HTMLElement>('ul > li > *');
				if (!projectListTargets.length) return;
				tl.to(projectListTargets, {
					scrollTrigger: {
						id: 'trigger1',
						trigger: 'section:first-child',
						start: 'bottom bottom',
						end: 'bottom top',
						scrub: 1
					},
					stagger: 0.1,
					y: -300
				});
			});

			cleanup = () => {
				window.removeEventListener('wheel', handleBottomWheel);
				window.removeEventListener('touchstart', handleBottomTouchStart);
				window.removeEventListener('touchmove', handleBottomTouchMove);
				window.removeEventListener('touchend', handleBottomTouchEnd);
				window.removeEventListener('resize', updateScrollMetrics);
				clearNativeMediaFallbackHide();
				clearNextProjectStatusScrambleTimeout();
				setTransitionScrollLocked(false);
				if (scrollTriggerRefreshFrame !== null) {
					window.cancelAnimationFrame(scrollTriggerRefreshFrame);
					scrollTriggerRefreshFrame = null;
				}
				stopNextProjectVisualSmoothing();
				workRouteReadyStore.reset();
			};
		})();

		return () => {
			clearNextProjectStatusScrambleTimeout();
			setTransitionScrollLocked(false);
			setCanvasTransitionHidden(false);
			cleanup?.();
		};
	});

	const progress = $derived(
		gsap.utils.mapRange(0, scrollHeight, 0, innerHeight, scrollStore.scroll)
	);
	const nextProjectRevealProgress = $derived.by(() => {
		if (!Number.isFinite(bottomSentinelDistance)) return 0;
		return Math.min(
			1,
			Math.max(0, (NEXT_PROJECT_RESET_ZONE - bottomSentinelDistance) / NEXT_PROJECT_RESET_ZONE)
		);
	});
	const nextProjectVisualProgress = $derived.by(() => {
		const quarticReveal =
			nextProjectRevealProgress > 0 ? 1 - Math.pow(1 - nextProjectRevealProgress, 4) : 0;
		const revealLead = quarticReveal > 0 ? 0.5 + quarticReveal * 0.42 : 0;
		return Math.max(revealLead, nextProjectTriggerProgress);
	});
	$effect(() => {
		nextProjectVisualProgress;
		untrack(() => {
			if (!browser) {
				nextProjectVisualProgressAnimated = nextProjectVisualProgress;
				return;
			}
			if (nextProjectVisualProgressFrame !== null) return;
			const step = () => {
				const delta = nextProjectVisualProgress - nextProjectVisualProgressAnimated;
				if (Math.abs(delta) < 0.002) {
					nextProjectVisualProgressAnimated = nextProjectVisualProgress;
					nextProjectVisualProgressFrame = null;
					return;
				}
				nextProjectVisualProgressAnimated += delta * 0.24;
				nextProjectVisualProgressFrame = window.requestAnimationFrame(step);
			};
			nextProjectVisualProgressFrame = window.requestAnimationFrame(step);
		});
	});
	const nextProjectOverlayOpacity = $derived(
		nextProjectVisualProgressAnimated > 0 ? 0.42 + nextProjectVisualProgressAnimated * 0.5 : 0
	);
	const nextProjectOverlayScaleY = $derived(Math.max(0.34, nextProjectVisualProgressAnimated));
	const nextProjectCopyOpacity = $derived(
		nextProjectTransitionActive ? 1 : Math.min(1, 0.5 + nextProjectVisualProgressAnimated * 0.7)
	);
	const nextProjectCopyY = $derived(Math.round(44 - nextProjectVisualProgressAnimated * 104));
	const nextProjectTransitionCenterY = $derived(-Math.round(innerHeight * 0.28));
	const nextProjectStatusText = $derived.by(() => {
		if (nextProjectStatusPhase === 'opening') return 'Opening Project';
		return 'Scroll To View Next Project';
	});
	const displayedNextProjectTitle = $derived(
		transitionNextProjectTitle ||
			(typeof nextProjectIndex === 'number' && data.projects[nextProjectIndex]
				? data.projects[nextProjectIndex].title
				: '')
	);
	const displayedNextColorScale = $derived(
		nextProjectTransitionActive && transitionNextColorScale.length
			? transitionNextColorScale
			: nextColorScale
	);
	const showNextProjectOverlay = $derived(
		typeof currIndex === 'number' &&
			typeof nextProjectIndex === 'number' &&
			(nextProjectVisualProgress > 0 || nextProjectTransitionActive || nextProjectCancelAnimating)
	);

	$effect(() => {
		nextProjectOverlayEl;
		nextProjectOverlayCopyEl;
		nextProjectOverlayScaleY;
		nextProjectOverlayOpacity;
		nextProjectCopyOpacity;
		nextProjectCopyY;
		nextProjectTransitionActive;
		untrack(() => {
			if (
				!nextProjectOverlayEl ||
				!nextProjectOverlayCopyEl ||
				nextProjectTransitionActive ||
				nextProjectCancelAnimating
			) {
				return;
			}
			nextProjectPreviewScale = nextProjectOverlayScaleY;
			nextProjectPreviewOpacity = nextProjectOverlayOpacity;
			nextProjectPreviewCopyY = nextProjectCopyY;
			nextProjectPreviewCopyOpacity = nextProjectCopyOpacity;
			gsap.to(nextProjectOverlayEl, {
				scaleY: nextProjectOverlayScaleY,
				opacity: nextProjectOverlayOpacity,
				duration: 0.16,
				ease: 'power2.out',
				transformOrigin: '50% 100%',
				overwrite: 'auto'
			});
			gsap.to(nextProjectOverlayCopyEl, {
				y: nextProjectCopyY,
				opacity: nextProjectCopyOpacity,
				duration: 0.18,
				ease: 'power2.out',
				overwrite: 'auto'
			});
		});
	});

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
			if (bottomSentinelDistance > NEXT_PROJECT_RESET_ZONE && nextProjectTriggerProgress > 0) {
				resetNextProjectTrigger();
			}
		});
	});

	$effect(() => {
		$cardDimensionsStore;
		current?._id;
		untrack(() => {
			if (!browser || !page.url.pathname.includes('work')) return;
			requestAnimationFrame(() => updateScrollMetrics());
		});
	});

	// Clear shared-transition suppression flag once the hero card has settled
	$effect(() => {
		const currentSlug = page.params.slug ?? '';
		const ready = workRouteReadyStore.hasKey(currentSlug, `${currentSlug}:0`);
		untrack(() => {
			if (ready && suppressHeroFallbackDuringHandoff) {
				suppressHeroFallbackDuringHandoff = false;
			}
		});
	});

	function animateIn() {
		updateScrollMetrics();
		resetNextProjectTrigger();

		gsap.to('.gradient-top', {
			opacity: 1,
			delay: 1
		});
		gsap.to('.gradient-top', {
			opacity: 0,
			delay: 4,
			onComplete: () => {
				animating = false;
			}
		});
	}

	beforeNavigate(({ to }) => {
		if (!nextProjectNavigationPending) {
			resetNextProjectTrigger();
		}
		if (to?.url.pathname === '/' && typeof currIndex === 'number') {
			animationStore.isTransitioning = true;
			homeTransitionStore.requestHomeReturn(currIndex);
		} else if (!nextProjectNavigationPending) {
			scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		}
		tl.time(0).kill();
		const trigger1 = ScrollTrigger?.getById('trigger1');
		if (trigger1) trigger1.kill(true);
	});
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
	bind:this={articleEl}
	class="relative overflow-hidden self-start w-full transition-opacity duration-300"
	class:opacity-0={optionsStore.fullscreen ||
		gptStore.opened ||
		(animationStore.isTransitioning &&
			!nextProjectTransitionActive &&
			!nextProjectTransitionEntering)}
>
	{#if current && typeof currIndex === 'number'}
		{@const currentSlug = page.params.slug ?? ''}
		{@const heroFallbackVisible =
			nativeMediaFallbackVisible &&
			!workRouteReadyStore.hasKey(currentSlug, `${currentSlug}:0`) &&
			!suppressHeroFallbackDuringHandoff}
		<Section
			heading={data.projects[currIndex].title}
			index={0}
			image={heroImage}
			imageLight={heroImageLight}
			video={heroVideo}
			forceVisibleMedia={heroFallbackVisible}
			awardsItem={current}
		/>
		{#each current.content as item, index}
			{#if data.projects && data.projects[currIndex] && data.projects[currIndex].content && data.projects[currIndex].content[index]}
				<!-- Calculate imageWidth and imageHeight inside the block -->
				{@const contentItem = data.projects[currIndex].content[index]}
				{@const detailFallbackVisible =
					nativeMediaFallbackVisible &&
					!workRouteReadyStore.hasKey(currentSlug, `${currentSlug}:${index + 1}`)}
				{@const imageWidth = $cardDimensionsStore[index]?.width ?? 0}
				{@const imageHeight = $cardDimensionsStore[index]?.height ?? 0}
				{@const maxSize = Math.min(innerWidth * 0.6, 600)}
				<Section
					index={index + 1}
					body={item.body}
					heading={item.headline}
					bottom={item.caption}
					image={contentItem.image}
					video={contentItem.video}
					imageLight={contentItem.imageLight}
					imageCaption={contentItem.caption}
					forceVisibleMedia={detailFallbackVisible}
					{imageWidth}
					{imageHeight}
					{maxSize}
				/>
			{/if}
		{/each}
	{/if}
	<div bind:this={bottomSentinelEl} class="h-0 w-full pointer-events-none"></div>
</article>

{#if showNextProjectOverlay}
	<aside
		class="fixed left-0 bottom-0 h-[100dvh] w-full gradient dark:invert-0 invert pointer-events-none"
		class:z-40={!nextProjectTransitionActive}
		class:z-50={nextProjectTransitionActive}
	>
		<div
			bind:this={nextProjectOverlayEl}
			style={`background-color: ${base};
				background-image: radial-gradient(at 25% 0%, ${base} 0, transparent 30%),
				radial-gradient(at 75% 0%, ${base} 0, transparent 75%),
				radial-gradient(at 51.94% 0%, ${displayedNextColorScale[2]} 0, transparent 100%),
				radial-gradient(at 87.56% 50%, ${displayedNextColorScale[1]} 0, transparent 30%),
				radial-gradient(at 15% 88%, ${displayedNextColorScale[0]} 0, transparent 30%);
				transform-origin: 50% 100%;
				transform: scaleY(0.34);
				opacity: 0;
				will-change: transform, opacity;
				mask-image: linear-gradient(to bottom, transparent 0%, white ${nextProjectTransitionActive ? '3%' : '20%'}, white 100%);
				-webkit-mask-image: linear-gradient(to bottom, transparent 0%, white ${nextProjectTransitionActive ? '3%' : '20%'}, white 100%);`}
			class="absolute inset-0"
		></div>
		<div
			bind:this={nextProjectOverlayCopyEl}
			class="absolute inset-x-0 bottom-0 z-10 px-6 pb-[max(10rem,18vh)] text-center"
			style={`transform: translateY(40px); opacity: 0; will-change: transform, opacity; padding-bottom: max(10rem,18vh);`}
		>
			<div
				class="flex items-center justify-center text-white mix-blend-difference font-mono uppercase text-xs gap-5 min-h-[1rem]"
				style="text-shadow: 0 0 24px rgba(0, 0, 0, 0.18);"
			>
				<p class="text-base">&gt;</p>
				<div class="inline-grid grid-cols-[minmax(0,max-content)] grid-rows-1 items-center">
					<ScrambleText
						text={nextProjectStatusText}
						reserveText="Scroll To View Next Project"
						active={nextProjectStatusScrambleActive}
						durationMs={680}
					/>
				</div>
				<p class="text-base">&gt;</p>
			</div>
			<h4
				class="text-4xl md:text-6xl font-bold text-white mix-blend-difference"
				style="text-shadow: 0 0 28px rgba(0, 0, 0, 0.2);"
			>
				{displayedNextProjectTitle}
			</h4>
		</div>
	</aside>
{/if}

<svelte:window bind:innerWidth bind:innerHeight />
