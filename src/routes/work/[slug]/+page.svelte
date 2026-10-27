<script lang="ts">
	import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
	import { page } from '$app/state';
	import {
		animationStore,
		countStore,
		gptStore,
		homeTransitionStore,
		loadStore,
		sharedCardTransitionStore,
		workRouteReadyStore
	} from '#lib/stores/index.svelte.js';
	import Section from '#lib/components/Section.svelte';
	import ScrambleText from '#lib/components/ScrambleText.svelte';
	import { gsap } from 'gsap';
	import { onMount, tick, untrack } from 'svelte';
	import { type PageData } from './$types';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { viewerStore, type ViewerMedia } from '#lib/stores/viewer.svelte.js';
	import type { Post } from '#lib/types/index.js';
	import caret from '#lib/images/caret.svg';
	import chroma from 'chroma-js';
	import { browser } from '$app/env';
	import type { ScrollTrigger as ScrollTriggerInstance } from 'gsap/ScrollTrigger';

	const { data }: { data: Required<PageData> } = $props();

	let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null;
	const tl = gsap.timeline();
	let innerWidth = $state(0);
	let articleEl = $state<HTMLElement | null>(null);
	let canvasContainerEl: HTMLElement | null = null;
	let current = $state() as Post | undefined;

	// Hero card handoff + native media fallback
	let nativeMediaFallbackVisible = $state(false);
	let nativeMediaFallbackHideFrame: number | null = null;
	let nativeMediaFallbackHideTimeout: number | null = null;
	const _initPendingTransition = browser ? sharedCardTransitionStore.value : null;
	let suppressHeroFallbackDuringHandoff = $state(
		_initPendingTransition?.direction === 'to-work' &&
			_initPendingTransition?.slug === page.params.slug
	);

	// Native media opens in the shared viewer (see MediaViewer.svelte)

	// Next project pull gesture. Plain variables: updated per frame without reactivity.
	let nextTransitionActive = $state(false);
	let frozenNextTitle = $state('');
	let frozenNextColors = $state<string[]>([]);
	let overlayEl: HTMLElement | undefined = $state();
	let panelEl: HTMLElement | undefined = $state();
	let labelText = $state('Scroll to view next project');
	let labelScramble = $state(false);
	let progressBarEl: HTMLElement | undefined = $state();
	let caretEl: HTMLElement | undefined = $state();
	let scrollLocked = false;
	let enteringNext = false;
	let navigatingNext = false;

	const WHEEL_PULL_DISTANCE = 1500;
	const TOUCH_PULL_DISTANCE = 420;
	const BOTTOM_EPSILON = 6;
	const WHEEL_ARM_GAP_MS = 180;
	const SLOW_SCROLL_PEAK = 70;
	const SLOW_SCROLL_WINDOW_MS = 600;
	const WHEEL_IDLE_RESET_MS = 700;
	const MAX_TOUCH_ARM_SPEED = 1.5;

	let docHeight = 0;
	let pull = 0;
	let pullShown = 0;
	let pullArmed = false;
	let wheelArmed = false;
	let lastWheelAt = 0;
	let wheelHistory: { t: number; d: number }[] = [];
	let textEl: HTMLElement | undefined = $state();
	const textState = { y: 60 };
	let touchActive = false;
	let touchOriginY = NaN;
	let touchLastY = 0;
	let touchLastT = 0;
	let lastScrollY = -1;
	let isTouchDevice = false;
	let bendEls: { el: HTMLElement; top: number; left: number; h: number }[] = [];
	let bend = 0;
	let bendApplied = false;
	let lastBendY = -1;
	// 1 = sheet parked below the screen, 0 = covering it, -1 = parked above
	const sheet = { offset: 1 };

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

	function getScrollTop() {
		return window.scrollY;
	}

	function measureDocument() {
		const root = document.scrollingElement ?? document.documentElement;
		docHeight = Math.max(root?.scrollHeight ?? 0, document.documentElement.scrollHeight);
		// Layout positions come from offsetTop so transforms already applied don't feed back.
		bendEls = articleEl
			? Array.from(articleEl.querySelectorAll<HTMLElement>('section > div')).map((el) => {
					let top = 0;
					let left = 0;
					let node: HTMLElement | null = el;
					while (node) {
						top += node.offsetTop;
						left += node.offsetLeft;
						node = node.offsetParent as HTMLElement | null;
					}
					return { el, top, left, h: el.offsetHeight };
				})
			: [];
	}

	function getMediaEls() {
		return articleEl
			? Array.from(
					articleEl.querySelectorAll<HTMLElement>('img[id^="media-"], video[id^="media-"]')
				)
			: [];
	}

	function distanceToBottom() {
		return docHeight - (getScrollTop() + window.innerHeight);
	}

	/* ---------- native media fallback ---------- */

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
		// Only the hero is a WebGL card; detail media is native.
		workRouteReadyStore.begin(page.params.slug ?? '', 1);
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
				nextTransitionActive ||
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

	function setCanvasTransitionHidden(hidden: boolean) {
		if (!browser || !canvasContainerEl) return;
		gsap.killTweensOf(canvasContainerEl);
		gsap.to(canvasContainerEl, {
			autoAlpha: hidden ? 0 : 1,
			duration: hidden ? 0.18 : 0.28,
			ease: hidden ? 'power2.out' : 'power2.inOut',
			overwrite: 'auto'
		});
	}

	/* ---------- scroll lock during project change ---------- */

	function preventScroll(event: Event) {
		if (event.cancelable) event.preventDefault();
	}

	function preventKeyScroll(event: KeyboardEvent) {
		if (
			['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key) ||
			event.code === 'Space'
		) {
			event.preventDefault();
		}
	}

	function setScrollLocked(locked: boolean) {
		if (!browser || scrollLocked === locked) return;
		scrollLocked = locked;
		if (locked) {
			window.addEventListener('wheel', preventScroll, { passive: false });
			window.addEventListener('touchmove', preventScroll, { passive: false });
			window.addEventListener('keydown', preventKeyScroll, { passive: false });
			document.body.style.overflow = 'hidden';
		} else {
			window.removeEventListener('wheel', preventScroll);
			window.removeEventListener('touchmove', preventScroll);
			window.removeEventListener('keydown', preventKeyScroll);
			document.body.style.overflow = '';
		}
	}

	function finalizeWorkTransitionVisibility() {
		requestAnimationFrame(() => {
			requestAnimationFrame(() => {
				setScrollLocked(false);
				animationStore.isTransitioning = false;
				scheduleHideNativeMediaFallback();
			});
		});
	}

	/* ---------- media viewer ---------- */

	function describeMedia(el: HTMLElement): ViewerMedia {
		const isVideo = el instanceof HTMLVideoElement;
		const img = el as HTMLImageElement;
		const ratio = isVideo
			? el.videoWidth && el.videoHeight
				? el.videoWidth / el.videoHeight
				: undefined
			: img.naturalWidth && img.naturalHeight
				? img.naturalWidth / img.naturalHeight
				: undefined;
		return {
			id: el.id,
			url: (isVideo ? el.currentSrc || el.src : img.currentSrc) || img.src,
			isVideo,
			alt: img.alt ?? '',
			lqip: el.dataset.lqip || undefined,
			ratio,
			rect: () => el.getBoundingClientRect(),
			hide: (hidden) => (el.style.visibility = hidden ? 'hidden' : ''),
			ensureVisible: () => {
				const r = el.getBoundingClientRect();
				if (r.bottom < 0 || r.top > window.innerHeight) {
					window.scrollTo({
						top: window.scrollY + r.top - window.innerHeight / 2 + r.height / 2,
						behavior: 'auto'
					});
				}
			}
		};
	}

	function openViewer(el: HTMLElement) {
		viewerStore.open(describeMedia(el), () => getMediaEls().map(describeMedia));
	}

	/* ---------- derived project data ---------- */

	function updateCurrent() {
		current = data.projects.find((x) => x.slug.current === page.params.slug);
		if (!current) {
			goto('/404');
			throw new Error('not found');
		}
		if (typeof currIndex === 'number') countStore.inertiaIndex = currIndex;
	}

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

	const displayedNextTitle = $derived(
		frozenNextTitle ||
			(typeof nextProjectIndex === 'number' ? (data.projects[nextProjectIndex]?.title ?? '') : '')
	);
	const displayedNextColors = $derived(
		nextTransitionActive && frozenNextColors.length ? frozenNextColors : nextColorScale
	);

	// Overlay content renders un-inverted in both themes, so pick text by the gradient's own lightness.
	const textColor = $derived.by(() => {
		const colors = [base, base, ...displayedNextColors];
		const lum = colors.reduce((sum, c) => sum + chroma(c).luminance(), 0) / colors.length;
		return lum > 0.5 ? '#000' : '#fff';
	});

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

	/* ---------- next project pull gesture ---------- */

	function isWorkRoute() {
		return page.url.pathname === `/work/${page.params.slug}`;
	}

	function canPull() {
		return (
			!navigatingNext &&
			!viewerStore.active &&
			!gptStore.opened &&
			!optionsStore.fullscreen &&
			typeof nextProjectIndex === 'number'
		);
	}

	function normalizeWheel(event: WheelEvent) {
		if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) return event.deltaY * 17;
		if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) return event.deltaY * 53;
		return event.deltaY;
	}

	function onWheel(event: WheelEvent) {
		if (!isWorkRoute()) return;
		if (navigatingNext) {
			event.preventDefault();
			return;
		}
		if (!canPull()) return;
		const now = performance.now();
		const gap = now - lastWheelAt;
		lastWheelAt = now;
		const delta = normalizeWheel(event);
		wheelHistory.push({ t: now, d: Math.abs(delta) });
		wheelHistory = wheelHistory.filter((h) => now - h.t <= SLOW_SCROLL_WINDOW_MS);
		if (distanceToBottom() > BOTTOM_EPSILON) {
			pull = 0;
			wheelArmed = false;
			return;
		}
		if (delta < 0) {
			if (pull > 0) {
				event.preventDefault();
				pull = Math.max(0, pull + delta / WHEEL_PULL_DISTANCE);
			}
			wheelArmed = pull > 0;
			return;
		}
		// A fresh gesture, or a slow scroll arriving at the bottom, may pull. A fast scroll
		// (large recent deltas, back-to-back events) landing on the bottom must not trigger.
		if (!wheelArmed) {
			const peak = Math.max(...wheelHistory.map((h) => h.d));
			if (gap <= WHEEL_ARM_GAP_MS && peak > SLOW_SCROLL_PEAK) return;
			wheelArmed = true;
		}
		event.preventDefault();
		pull += Math.min(delta, 60) / WHEEL_PULL_DISTANCE;
		if (pull >= 1) void triggerNextProject();
	}

	function onTouchStart(event: TouchEvent) {
		if (!isWorkRoute()) return;
		if (navigatingNext) {
			event.preventDefault();
			return;
		}
		touchActive = true;
		touchOriginY = NaN;
		touchLastY = event.touches[0]?.clientY ?? 0;
		touchLastT = performance.now();
	}

	function onTouchMove(event: TouchEvent) {
		if (!touchActive || !isWorkRoute()) return;
		if (navigatingNext) {
			event.preventDefault();
			return;
		}
		if (!canPull()) return;
		const y = event.touches[0]?.clientY ?? touchLastY;
		const now = performance.now();
		const speed = Math.abs(y - touchLastY) / Math.max(now - touchLastT, 1);
		touchLastY = y;
		touchLastT = now;
		if (distanceToBottom() > BOTTOM_EPSILON) {
			touchOriginY = NaN;
			pull = 0;
			return;
		}
		if (Number.isNaN(touchOriginY)) {
			// A fast flick that merely reaches the bottom must not start a pull.
			if (speed > MAX_TOUCH_ARM_SPEED) return;
			touchOriginY = y;
		}
		const dragged = touchOriginY - y;
		if (dragged <= 0) {
			pull = 0;
			touchOriginY = y;
			return;
		}
		if (event.cancelable) event.preventDefault();
		pull = Math.min(1.25, dragged / TOUCH_PULL_DISTANCE);
	}

	function onTouchEnd() {
		if (!touchActive) return;
		touchActive = false;
		touchOriginY = NaN;
		if (navigatingNext) return;
		if (pull >= 1) {
			void triggerNextProject();
		} else {
			pull = 0;
		}
	}

	function renderText(y: number) {
		if (textEl) textEl.style.transform = `translate3d(0, ${y}vh, 0)`;
	}

	// The text slides in over the first half of the pull, then stays put.
	function textYForPull(p: number) {
		return (1 - Math.min(1, Math.max(0, p * 2))) * 60;
	}

	function renderSheet(offset: number) {
		if (!overlayEl || !panelEl) return;
		overlayEl.style.display = Math.abs(offset) >= 0.999 ? 'none' : '';
		panelEl.style.transform = `translate3d(0, ${offset * 120}vh, 0)`;
	}

	function renderPull() {
		if (navigatingNext) return;
		renderSheet(1 - Math.min(1, Math.max(0, pullShown)));
		textState.y = textYForPull(pullShown);
		renderText(textState.y);
		const armed = pull >= 1;
		if (armed !== pullArmed) {
			pullArmed = armed;
			if (armed && isTouchDevice) navigator.vibrate?.(12);
			labelText = armed
				? isTouchDevice
					? 'Release to open next project'
					: 'Opening next project'
				: idleLabel();
		}
	}

	function idleLabel() {
		return isTouchDevice ? 'Pull up for next project' : 'Scroll to view next project';
	}

	// The page is rolled into one cylinder seen from inside. Its radius shrinks as scroll speed
	// rises. Each element's top and bottom edge are placed on the cylinder and the element is
	// stretched between them, so neighbours stay joined and share one vanishing point.
	function clearBend() {
		for (const item of bendEls) {
			item.el.style.transform = '';
			item.el.style.transformOrigin = '';
		}
	}

	function applyBend(velocity: number, dt: number) {
		// Too heavy to look smooth on touch devices.
		if (isTouchDevice) return;
		const target = Math.min(1, Math.abs(velocity) / 1400);
		bend += (target - bend) * Math.min(1, dt * 10);
		if (bend < 0.01) {
			if (bendApplied) {
				clearBend();
				bendApplied = false;
			}
			return;
		}
		const vh = window.innerHeight;
		const vw = window.innerWidth;
		const scrollY = window.scrollY;
		const radius = (vh * 1.1) / bend;
		const reach = Math.min(radius * 1.2, vh * 2);
		const persp = radius * 1.6;
		const clampS = (s: number) => Math.max(-reach, Math.min(reach, s));
		const surfaceY = (s: number) => radius * Math.sin(clampS(s) / radius);
		const surfaceZ = (s: number) => radius * (1 - Math.cos(clampS(s) / radius));
		for (const { el, top, left, h } of bendEls) {
			const a1 = top - scrollY - vh / 2;
			const a2 = a1 + h;
			if (a2 < -vh * 0.75 || a1 > vh * 0.75) {
				el.style.transform = '';
				continue;
			}
			const dy = (surfaceY(a2) - surfaceY(a1)) / h;
			const dz = (surfaceZ(a2) - surfaceZ(a1)) / h;
			const ty = surfaceY(a1) - a1 * dy;
			const tz = surfaceZ(a1) - a1 * dz;
			// Origin sits on the viewport centre so every element shares one vanishing point.
			el.style.transformOrigin = `${vw / 2 - left}px ${-a1}px`;
			el.style.transform = `perspective(${persp}px) matrix3d(1,0,0,0, 0,${dy},${dz},0, 0,0,1,0, 0,${ty},${tz},1)`;
		}
		bendApplied = true;
	}

	function renderScrollIndicator(y: number) {
		if (!progressBarEl || !caretEl) return;
		const max = Math.max(1, docHeight - window.innerHeight);
		const p = Math.min(1, Math.max(0, y / max));
		progressBarEl.style.transform = `scaleY(${p})`;
		caretEl.style.transform = `translate3d(0, ${p * window.innerHeight - 20}px, 0) rotate(${
			y < lastScrollY ? 180 : 0
		}deg)`;
	}

	function frameTick(_time: number, deltaTime: number) {
		if (!isWorkRoute()) return;
		const y = getScrollTop();
		const dt = Math.min(deltaTime, 64) / 1000;
		if (y !== lastScrollY) {
			renderScrollIndicator(y);
			lastScrollY = y;
		}
		const velocity = lastBendY < 0 ? 0 : (y - lastBendY) / Math.max(dt, 0.001);
		lastBendY = y;
		applyBend(velocity, dt);
		if (
			!touchActive &&
			!navigatingNext &&
			pull > 0 &&
			performance.now() - lastWheelAt > WHEEL_IDLE_RESET_MS
		) {
			pull = Math.max(0, pull - dt * 1.6);
			if (pull === 0) wheelArmed = false;
		}
		const diff = pull - pullShown;
		if (Math.abs(diff) > 0.001) {
			pullShown += diff * Math.min(1, dt * 14);
			renderPull();
		} else if (pullShown !== pull) {
			pullShown = pull;
			renderPull();
		}
	}

	function wait(ms: number) {
		return new Promise<void>((resolve) => setTimeout(resolve, ms));
	}

	async function triggerNextProject() {
		if (navigatingNext || typeof nextProjectIndex !== 'number') return;
		const target = data.projects[nextProjectIndex];
		navigatingNext = true;
		frozenNextTitle = target.title;
		frozenNextColors = [...nextColorScale];
		nextTransitionActive = true;
		showNativeMediaFallback();
		setScrollLocked(true);
		// Hide the canvas first so the old hero card can't re-appear when readiness resets.
		setCanvasTransitionHidden(true);
		const sheetTo = (offset: number, duration: number) =>
			gsap.to(sheet, {
				offset,
				duration,
				ease: 'power3.inOut',
				onUpdate: () => renderSheet(sheet.offset)
			});

		// 1. gradient slides in over the page, the text moves to the centre, the project lifts away
		sheet.offset = 1 - Math.min(1, pullShown);
		textState.y = textYForPull(pullShown);
		gsap.killTweensOf(sheet);
		gsap.killTweensOf(textState);
		const textTo = (y: number, duration: number) =>
			gsap.to(textState, {
				y,
				duration,
				ease: 'power3.inOut',
				onUpdate: () => renderText(textState.y)
			});
		if (articleEl) {
			gsap.to(articleEl, { y: '-25vh', opacity: 0, duration: 0.8, ease: 'power2.in' });
		}
		void textTo(-30, 0.8);
		await sheetTo(0, 0.8);

		// 2. label scrambles to "Opening project" and the next page loads behind the cover
		workRouteReadyStore.reset();
		labelText = 'Opening project';
		labelScramble = true;
		window.setTimeout(() => (labelScramble = false), 720);
		enteringNext = true;
		await Promise.all([goto(`/work/${target.slug.current}`, { reset: false }), wait(1500)]);
		await tick();
		window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		lastBendY = -1;
		bend = 0;
		measureDocument();

		// 3. cover and text slide up and away while the next project rises in from below
		if (articleEl) {
			gsap.fromTo(
				articleEl,
				{ y: '100vh', opacity: 1 },
				{ y: 0, duration: 1.1, ease: 'power3.inOut', clearProps: 'transform,opacity' }
			);
		}
		void textTo(-150, 1.1);
		await sheetTo(-1, 1.1);

		sheet.offset = 1;
		renderSheet(1);
		textState.y = 60;
		renderText(60);
		pull = 0;
		pullShown = 0;
		pullArmed = false;
		wheelArmed = false;
		labelText = idleLabel();
		nextTransitionActive = false;
		frozenNextTitle = '';
		frozenNextColors = [];
		enteringNext = false;
		navigatingNext = false;
		lastWheelAt = performance.now();
		finalizeWorkTransitionVisibility();
		// The hero card re-syncs once the article is back at rest; reveal the canvas after that.
		window.setTimeout(() => setCanvasTransitionHidden(false), 350);
		animateIn();
	}

	function resetPull() {
		pull = 0;
		pullShown = 0;
		wheelArmed = false;
		touchActive = false;
		touchOriginY = NaN;
		renderPull();
	}

	/* ---------- lifecycle ---------- */

	afterNavigate(({ to }) => {
		if (to?.url.pathname.includes('work')) {
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
		}
		updateCurrent();
		beginWorkRouteReadyTracking();
		showNativeMediaFallback();
		if (!enteringNext) {
			resetPull();
			setCanvasTransitionHidden(false);
			animationStore.isTransitioning = false;
			scheduleHideNativeMediaFallback();
			animateIn();
		}
	});

	function animateIn() {
		measureDocument();
		gsap.to('.gradient-top', { opacity: 1, delay: 1 });
		gsap.to('.gradient-top', { opacity: 0, delay: 4 });
	}

	beforeNavigate(({ to }) => {
		viewerStore.requestClose(true);
		if (to?.url.pathname === '/' && typeof currIndex === 'number') {
			animationStore.isTransitioning = true;
			homeTransitionStore.requestHomeReturn(currIndex);
		} else if (!navigatingNext) {
			scrollTo({ top: 0, left: 0, behavior: 'smooth' });
		}
		tl.time(0).kill();
		const trigger1 = ScrollTrigger?.getById('trigger1');
		if (trigger1) trigger1.kill(true);
	});

	$effect(() => {
		if (!browser || !articleEl) return;
		const observer = new ResizeObserver(() => measureDocument());
		observer.observe(articleEl);
		measureDocument();
		return () => observer.disconnect();
	});

	// Clear shared-transition suppression once the hero card has settled
	$effect(() => {
		const currentSlug = page.params.slug ?? '';
		const ready = workRouteReadyStore.hasKey(currentSlug, `${currentSlug}:0`);
		untrack(() => {
			if (ready && suppressHeroFallbackDuringHandoff) {
				suppressHeroFallbackDuringHandoff = false;
			}
		});
	});

	onMount(() => {
		isTouchDevice = window.matchMedia('(hover: none)').matches;
		labelText = idleLabel();
		let cancelled = false;

		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('touchstart', onTouchStart, { passive: false });
		window.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('touchend', onTouchEnd, { passive: true });
		window.addEventListener('touchcancel', onTouchEnd, { passive: true });
		window.addEventListener('resize', measureDocument, { passive: true });
		gsap.ticker.add(frameTick);

		void (async () => {
			const scrollTriggerModule = await import('gsap/ScrollTrigger');
			if (cancelled) return;
			ScrollTrigger = scrollTriggerModule.ScrollTrigger;
			gsap.registerPlugin(ScrollTrigger);
			window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
			animateIn();
			updateCurrent();
			await tick();
			measureDocument();
			canvasContainerEl = document.querySelector('.canvas-container') as HTMLElement | null;
			beginWorkRouteReadyTracking();
			showNativeMediaFallback();
			animationStore.isTransitioning = false;
			scheduleHideNativeMediaFallback();
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
		})();

		return () => {
			cancelled = true;
			window.removeEventListener('wheel', onWheel);
			window.removeEventListener('touchstart', onTouchStart);
			window.removeEventListener('touchmove', onTouchMove);
			window.removeEventListener('touchend', onTouchEnd);
			window.removeEventListener('touchcancel', onTouchEnd);
			window.removeEventListener('resize', measureDocument);
			gsap.ticker.remove(frameTick);
			clearNativeMediaFallbackHide();
			setScrollLocked(false);
			setCanvasTransitionHidden(false);
			viewerStore.requestClose(true);
			workRouteReadyStore.reset();
		};
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
	bind:this={progressBarEl}
	class="fixed top-0 right-0 h-dvh w-3 origin-top bg-linear-to-b from-stone-700 to-stone-100/0 dark:from-slate-300 dark:to-slate-900/0 pointer-events-none will-change-transform"
	style="transform: scaleY(0);"
></aside>
<img
	bind:this={caretEl}
	src={caret}
	alt=""
	aria-hidden="true"
	class="fixed top-0 right-0 w-3 pointer-events-none will-change-transform"
/>
<article
	bind:this={articleEl}
	class="relative overflow-hidden self-start w-full transition-opacity duration-300"
	class:opacity-0={(optionsStore.fullscreen && !viewerStore.active) ||
		gptStore.opened ||
		(animationStore.isTransitioning && !nextTransitionActive)}
	class:pointer-events-none={optionsStore.fullscreen || gptStore.opened}
>
	{#if current && typeof currIndex === 'number'}
		{@const currentSlug = page.params.slug ?? ''}
		{@const heroReady = workRouteReadyStore.hasKey(currentSlug, `${currentSlug}:0`)}
		{@const heroFallbackVisible =
			nativeMediaFallbackVisible && !heroReady && !suppressHeroFallbackDuringHandoff}
		<Section
			heading={data.projects[currIndex].title}
			index={0}
			image={heroImage}
			imageLight={heroImageLight}
			video={heroVideo}
			forceVisibleMedia={heroReady || heroFallbackVisible}
			awardsItem={current}
			onOpen={(media) => openViewer(media.source)}
		/>
		{#each current.content as item, index (`${currentSlug}-${index}`)}
			<Section
				index={index + 1}
				body={item.body}
				heading={item.headline}
				bottom={item.caption}
				image={item.image}
				video={item.video}
				imageLight={item.imageLight}
				forceVisibleMedia={true}
				onOpen={(media) => openViewer(media.source)}
			/>
		{/each}
	{/if}
</article>

<aside
	bind:this={overlayEl}
	class="fixed inset-0 z-40 gradient dark:invert-0 invert pointer-events-none overflow-hidden"
	style="display: none;"
	class:z-50={nextTransitionActive}
>
	<div
		bind:this={panelEl}
		class="absolute inset-x-0 will-change-transform"
		style="top: -20vh; height: 140vh; transform: translate3d(0, 120vh, 0); mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%); -webkit-mask-image: linear-gradient(to bottom, transparent 0%, #000 14%, #000 86%, transparent 100%);"
	>
		<div
			class="absolute inset-0"
			style={`background-color: ${base};
				background-image: radial-gradient(at 25% 0%, ${base} 0, transparent 30%),
				radial-gradient(at 75% 0%, ${base} 0, transparent 75%),
				radial-gradient(at 51.94% 0%, ${displayedNextColors[2]} 0, transparent 100%),
				radial-gradient(at 87.56% 50%, ${displayedNextColors[1]} 0, transparent 30%),
				radial-gradient(at 15% 88%, ${displayedNextColors[0]} 0, transparent 30%);`}
		></div>
	</div>
	<div
		bind:this={textEl}
		class="absolute inset-x-0 bottom-0 flex flex-col items-center gap-4 px-6 text-center will-change-transform"
		style="padding-bottom: 18vh; transform: translate3d(0, 60vh, 0);"
		style:color={textColor}
	>
		<div class="flex items-center justify-center font-mono uppercase text-xs gap-5 min-h-4">
			<p class="text-base">&gt;</p>
			<ScrambleText
				text={labelText}
				reserveText="Release to open next project"
				active={labelScramble}
				durationMs={700}
			/>
			<p class="text-base">&gt;</p>
		</div>
		<h4 class="text-4xl md:text-6xl font-bold">
			{displayedNextTitle}
		</h4>
	</div>
</aside>

<svelte:window bind:innerWidth />
