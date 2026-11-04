<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { SvelteMap } from 'svelte/reactivity';
	import { gsap } from 'gsap';
	import { resolve } from '$app/paths';
	import type { PageData } from './$types';
	import type { GalleryMedia } from '#lib/types/index.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { loadStore } from '#lib/stores/index.svelte.js';
	import { ambient } from '#lib/utils/ambient.svelte.js';
	import { sfx } from '#lib/utils/sfx.js';
	import { createGalleryVideoThumbnails } from '#lib/utils/galleryVideoThumbnails.js';
	import { pinchZoom } from '#lib/utils/pinchZoom.js';

	let { data }: { data: PageData } = $props();
	const media = $derived(
		(data.gallery ?? []).flatMap((gallery) => gallery.media ?? []).filter((item) => item.url)
	);
	let selected = $state<number | null>(null);
	let width = $state(1200);
	let height = $state(800);
	let offset = $state({ x: 0, y: 0 });
	let pointer: {
		x: number;
		y: number;
		startX: number;
		startY: number;
		moved: boolean;
	} | null = null;
	let dragged = false;
	let panFrame = 0;
	let pendingPanX = 0;
	let pendingPanY = 0;
	let video: HTMLVideoElement | undefined = $state();
	let muted = $state(true);
	let paused = $state(false);
	let entered = $state(false);
	let sourceKey = $state<string | null>(null);
	let featureMedia = $state<HTMLElement>();
	let backdrop = $state<HTMLElement>();
	let viewerContent = $state<HTMLElement>();
	let gridViewport = $state<HTMLElement>();
	let thumbnailRail = $state<HTMLElement>();
	let railMoving = $state(false);
	let railSources = $state<string[]>([]);
	// The rail is a windowed, looping list: row v shows media[v mod N] and only ~20 rows are in the DOM.
	const RAIL_LOOPS = 200;
	const RAIL_BUFFER = 4;
	let selectedV = $state(0);
	let railStart = $state(0);
	let railCount = $state(24);
	let railRowHeight = $state(80);
	let railGap = $state(6);
	let railHorizontal = $state(false);
	const railTotal = $derived(media.length * RAIL_LOOPS);
	const railRows = $derived(
		Array.from(
			{ length: Math.max(0, Math.min(railCount, railTotal - railStart)) },
			(_, k) => railStart + k
		)
	);
	let railTimeline: gsap.core.Timeline | undefined;
	let videoThumbnails = $state<Record<string, string>>({});
	let failedThumbnails = $state<Record<string, boolean>>({});
	let thumbnailCache: ReturnType<typeof createGalleryVideoThumbnails> | undefined;
	let ratio = $state(1);
	let closing = false;
	let closingView = $state(false);
	$effect(() => {
		optionsStore.galleryViewer = selected !== null && !closingView;
		return () => (optionsStore.galleryViewer = false);
	});
	let selectionVersion = 0;
	let wheelDelta = 0;
	let lastWheelStep = 0;
	let touchStart: { x: number; y: number } | null = null;
	const tile = $derived(width < 640 ? 150 : 220);
	const spacing = $derived(width < 640 ? 215 : 330);
	const columns = $derived(Math.ceil(width / spacing) + 2);
	const rows = $derived(Math.ceil(height / spacing) + 2);
	const active = $derived(selected === null ? null : media[selected]);
	const isVideo = (item: GalleryMedia) =>
		item.mimeType?.startsWith('video/') || /\.(mp4|webm|mov|m4v)(?:\?|$)/i.test(item.url);
	function retryWithoutCors(event: Event) {
		const element = event.currentTarget as HTMLImageElement | HTMLVideoElement;
		if (element.crossOrigin !== 'anonymous') return;
		element.crossOrigin = null;
		if (element instanceof HTMLVideoElement) element.load();
		else element.src = element.src;
	}
	function videoThumbnail(node: HTMLElement, url: string) {
		thumbnailCache ??= createGalleryVideoThumbnails(
			(source, thumbnail) => (videoThumbnails[source] = thumbnail),
			(source) => (failedThumbnails[source] = true)
		);
		return thumbnailCache.observe(node, url);
	}
	// Gallery items are Sanity file assets (no ?w= support), so thumbnails come from /api/thumb.
	const gridSrc = (url: string, w = 480) => {
		const file = url.split('?')[0].split('/').pop() ?? '';
		return /\.(png|jpe?g|webp|gif|avif)$/i.test(file) ? `/api/thumb?f=${file}&w=${w}` : url;
	};
	const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
	const cells = $derived.by(() => {
		if (!media.length) return [];
		const startColumn = Math.floor(-offset.x / spacing) - 1;
		const startRow = Math.floor(-offset.y / spacing) - 1;
		return Array.from({ length: columns * rows }, (_, cell) => {
			const column = startColumn + (cell % columns);
			const row = startRow + Math.floor(cell / columns);
			return {
				key: `${column}:${row}`,
				index: mod(row * Math.max(1, Math.ceil(Math.sqrt(media.length))) + column, media.length),
				x: column * spacing + offset.x,
				y: row * spacing + offset.y
			};
		});
	});

	function flushPan() {
		panFrame = 0;
		offset.x += pendingPanX;
		offset.y += pendingPanY;
		pendingPanX = 0;
		pendingPanY = 0;
	}
	function queuePan(deltaX: number, deltaY: number) {
		pendingPanX += deltaX;
		pendingPanY += deltaY;
		if (!panFrame) panFrame = requestAnimationFrame(flushPan);
	}
	function onWheel(event: WheelEvent) {
		if (selected !== null) return;
		event.preventDefault();
		queuePan(-event.deltaX, -event.deltaY);
	}
	function pointerDown(event: PointerEvent) {
		if (event.button !== 0) return;
		pointer = {
			x: event.clientX,
			y: event.clientY,
			startX: event.clientX,
			startY: event.clientY,
			moved: false
		};
		dragged = false;
		(event.target as HTMLElement).setPointerCapture(event.pointerId);
	}
	function pointerMove(event: PointerEvent) {
		if (!pointer) return;
		const deltaX = event.clientX - pointer.x;
		const deltaY = event.clientY - pointer.y;
		if (
			!pointer.moved &&
			Math.hypot(event.clientX - pointer.startX, event.clientY - pointer.startY) > 5
		) {
			pointer.moved = true;
			(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
		}
		queuePan(deltaX, deltaY);
		pointer.x = event.clientX;
		pointer.y = event.clientY;
	}
	function pointerUp() {
		if (panFrame) {
			cancelAnimationFrame(panFrame);
			flushPan();
		}
		dragged = pointer?.moved ?? false;
		pointer = null;
	}
	function mediaRatio(element: Element | null) {
		if (element instanceof HTMLImageElement && element.naturalWidth && element.naturalHeight)
			return element.naturalWidth / element.naturalHeight;
		if (element instanceof HTMLVideoElement && element.videoWidth && element.videoHeight)
			return element.videoWidth / element.videoHeight;
		return 1;
	}
	function targetCell(index: number) {
		const candidates = Array.from(
			document.querySelectorAll<HTMLElement>(`[data-gallery-index="${index}"]`)
		);
		return candidates.sort((first, second) => {
			const distance = (element: HTMLElement) => {
				const rect = element.getBoundingClientRect();
				return Math.hypot(
					rect.left + rect.width / 2 - width / 2,
					rect.top + rect.height / 2 - height / 2
				);
			};
			return distance(first) - distance(second);
		})[0];
	}
	type GridSource = { key: string; rect: DOMRect; distance: number };
	function gridSources(excludedKey: string | null) {
		const sources = new SvelteMap<number, GridSource>();
		for (const cell of gridViewport?.querySelectorAll<HTMLElement>('.grid-item') ?? []) {
			const key = cell.dataset.galleryKey;
			const index = Number(cell.dataset.galleryIndex);
			if (!key || key === excludedKey) continue;
			const rect = cell.querySelector<HTMLElement>('.grid-image')?.getBoundingClientRect();
			if (!rect || rect.right <= 0 || rect.bottom <= 0 || rect.left >= width || rect.top >= height)
				continue;
			const distance = Math.hypot(
				rect.left + rect.width / 2 - width / 2,
				rect.top + rect.height / 2 - height / 2
			);
			if (!sources.has(index) || distance < sources.get(index)!.distance) {
				sources.set(index, { key, rect, distance });
			}
		}
		return sources;
	}
	function clearRailAnimation() {
		railTimeline?.kill();
		railTimeline = undefined;
		thumbnailRail?.querySelectorAll<HTMLElement>('.rail-animating').forEach((element) => {
			gsap.set([element, element.firstElementChild].filter(Boolean), {
				clearProps: 'transform,opacity,visibility'
			});
			element.classList.remove('rail-animating');
		});
		railSources = [];
		railMoving = false;
	}
	function measureRail() {
		if (!thumbnailRail) return;
		const style = getComputedStyle(thumbnailRail);
		const gap = parseFloat(style.rowGap) || 0;
		railGap = gap;
		if (railHorizontal) {
			const inner =
				thumbnailRail.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
			railRowHeight = Math.max(1, (inner * 16) / 9 + gap);
			railCount = Math.ceil(thumbnailRail.clientWidth / railRowHeight) + RAIL_BUFFER * 2 + 1;
			return;
		}
		const inner =
			thumbnailRail.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
		railRowHeight = Math.max(1, (inner * 9) / 16 + gap);
		railCount = Math.ceil(thumbnailRail.clientHeight / railRowHeight) + RAIL_BUFFER * 2 + 1;
	}
	const railScroll = () =>
		thumbnailRail ? (railHorizontal ? thumbnailRail.scrollLeft : thumbnailRail.scrollTop) : 0;
	function syncRailWindow(scroll = railScroll()) {
		const start = Math.max(
			0,
			Math.min(railTotal - railCount, Math.floor(scroll / railRowHeight) - RAIL_BUFFER)
		);
		if (start !== railStart) railStart = start;
	}
	$effect(() => {
		const query = window.matchMedia('(max-width: 767px)');
		const update = () => {
			railHorizontal = query.matches;
			measureRail();
		};
		query.addEventListener('change', update);
		update();
		return () => query.removeEventListener('change', update);
	});
	$effect(() => {
		if (!thumbnailRail) return;
		measureRail();
		const observer = new ResizeObserver(measureRail);
		observer.observe(thumbnailRail);
		return () => observer.disconnect();
	});
	function scrollRailToSelection(v: number, animate: boolean) {
		if (!thumbnailRail) return;
		if (!animate) measureRail();
		const start = v * railRowHeight;
		const end = start + railRowHeight;
		const scroll = railScroll();
		const viewport = railHorizontal ? thumbnailRail.clientWidth : thumbnailRail.clientHeight;
		const axis = railHorizontal ? 'left' : 'top';
		if (!animate) {
			const target = Math.max(0, start - (viewport - railRowHeight) / 2);
			thumbnailRail.scrollTo({ [axis]: target, behavior: 'instant' });
			syncRailWindow(target);
		} else if (start < scroll || end > scroll + viewport) {
			thumbnailRail.scrollTo({
				[axis]: start < scroll ? start : end - viewport,
				behavior: 'smooth'
			});
		}
	}
	async function animateRail(sources: ReturnType<typeof gridSources>, version: number) {
		if (!thumbnailRail) return;
		const bounds = thumbnailRail.getBoundingClientRect();
		const targets: { element: HTMLElement; rect: DOMRect; source: GridSource | undefined }[] = [];
		for (const child of Array.from(thumbnailRail.children)) {
			const element = child as HTMLElement;
			if (!element.dataset.media) continue;
			const rect = element.getBoundingClientRect();
			if (railHorizontal) {
				if (rect.right <= bounds.left || rect.left >= bounds.right) continue;
			} else if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
			targets.push({ element, rect, source: sources.get(Number(element.dataset.media)) });
		}
		railSources = targets.flatMap(({ source }) => (source ? [source.key] : []));
		railMoving = true;
		for (const { element } of targets) element.classList.add('rail-animating');
		await tick();
		if (version !== selectionVersion) return;
		if (!thumbnailRail || selected === null || closing) return clearRailAnimation();
		railTimeline = gsap.timeline({ onComplete: clearRailAnimation });
		for (const { element, rect, source } of targets) {
			if (!source || !rect.width || !rect.height) {
				railTimeline.fromTo(
					element,
					{ opacity: 0, x: -20 },
					{ opacity: 1, x: 0, duration: 0.4 },
					0.15
				);
				continue;
			}
			const scaleX = source.rect.width / rect.width;
			const scaleY = source.rect.height / rect.height;
			const mediaScale = Math.max(scaleX, scaleY);
			railTimeline.fromTo(
				element,
				{
					x: source.rect.left - rect.left,
					y: source.rect.top - rect.top,
					scaleX,
					scaleY,
					transformOrigin: 'top left'
				},
				{ x: 0, y: 0, scaleX: 1, scaleY: 1, duration: 0.6, ease: 'power3.inOut' },
				0
			);
			if (element.firstElementChild) {
				railTimeline.fromTo(
					element.firstElementChild,
					{ scaleX: mediaScale / scaleX, scaleY: mediaScale / scaleY },
					{ scaleX: 1, scaleY: 1, duration: 0.6, ease: 'power3.inOut' },
					0
				);
			}
		}
	}
	function animateRailOut(sources: ReturnType<typeof gridSources>) {
		if (!thumbnailRail) return;
		const bounds = thumbnailRail.getBoundingClientRect();
		const targets: { element: HTMLElement; rect: DOMRect; source: GridSource | undefined }[] = [];
		for (const child of Array.from(thumbnailRail.children)) {
			const element = child as HTMLElement;
			if (!element.dataset.media) continue;
			const rect = element.getBoundingClientRect();
			if (railHorizontal) {
				if (rect.right <= bounds.left || rect.left >= bounds.right) continue;
			} else if (rect.bottom <= bounds.top || rect.top >= bounds.bottom) continue;
			targets.push({ element, rect, source: sources.get(Number(element.dataset.media)) });
		}
		railSources = targets.flatMap(({ source }) => (source ? [source.key] : []));
		railMoving = true;
		for (const { element } of targets) element.classList.add('rail-animating');
		// No onComplete: resetting the rail would snap thumbnails back before the grid takes over.
		railTimeline = gsap.timeline();
		for (const { element, rect, source } of targets) {
			if (!source || !rect.width || !rect.height) {
				railTimeline.to(element, { opacity: 0, x: 20, duration: 0.3 }, 0);
				continue;
			}
			const scaleX = source.rect.width / rect.width;
			const scaleY = source.rect.height / rect.height;
			const mediaScale = Math.max(scaleX, scaleY);
			railTimeline.to(
				element,
				{
					x: source.rect.left - rect.left,
					y: source.rect.top - rect.top,
					scaleX,
					scaleY,
					transformOrigin: 'top left',
					duration: 0.55,
					ease: 'power3.inOut'
				},
				0
			);
			if (element.firstElementChild) {
				railTimeline.to(
					element.firstElementChild,
					{
						scaleX: mediaScale / scaleX,
						scaleY: mediaScale / scaleY,
						duration: 0.55,
						ease: 'power3.inOut'
					},
					0
				);
			}
		}
	}
	async function open(index: number, element: HTMLElement) {
		if (dragged) {
			dragged = false;
			return;
		}
		const source = element.querySelector<HTMLElement>('.grid-image');
		if (!source) return;
		const version = ++selectionVersion;
		const from = source.getBoundingClientRect();
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const sources = reducedMotion ? null : gridSources(element.dataset.galleryKey ?? null);
		ratio = mediaRatio(source.querySelector('img, video'));
		sourceKey = element.dataset.galleryKey ?? null;
		selectedV = railTotal / 2 + index;
		railStart = Math.max(0, selectedV - RAIL_BUFFER - Math.floor(railCount / 2));
		selected = index;
		muted = true;
		paused = false;
		sfx.open();
		if (isVideo(media[index])) ambient.pauseForMedia();
		await tick();
		if (
			version !== selectionVersion ||
			selected !== index ||
			closing ||
			!featureMedia ||
			!backdrop ||
			!viewerContent
		)
			return;
		const destination = featureMedia.getBoundingClientRect();
		if (!destination.width || !destination.height) return;
		scrollRailToSelection(selectedV, false);
		await tick();
		if (version !== selectionVersion) return;
		if (sources) void animateRail(sources, version);
		const scaleX = from.width / destination.width;
		const scaleY = from.height / destination.height;
		const mediaScale = Math.max(scaleX, scaleY);
		gsap.fromTo(
			featureMedia,
			{
				x: from.left - destination.left,
				y: from.top - destination.top,
				scaleX,
				scaleY,
				transformOrigin: 'top left'
			},
			{
				x: 0,
				y: 0,
				scaleX: 1,
				scaleY: 1,
				duration: reducedMotion ? 0 : 0.6,
				ease: 'power3.inOut',
				clearProps: 'transform'
			}
		);
		if (featureMedia.firstElementChild) {
			gsap.fromTo(
				featureMedia.firstElementChild,
				{ scaleX: mediaScale / scaleX, scaleY: mediaScale / scaleY },
				{
					scaleX: 1,
					scaleY: 1,
					duration: reducedMotion ? 0 : 0.6,
					ease: 'power3.inOut',
					clearProps: 'transform'
				}
			);
		}
		gsap.fromTo(backdrop, { opacity: 0 }, { opacity: 1, duration: reducedMotion ? 0 : 0.4 });
		gsap.fromTo(
			viewerContent,
			{ opacity: 0 },
			{ opacity: 1, duration: reducedMotion ? 0 : 0.35, delay: reducedMotion ? 0 : 0.2 }
		);
	}
	async function close() {
		if (selected === null || closing) return;
		closing = true;
		selectionVersion++;
		clearRailAnimation();
		if (featureMedia) {
			delete featureMedia.dataset.zoomed;
			(featureMedia.firstElementChild as HTMLElement | null)?.style.removeProperty('scale');
			(featureMedia.firstElementChild as HTMLElement | null)?.style.removeProperty('translate');
		}
		sfx.close();
		const target = sourceKey
			? document.querySelector<HTMLElement>(`[data-gallery-key="${sourceKey}"]`)
			: null;
		let cell = target?.dataset.galleryIndex === String(selected) ? target : targetCell(selected);
		const rect = cell?.getBoundingClientRect();
		if (!rect || rect.right <= 0 || rect.bottom <= 0 || rect.left >= width || rect.top >= height) {
			const row = Math.round((height / 2 - offset.y) / spacing);
			const centerColumn = Math.round((width / 2 - offset.x) / spacing);
			const firstColumn = mod(
				selected - row * Math.max(1, Math.ceil(Math.sqrt(media.length))),
				media.length
			);
			const column =
				firstColumn + Math.round((centerColumn - firstColumn) / media.length) * media.length;
			offset = {
				x: width / 2 - tile / 2 - column * spacing,
				y: height / 2 - tile / 2 - row * spacing
			};
			await tick();
			cell = targetCell(selected);
		}
		sourceKey = cell?.dataset.galleryKey ?? null;
		await tick();
		const destination = cell?.querySelector<HTMLElement>('.grid-image')?.getBoundingClientRect();
		const finish = () => {
			selected = null;
			sourceKey = null;
			closing = false;
			closingView = false;
			clearRailAnimation();
			ambient.resumeFromMedia();
		};
		if (!featureMedia || !destination || !backdrop || !viewerContent) return finish();
		gsap.killTweensOf(
			[featureMedia, featureMedia.firstElementChild, backdrop, viewerContent].filter(Boolean)
		);
		const current = featureMedia.getBoundingClientRect();
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const scaleX =
			(Number(gsap.getProperty(featureMedia, 'scaleX')) * destination.width) / current.width;
		const scaleY =
			(Number(gsap.getProperty(featureMedia, 'scaleY')) * destination.height) / current.height;
		const mediaScale = Math.max(scaleX, scaleY);
		closingView = true;
		if (!reducedMotion) animateRailOut(gridSources(sourceKey));
		gsap.to(viewerContent, { opacity: 0, duration: reducedMotion ? 0 : 0.2 });
		gsap.to(backdrop, { opacity: 0, duration: reducedMotion ? 0 : 0.45 });
		if (featureMedia.firstElementChild) {
			gsap.to(featureMedia.firstElementChild, {
				scaleX: mediaScale / scaleX,
				scaleY: mediaScale / scaleY,
				duration: reducedMotion ? 0 : 0.55,
				ease: 'power3.inOut'
			});
		}
		gsap.to(featureMedia, {
			x: `+=${destination.left - current.left}`,
			y: `+=${destination.top - current.top}`,
			scaleX,
			scaleY,
			transformOrigin: 'top left',
			duration: reducedMotion ? 0 : 0.55,
			ease: 'power3.inOut',
			onComplete: finish
		});
	}
	async function selectMedia(v: number, animate = true) {
		if (closing || selected === null || v === selectedV || media.length < 2) return;
		if (v < 0 || v >= railTotal) return;
		const index = mod(v, media.length);
		const version = ++selectionVersion;
		const direction = Math.sign(v - selectedV);
		const previous = featureMedia?.getBoundingClientRect();
		if (featureMedia) {
			gsap.killTweensOf([featureMedia, featureMedia.firstElementChild].filter(Boolean));
			gsap.set(featureMedia, { clearProps: 'transform' });
		}
		clearRailAnimation();
		ambient.resumeFromMedia();
		sourceKey = null;
		const thumbnail = thumbnailRail?.querySelector(`[data-v="${v}"] img, [data-v="${v}"] video`);
		ratio = mediaRatio(thumbnail ?? targetCell(index)?.querySelector('img, video') ?? null);
		selectedV = v;
		selected = index;
		muted = true;
		paused = false;
		if (isVideo(media[index])) ambient.pauseForMedia();
		sfx.step();
		await tick();
		if (version !== selectionVersion || closing) return;
		const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
		const shouldAnimate = animate && !reducedMotion;
		scrollRailToSelection(v, shouldAnimate);
		if (!featureMedia) return;
		if (!reducedMotion) {
			fadeInWhenReady(
				featureMedia.firstElementChild as HTMLElement | null,
				version,
				shouldAnimate ? direction * 16 : 0
			);
		}
		if (!shouldAnimate) return;
		const destination = featureMedia.getBoundingClientRect();
		if (previous && destination.width && destination.height) {
			gsap.fromTo(
				featureMedia,
				{
					scaleX: previous.width / destination.width,
					scaleY: previous.height / destination.height,
					transformOrigin: 'top left'
				},
				{
					scaleX: 1,
					scaleY: 1,
					duration: 0.25,
					ease: 'power2.out',
					clearProps: 'transform',
					overwrite: true
				}
			);
		}
	}
	// The old frame stays on screen until the new source loads, so hide it and fade the new one in.
	function fadeInWhenReady(el: HTMLElement | null, version: number, shift: number) {
		if (!el) return;
		gsap.killTweensOf(el);
		gsap.set(el, { opacity: 0, x: shift });
		const loadEvent = el instanceof HTMLVideoElement ? 'loadeddata' : 'load';
		let done = false;
		const timer = setTimeout(show, 2000);
		function show() {
			if (done) return;
			done = true;
			clearTimeout(timer);
			el?.removeEventListener(loadEvent, show);
			if (version !== selectionVersion || !el?.isConnected) return;
			gsap.to(el, {
				opacity: 1,
				x: 0,
				duration: 0.25,
				ease: 'power2.out',
				clearProps: 'opacity,transform',
				overwrite: true
			});
		}
		const ready =
			el instanceof HTMLImageElement
				? el.complete && el.naturalWidth > 0
				: el instanceof HTMLVideoElement
					? el.readyState >= 2
					: true;
		if (ready) show();
		else el.addEventListener(loadEvent, show, { once: true });
	}
	function stepMedia(direction: number) {
		const now = performance.now();
		const animate = now - lastWheelStep > 300;
		lastWheelStep = now;
		void selectMedia(selectedV + direction, animate);
	}
	function viewerWheel(event: WheelEvent) {
		if (event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		const delta = Math.abs(event.deltaY) >= Math.abs(event.deltaX) ? event.deltaY : event.deltaX;
		if (!delta) return;
		if (Math.sign(delta) !== Math.sign(wheelDelta)) wheelDelta = 0;
		wheelDelta += delta * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? height : 1);
		const now = performance.now();
		if (Math.abs(wheelDelta) < 60 || now - lastWheelStep < 120 || selected === null) return;
		const direction = Math.sign(wheelDelta);
		wheelDelta = 0;
		const animate = now - lastWheelStep > 300;
		lastWheelStep = now;
		void selectMedia(selectedV + direction, animate);
	}
	function viewerTouchStart(event: TouchEvent) {
		touchStart = null;
		if (
			(event.target as Element).closest('.thumbnails') ||
			event.touches.length > 1 ||
			featureMedia?.dataset.zoomed !== undefined
		)
			return;
		const touch = event.touches[0];
		if (touch) touchStart = { x: touch.clientX, y: touch.clientY };
	}
	function viewerTouchEnd(event: TouchEvent) {
		const touch = event.changedTouches[0];
		if (!touchStart || !touch || selected === null) return;
		const deltaX = touch.clientX - touchStart.x;
		const deltaY = touch.clientY - touchStart.y;
		touchStart = null;
		const delta = Math.abs(deltaY) >= Math.abs(deltaX) ? deltaY : deltaX;
		if (Math.abs(delta) > 45) void selectMedia(selectedV - Math.sign(delta));
	}
	function togglePlayback() {
		if (!video) return;
		if (video.paused) void video.play().catch(() => {});
		else video.pause();
	}
	onMount(() => {
		loadStore.galleryTransitioning = true;
		const revealTimer = setTimeout(() => {
			entered = true;
			window.dispatchEvent(new Event('gallery-reveal'));
		}, 1800);
		const keydown = (event: KeyboardEvent) => {
			if (selected === null) return;
			if (event.key === 'Escape') return void close();
			if (event.metaKey || event.ctrlKey || event.altKey) return;
			if ((event.target as Element | null)?.closest?.('input, textarea, select, [contenteditable]'))
				return;
			if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
				event.preventDefault();
				stepMedia(1);
			} else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
				event.preventDefault();
				stepMedia(-1);
			}
		};
		const closeViewer = (event: Event) => {
			if (selected === null) return;
			event.preventDefault();
			void close();
		};
		window.addEventListener('keydown', keydown);
		window.addEventListener('close-gallery-viewer', closeViewer);
		return () => {
			selectionVersion++;
			clearRailAnimation();
			thumbnailCache?.destroy();
			cancelAnimationFrame(panFrame);
			clearTimeout(revealTimer);
			window.removeEventListener('keydown', keydown);
			window.removeEventListener('close-gallery-viewer', closeViewer);
			gsap.killTweensOf(
				[featureMedia, featureMedia?.firstElementChild, backdrop, viewerContent].filter(Boolean)
			);
			ambient.resumeFromMedia();
			loadStore.galleryTransitioning = false;
		};
	});
