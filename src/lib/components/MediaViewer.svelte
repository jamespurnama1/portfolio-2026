<script lang="ts">
	import { gsap } from 'gsap';
	import { onMount, tick, untrack } from 'svelte';
	import { viewerStore, type ViewerMedia } from '#lib/stores/viewer.svelte.js';
	import { optionsStore } from '#lib/stores/options.svelte.js';
	import { ambient } from '#lib/utils/ambient.svelte.js';
	import { placeholderStyle } from '#lib/utils/placeholder.js';

	let mediaEl = $state<HTMLElement>();
	let backdropEl = $state<HTMLElement>();
	let videoEl = $state<HTMLVideoElement>();
	let box = $state({ w: 0, h: 0 });
	let muted = $state(true);
	let paused = $state(false);
	let userMuted = false;
	let closing = false;
	let switching = false;
	let openedFor: ViewerMedia | null = null;
	let lastCloseSignal = viewerStore.closeSignal;
	let loadedId = $state('');
	const SWIPE_MIN = 50;

	const media = $derived(viewerStore.active);

	// Explicit pixel size: a video's own box is unreliable until its metadata has loaded.
	function fit(m: ViewerMedia) {
		const r = m.rect();
		const ratio = m.ratio && isFinite(m.ratio) ? m.ratio : r.width / Math.max(r.height, 1);
		// Keep clear of the nav bar above and, for video, the mute label sitting over the media.
		const reserve = m.isVideo ? 128 : 96;
		const w = Math.min(window.innerWidth - 32, (window.innerHeight - reserve) * ratio);
		box = { w, h: w / ratio };
	}

	function flipDelta(el: HTMLElement, rect: DOMRect) {
		const to = el.getBoundingClientRect();
		return {
			x: rect.left + rect.width / 2 - (to.left + to.width / 2),
			y: rect.top + rect.height / 2 - (to.top + to.height / 2),
			scale: rect.width / Math.max(to.width, 1)
		};
	}

	async function playOpen(m: ViewerMedia) {
		closing = false;
		fit(m);
		const from = m.rect();
		m.hide(true);
		optionsStore.fullscreen = true;
		if (m.isVideo) ambient.pauseForMedia();
		await tick();
		if (!mediaEl || !backdropEl) return;
		const d = flipDelta(mediaEl, from);
		gsap.fromTo(
			mediaEl,
			{ x: d.x, y: d.y, scale: d.scale },
			{ x: 0, y: 0, scale: 1, duration: 0.55, ease: 'power3.out' }
		);
		gsap.fromTo(backdropEl, { opacity: 0 }, { opacity: 1, duration: 0.4, ease: 'power2.out' });
	}

	function close(immediate = false) {
		const m = viewerStore.active;
		if (!m || closing) return;
		const finish = () => {
			m.hide(false);
			viewerStore.clear();
			ambient.resumeFromMedia();
			optionsStore.fullscreen = false;
			closing = false;
			openedFor = null;
		};
		if (immediate || !mediaEl || !backdropEl) {
			finish();
			return;
		}
		closing = true;
		if (videoEl) {
			gsap.killTweensOf(videoEl);
			gsap.to(videoEl, { volume: 0, duration: 0.35 });
		}
		m.ensureVisible?.();
		const d = flipDelta(mediaEl, m.rect());
		gsap.to(mediaEl, { ...d, duration: 0.45, ease: 'power3.inOut' });
		gsap.to(backdropEl, { opacity: 0, duration: 0.4, ease: 'power2.in', onComplete: finish });
	}

	async function move(dir: 1 | -1) {
		const m = viewerStore.active;
		if (!m || closing || switching || !mediaEl) return;
		const list = viewerStore.siblings();
		const index = list.findIndex((x) => x.id === m.id);
		if (index < 0 || list.length < 2) return;
		const next = list[(index + dir + list.length) % list.length];
		switching = true;
		await gsap.to(mediaEl, { opacity: 0, x: -dir * 40, duration: 0.18, ease: 'power2.in' });
		m.hide(false);
		next.hide(true);
		fit(next);
		viewerStore.setActive(next);
		if (next.isVideo) ambient.pauseForMedia();
		await tick();
		if (mediaEl) {
			await gsap.fromTo(
				mediaEl,
				{ opacity: 0, x: dir * 40, y: 0, scale: 1 },
				{ opacity: 1, x: 0, duration: 0.3, ease: 'power2.out' }
			);
		}
		switching = false;
	}

	// The video starts muted, then its volume fades in unless the visitor muted it.
	function unmuteGradually(video: HTMLVideoElement) {
		gsap.killTweensOf(video);
		video.volume = 0;
		video.muted = false;
		muted = false;
		if (video.paused) {
			video.muted = true;
			muted = true;
			void video.play().catch(() => {});
			return;
		}
		gsap.to(video, {
			volume: 1,
			duration: 2,
			ease: 'power1.in',
			onComplete: () => {
				// Some browsers drop the fade; force the final state.
				video.muted = false;
				video.volume = 1;
			}
		});
	}

	function viewerVideo(node: HTMLVideoElement) {
		node.muted = true;
		node.volume = 0;
		paused = false;
		muted = true;
		// Runs on every 'playing' until sound is really on; the first one can be too early.
		const onPlaying = () => {
			if (!userMuted && node.muted) unmuteGradually(node);
		};
		// Keep the label truthful if the browser silences the element itself.
		const onVolume = () => (muted = node.muted);
		const onPlay = () => (paused = false);
		const onPause = () => (paused = true);
		node.addEventListener('playing', onPlaying);
		node.addEventListener('volumechange', onVolume);
		node.addEventListener('play', onPlay);
		node.addEventListener('pause', onPause);
		void node.play().catch(() => {});
		return {
			destroy() {
				gsap.killTweensOf(node);
				node.removeEventListener('playing', onPlaying);
				node.removeEventListener('volumechange', onVolume);
				node.removeEventListener('play', onPlay);
				node.removeEventListener('pause', onPause);
			}
		};
	}

	function toggleMute() {
		if (!videoEl) return;
		if (muted) {
			userMuted = false;
			unmuteGradually(videoEl);
		} else {
			userMuted = true;
			gsap.killTweensOf(videoEl);
			videoEl.muted = true;
			muted = true;
		}
	}

	function togglePlayback() {
		if (!videoEl) return;
		if (videoEl.paused) void videoEl.play().catch(() => {});
		else videoEl.pause();
	}

	// Native listener: the node lives under <body>, outside the app root Svelte delegates events to.
	function onViewerClick(event: MouseEvent) {
		const target = event.target as HTMLElement;
		if (target.closest('[data-viewer-mute]')) toggleMute();
		else if (target.closest('[data-viewer-video]')) togglePlayback();
		else close();
	}

	// Moved to <body> so the page's difference blend doesn't invert the media.
	function portal(node: HTMLElement) {
		document.body.appendChild(node);
		node.addEventListener('click', onViewerClick);
		// A horizontal swipe steps through the media like the arrow keys.
		let start: { x: number; y: number } | null = null;
		const onTouchStart = (e: TouchEvent) => {
			start = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY } : null;
		};
		const onTouchEnd = (e: TouchEvent) => {
			const t = e.changedTouches[0];
			if (!start || !t) return;
			const dx = t.clientX - start.x;
			const dy = t.clientY - start.y;
			start = null;
			if (Math.abs(dx) < SWIPE_MIN || Math.abs(dx) < Math.abs(dy) * 1.5) return;
			// Stops the click that would otherwise close the viewer.
			if (e.cancelable) e.preventDefault();
			void move(dx < 0 ? 1 : -1);
		};
		node.addEventListener('touchstart', onTouchStart, { passive: true });
		node.addEventListener('touchend', onTouchEnd, { passive: false });
		return {
			destroy() {
				node.removeEventListener('click', onViewerClick);
				node.removeEventListener('touchstart', onTouchStart);
				node.removeEventListener('touchend', onTouchEnd);
				node.remove();
			}
		};
	}

	function trackLoad(node: HTMLImageElement, id: string) {
		if (node.complete && node.naturalWidth > 0) loadedId = id;
	}

	function onKeydown(event: KeyboardEvent) {
		if (!viewerStore.active) return;
		if (event.key === 'Escape') close();
		else if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
			event.preventDefault();
			void move(event.key === 'ArrowRight' ? 1 : -1);
		}
	}

	$effect(() => {
		const m = viewerStore.active;
		untrack(() => {
			if (m && !openedFor) {
				openedFor = m;
				void playOpen(m);
			} else if (!m) {
				openedFor = null;
			}
		});
	});

	$effect(() => {
		const signal = viewerStore.closeSignal;
		untrack(() => {
			if (signal === lastCloseSignal) return;
			lastCloseSignal = signal;
			close(viewerStore.closeImmediate);
		});
	});

	onMount(() => {
		const onCloseEvent = () => close();
		window.addEventListener('keydown', onKeydown);
		window.addEventListener('close-viewer', onCloseEvent);
		return () => {
			window.removeEventListener('keydown', onKeydown);
			window.removeEventListener('close-viewer', onCloseEvent);
		};
	});