</script>

<svelte:window bind:innerWidth={width} bind:innerHeight={height} />
<svelte:head>
	<title>Gallery | James Henry</title>
	<meta name="description" content="A gallery of images and video by James Henry." />
	<link rel="canonical" href="https://jameshenry.site/gallery" />
</svelte:head>

{#if media.length === 0}
	<p class="empty">No gallery items found.</p>
{:else}
	<div
		class="grid-viewport"
		bind:this={gridViewport}
		class:light={!optionsStore.dark}
		class:inactive={selected !== null && !closingView}
		inert={selected !== null}
		onwheel={onWheel}
		onpointerdown={pointerDown}
		onpointermove={pointerMove}
		onpointerup={pointerUp}
		onpointercancel={pointerUp}
		role="region"
		aria-label="Gallery grid"
	>
		{#each cells as cell, cellIndex (cell.key)}
			{@const item = media[cell.index]}
			<button
				class="grid-item"
				class:entering={!entered}
				class:source-hidden={sourceKey === cell.key || railSources.includes(cell.key)}
				data-gallery-key={cell.key}
				data-gallery-index={cell.index}
				style:--delay="{Math.min(cellIndex, 24) * 35}ms"
				style:left="{cell.x}px"
				style:top="{cell.y}px"
				style:width="{tile}px"
				style:height="{tile}px"
				onclick={(event) => open(cell.index, event.currentTarget)}
				onpointerenter={() => sfx.hover()}
				aria-label="Open {item.alt || item.caption || item.filename || 'gallery item'}"
			>
				<div class="grid-image">
					{#if isVideo(item) && !failedThumbnails[item.url]}
						<img
							use:videoThumbnail={item.url}
							data-gallery-ghost
							src={videoThumbnails[item.url]}
							alt=""
							draggable="false"
							decoding="async"
						/>
					{:else if isVideo(item)}
						<video
							data-gallery-ghost
							crossorigin="anonymous"
							onerror={retryWithoutCors}
							src={item.url}
							muted
							playsinline
							preload="metadata"
						></video>
					{:else}
						<img
							data-gallery-ghost
							crossorigin="anonymous"
							onerror={retryWithoutCors}
							src={gridSrc(item.url)}
							alt=""
							draggable="false"
							decoding="async"
						/>
					{/if}
				</div>
				{#if item.alt || item.caption}<span>{item.alt || item.caption}</span>{/if}
			</button>
		{/each}
	</div>
	{#if active}
		<section
			class="viewer"
			class:light={!optionsStore.dark}
			aria-label="Gallery viewer"
			onwheel={viewerWheel}
			ontouchstart={viewerTouchStart}
			ontouchend={viewerTouchEnd}
			use:pinchZoom={selectedV}
		>
			<div class="viewer-backdrop" bind:this={backdrop}></div>
			<div class="feature" style:--ratio={ratio}>
				<div class="feature-media" bind:this={featureMedia}>
					{#if isVideo(active)}
						<video
							bind:this={video}
							data-gallery-ghost
							data-gallery-ghost-src={videoThumbnails[active.url]}
							crossorigin="anonymous"
							onerror={retryWithoutCors}
							src={active.url}
							{muted}
							autoplay
							loop
							playsinline
							onloadedmetadata={(event) => {
								ratio = mediaRatio(event.currentTarget);
							}}
							onplay={() => (paused = false)}
							onpause={() => (paused = true)}
							onclick={togglePlayback}
							onkeydown={(event) => {
								if (event.key === 'Enter' || event.key === ' ') {
									event.preventDefault();
									togglePlayback();
								}
							}}
							role="button"
							tabindex="0"
							aria-label={paused ? 'Play video' : 'Pause video'}
						></video>
					{:else}
						<img
							data-gallery-ghost
							crossorigin="anonymous"
							onerror={retryWithoutCors}
							src={gridSrc(active.url, 1600)}
							alt={active.alt || active.caption || ''}
							decoding="async"
							onload={(event) => {
								ratio = mediaRatio(event.currentTarget);
							}}
						/>
					{/if}
				</div>
				<div class="viewer-content" bind:this={viewerContent}>
					{#if isVideo(active)}<button class="mute" onclick={() => (muted = !muted)}
							>{muted ? 'UNMUTE' : 'MUTE'}</button
						>{/if}
					{#if active.alt || active.caption}<p class="caption">
							{active.alt || active.caption}
						</p>{/if}
					{#if active.projectSlug}
						<a
							class="project-link"
							href={resolve('/(site)/work/[slug]', { slug: active.projectSlug })}>GO TO PROJECT</a
						>
					{/if}
				</div>
			</div>
			<div class="rail">
				<div
					class="thumbnails"
					bind:this={thumbnailRail}
					class:moving={railMoving}
					class:horizontal={railHorizontal}
					style:--row-h="{railRowHeight - railGap}px"
					onscroll={() => syncRailWindow()}
				>
					{#if railStart > 0}
						<div
							class="rail-spacer"
							aria-hidden="true"
							style:height={railHorizontal ? undefined : `${railStart * railRowHeight - railGap}px`}
							style:width={railHorizontal ? `${railStart * railRowHeight - railGap}px` : undefined}
						></div>
					{/if}
					{#each railRows as v (v)}
						{@const index = mod(v, media.length)}
						{@const item = media[index]}
						<button
							class:selected={v === selectedV}
							data-v={v}
							data-media={index}
							aria-label="View {item.alt || item.caption || item.filename || 'gallery item'}"
							aria-pressed={v === selectedV}
							onpointerenter={() => sfx.hover()}
							onclick={() => selectMedia(v)}
						>
							{#if isVideo(item) && !failedThumbnails[item.url]}<img
									use:videoThumbnail={item.url}
									data-gallery-ghost
									src={videoThumbnails[item.url]}
									alt=""
									loading="lazy"
									decoding="async"
								/>{:else if isVideo(item)}<video
									data-gallery-ghost
									crossorigin="anonymous"
									onerror={retryWithoutCors}
									src={item.url}
									muted
									playsinline
									preload="metadata"
								></video>{:else}<img
									data-gallery-ghost
									crossorigin="anonymous"
									onerror={retryWithoutCors}
									src={gridSrc(item.url, 320)}
									alt=""
									loading="lazy"
									decoding="async"
								/>{/if}
						</button>
					{/each}
					<div
						class="rail-spacer"
						aria-hidden="true"
						style:height={railHorizontal
							? undefined
							: `${Math.max(0, railTotal - railStart - railRows.length) * railRowHeight}px`}
						style:width={railHorizontal
							? `${Math.max(0, railTotal - railStart - railRows.length) * railRowHeight}px`
							: undefined}
					></div>
				</div>
			</div>
		</section>
	{/if}
{/if}

<style>
	.grid-viewport {
		position: fixed;
		inset: 0;
		overflow: hidden;
		touch-action: none;
		user-select: none;
		transition: opacity 0.4s;
	}
	.grid-viewport.light .grid-item span {
		color: #080808;
	}
	.grid-item {
		position: absolute;
		text-align: left;
	}
	.grid-item.entering {
		animation: gallery-enter 0.7s both;
		animation-delay: var(--delay);
	}
	.grid-image {
		width: 100%;
		height: 100%;
		overflow: hidden;
		background: #1b1b1b;
		transition: transform 0.35s ease;
		will-change: transform;
	}
	.grid-item:hover .grid-image,
	.grid-item:focus-visible .grid-image {
		transform: scale(1.05);
	}
	.grid-item.source-hidden .grid-image {
		visibility: hidden;
	}
	.grid-viewport.inactive {
		pointer-events: none;
		opacity: 0;
	}
	.grid-item img,
	.grid-item video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}
	.grid-item span {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		padding-top: 0.6rem;
		color: white;
		font-family: var(--font-mono);
		font-size: 0.75rem;
		opacity: 0;
		transition: opacity 0.3s;
	}
	.grid-item:hover span,
	.grid-item:focus-visible span {
		opacity: 1;
	}
	@keyframes gallery-enter {
		from {
			opacity: 0;
		}
		to {
			opacity: 1;
		}
	}
	.viewer {
		position: fixed;
		inset: 0;
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(80px, 120px);
		grid-template-rows: minmax(0, 1fr);
		gap: 7%;
		padding: 6.5rem 7% 3rem 4.7%;
		color: white;
	}
	.viewer-backdrop {
		position: absolute;
		inset: 0;
	}
	.viewer.light {
		color: #080808;
	}
	.feature {
		position: relative;
		min-width: 0;
		align-self: start;
	}
	.feature-media {
		position: relative;
		width: min(100%, calc((100svh - 12rem) * var(--ratio)));
		aspect-ratio: var(--ratio);
		overflow: hidden;
		touch-action: none;
	}
	:global(.feature-media[data-zoomed]) {
		overflow: visible;
		z-index: 5;
	}
	.feature-media img,
	.feature-media video {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.mute {
		position: absolute;
		top: -1.75rem;
		left: 0;
		color: inherit;
		font-family: var(--font-mono);
		font-size: 0.7rem;
	}
	.viewer-content {
		width: min(100%, calc((100svh - 12rem) * var(--ratio)));
		display: flex;
		flex-wrap: wrap;
		gap: 0 1rem;
	}
	.caption {
		flex: 1 1 9rem;
		margin-top: 0.6rem;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		text-transform: uppercase;
	}
	.project-link {
		margin: 0.6rem 0 0 auto;
		font-family: var(--font-mono);
		font-size: 0.65rem;
		white-space: nowrap;
	}
	.rail {
		position: relative;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.thumbnails {
		flex: 1 1 0;
		min-height: 0;
		overflow-y: auto;
		overscroll-behavior: contain;
		overflow-anchor: none;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.thumbnails button,
	.rail-spacer {
		flex: none;
	}
	.thumbnails button {
		width: 100%;
		height: var(--row-h);
		opacity: 0.7;
		overflow: hidden;
	}
	.thumbnails.moving {
		pointer-events: none;
	}
	.thumbnails.horizontal {
		flex-direction: row;
		overflow: auto hidden;
	}
	.thumbnails.horizontal button {
		width: var(--row-h);
		height: 100%;
	}
	.thumbnails.moving button:not(.rail-animating) {
		visibility: hidden;
	}
	.thumbnails button:hover,
	.thumbnails button:focus-visible,
	.thumbnails button.selected {
		opacity: 1;
	}
	.thumbnails img,
	.thumbnails video {
		width: 100%;
		height: 100%;
		object-fit: cover;
		pointer-events: none;
	}
	.empty {
		padding: 8rem 1rem;
		color: white;
	}
	@media (max-width: 767px) {
		.viewer {
			grid-template-columns: minmax(0, 1fr);
			grid-template-rows: minmax(0, 1fr) 3.5rem;
			gap: 1rem;
			padding: 5rem 1rem 7.5rem;
		}
		.feature {
			align-self: center;
		}
		.feature-media,
		.viewer-content {
			width: min(100%, calc((100svh - 17rem) * var(--ratio)));
			margin-inline: auto;
		}
		.rail {
			height: 3.5rem;
		}
		.thumbnails {
			align-content: start;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.grid-item.entering {
			animation: none;
		}
		.grid-image,
		.grid-item span {
			transition: none;
		}
	}
</style>