</script>

{#if media}
	<div
		use:portal
		class="fixed inset-0 z-15 flex touch-none items-center justify-center p-4 pointer-events-auto"
	>
		<div bind:this={backdropEl} class="absolute inset-0 bg-black/90"></div>
		{#key media.id}
			{#if media.isVideo}
				<div bind:this={mediaEl} class="relative" style="width: {box.w}px; height: {box.h}px;">
					<!-- svelte-ignore a11y_media_has_caption -->
					<video
						bind:this={videoEl}
						use:viewerVideo
						data-viewer-video
						src={media.url}
						class="h-full w-full object-contain"
						loop
						playsinline
					></video>
					{#if paused}
						<div class="pointer-events-none absolute inset-0 flex items-center justify-center">
							<svg viewBox="0 0 24 24" fill="white" class="h-14 w-14 opacity-80">
								<path d="M8 5v14l11-7z" />
							</svg>
						</div>
					{/if}
					<button
						data-viewer-mute
						class="absolute -top-7 left-0 font-mono text-xs uppercase text-white"
					>
						{muted ? 'Unmute' : 'Mute'}
					</button>
				</div>
			{:else}
				<img
					bind:this={mediaEl}
					use:trackLoad={media.id}
					onload={() => (loadedId = media.id)}
					src={media.url}
					alt={media.alt}
					class="relative object-contain"
					style="width: {box.w}px; height: {box.h}px; {loadedId === media.id
						? ''
						: placeholderStyle(media.url, media.lqip)}"
				/>
			{/if}
		{/key}
	</div>
{/if}
