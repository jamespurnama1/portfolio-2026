<script lang="ts">
	import Loading from '$lib/components/Loading.svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import '../app.css';
	// import { Canvas } from '@threlte/core';
	import Three from '$lib/components/Three.svelte';
	import Nav from '$lib/components/Nav.svelte';
	import Footer from '$lib/components/Footer.svelte';
	import Debug from '$lib/components/Debug.svelte';
	import {
		countStore,
		loadStore,
		introGateStore,
		homeScrollStore,
		animationStore,
		scrollStore,
		notificationStore,
		gptStore,
		focusCursor,
		currentHomeCardSnapshotStore,
		sharedCardTransitionStore
	} from '$lib/stores/index.svelte';
	import { introSectionStore } from '$lib/stores/introSection';
	import { projectSectionStore } from '$lib/stores/projectSection';
	import { projectListHost } from '$lib/stores/projectListHost';
	import { galleryScrollStore } from '$lib/stores/galleryScroll';
	import { gsap } from 'gsap';
	import { checkSavedTheme } from '$lib/utils/theme';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { beforeNavigate, afterNavigate, goto } from '$app/navigation';
	import { homeNav } from '$lib/stores/homeNav';
	import { reelViewer, viewerStore } from '$lib/stores/viewer.svelte';
	import MediaViewer from '$lib/components/MediaViewer.svelte';
	import IntroStack from '$lib/components/IntroStack.svelte';
	import { sfx } from '$lib/utils/sfx';
	import { namnam } from '$lib/utils/easterEggs';
	import ProjectList from '$lib/components/ProjectList.svelte';
	import { type PageData } from './$types.js';
	import { optionsStore } from '$lib/stores/options.svelte';
	import Notifications from '$lib/components/Notifications.svelte';
	import GPT from '$lib/components/gpt.svelte';
	import { browser, dev } from '$app/environment';
	import { isSafariUserAgent, isMobile } from '$lib/utils/device';
	import { initAnalytics } from '$lib/utils/analytics';
	import { ambient } from '$lib/utils/ambient.svelte';

	// Initialize theme before first render to prevent flash of wrong colors on mobile
	if (browser) checkSavedTheme();

	let prev = 0;
	let innerWidth = $state(0);
	let app = $state() as HTMLDivElement | undefined;
	let innerHeight = $state(0);
	let { children, data } = $props();
	import type { SvelteComponent } from 'svelte';
	let webGLComponent: SvelteComponent | undefined = $state();
	let gptEl: SvelteComponent | undefined = $state();
	let navComponent: Nav;
	let footerComponent: Footer;
	let mediaEl = $state([]) as HTMLVideoElement[];
	let thumbnailEls = $state([]) as HTMLImageElement[];
	let timer: ReturnType<typeof setTimeout> | undefined;
	let touchStartY = $state(0);
	let touchScrollTimer = $state<ReturnType<typeof setTimeout> | null>(null);
	// Tracks whether videos have been unlocked for iOS Safari autoplay.
	// play() must be called from a synchronous user-gesture context at least once
	// per element; after that, play() from any context (RAF/$effect) succeeds.
	let videosUnlocked = false;
	let preferImageThumbnails = $state(false);
	let projectListWrapper = $state() as HTMLDivElement | undefined;
	let projectListFallback = $state() as HTMLDivElement | undefined;
	let currentProjectListHost: HTMLElement | null = null;
	let wheelHandler = $state<((event: WheelEvent) => void) | null>(null);
	let touchStartHandler = $state<((event: TouchEvent) => void) | null>(null);
	let touchMoveHandler = $state<((event: TouchEvent) => void) | null>(null);
	let touchEndHandler = $state<((event: TouchEvent) => void) | null>(null);
	let workScrollHandler = $state<(() => void) | null>(null);
	const showSource = $derived(optionsStore.showSources ? 'opacity-100 z-50' : 'opacity-0 -z-10');
	const slug = $derived(data.projects ? data.projects[countStore.activeIndex].slug.current : '');
	const showProjectList = $derived(page.url.pathname === '/' || page.url.pathname.includes('work'));
	const showLoadingScreen = $derived(!loadStore.loaded);
	const homeIntroActive = $derived(
		page.url.pathname === '/' && ($introSectionStore.active || $introSectionStore.progress < 1)
	);
	const showSiteChrome = $derived(
		loadStore.loaded && introGateStore.phase === 'done' && !homeIntroActive
	);
	const showIntroPrompt = $derived(
		loadStore.loaded && introGateStore.phase === 'done' && homeIntroActive
	);
	function withOptimizedThumbnail(url?: string) {
		if (!url) return '';
		const fallback = typeof window !== 'undefined' ? window.innerWidth : 1920;
		const width = innerWidth || fallback;
		const targetWidth = Math.min(Math.max(Math.round(width || 1920), 480), 2560);
		const optimizedThumbParams = `auto=format&fit=max&q=85&w=${targetWidth}`;
		return `${url}${url.includes('?') ? '&' : '?'}${optimizedThumbParams}`;
	}
	function relocateProjectList(target: HTMLElement | null) {
		if (!projectListWrapper) return;
		const desiredParent = target ?? projectListFallback;
		if (!desiredParent || projectListWrapper.parentElement === desiredParent) return;
		desiredParent.appendChild(projectListWrapper);
	}

	$effect(() => {
		projectListWrapper;
		projectListFallback;
		untrack(() => relocateProjectList(currentProjectListHost));
	});

	/* 
	--------
	KEYBOARD
	--------
	*/
	// Keyboard Event
	function onKeyDown(e: KeyboardEvent) {
		if (!loadStore.loaded || introGateStore.phase !== 'done') return;
		// shortcut to open GPT
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
			e.preventDefault();
			gptStore.opened = !gptStore.opened;
			return;
		} else if (e.key.toLowerCase() === 'escape') {
			e.preventDefault();
			if (!gptStore.opened && page.url.pathname === '/branch') void goto('/');
			gptStore.opened = false;
			return;
		}

		// add stuff here if requires keyboard input
		if (gptStore.opened) return;
		// Browser shortcuts (reload, save, print…), Tab and function keys stay native.
		if (e.metaKey || e.ctrlKey || e.altKey || e.key === 'Tab' || /^F\d{1,2}$/.test(e.key)) return;
		const target = e.target as HTMLElement | null;
		if (target?.closest('input, textarea, select, [contenteditable]')) return;
		// Enter/Space on a focused link or button activates it.
		const onControl = !!target?.closest('a, button, [role="button"]');
		const scrollKeys = [' ', 'PageUp', 'PageDown', 'Home', 'End'];
		const navKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
		const onHome = page.url.pathname === '/';
		if (
			!(onControl && (e.key === 'Enter' || e.key === ' ')) &&
			((onHome && (navKeys.includes(e.key) || scrollKeys.includes(e.key))) || e.key === 'Enter')
		) {
			e.preventDefault();
		}
		// Easter egg
		namnam(e.key);
		if (page.params.slug || page.url.hash) return;
		if (onControl && e.key === 'Enter') return;
		const arrowDir: Record<string, 1 | -1> = {
			ArrowUp: -1,
			ArrowLeft: -1,
			ArrowDown: 1,
			ArrowRight: 1
		};
		if (arrowDir[e.key] && page.url.pathname === '/' && homeNav.step) {
			homeNav.step(arrowDir[e.key]);
			return;
		}
		if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
			countStore.activeIndex = false;
			debouncedInertia.restart(true);
		} else if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
			countStore.activeIndex = true;
			debouncedInertia.restart(true);
		} else if (e.key === 'Enter') {
			if (!data.projectsLength) return;
			if (slug === 'reels') {
				reelViewer.open?.();
				return;
			}
			const targetPath = slug === 'reels' ? '/#reels' : `/work/${slug}`;
			if (slug !== 'reels') {
				const snapshot = currentHomeCardSnapshotStore.value;
				if (snapshot && snapshot.slug === slug) {
					sharedCardTransitionStore.set({
						direction: 'to-work',
						index: snapshot.index,
						slug: snapshot.slug,
						geometry: snapshot.geometry,
						transform: snapshot.transform
					});
				}
				animationStore.homeNavigatingToWork = true;
			}
			goto(targetPath).finally(() => {
				animationStore.homeNavigatingToWork = false;
			});
		}
	}

	/* 
	----------
	ANIMATIONS
	----------
	*/
	// Category Animation
	function checkCategory(goTo: number) {
		let index =
			data.categoriesLength!.findIndex((x, i) => {
				const nextNum = data.categoriesLength![i + 1] || Infinity;
				return goTo + 1 > x && goTo + 1 <= nextNum;
			}) + 1;
		if (prev !== index) {
			animationStore.currentCat = [data.categories![index], index];
			countStore.isNewCat = true;
			prev = index;
		}
	}

	// Navigation Animation
	beforeNavigate(({ to }) => {
		if (to?.url.pathname.includes('work')) {
			animationStore.isTransitioning = true;
			// document.documentElement.classList.remove('overflow-hidden');
		} else {
			// document.documentElement.classList.add('overflow-hidden');
		}
	});

	const tl = gsap.timeline();

	afterNavigate(({ from, to }) => {
		const fromPath = from?.url.pathname;
		const toPath = to?.url.pathname;
		if (!loadStore.loaded || fromPath === toPath) return;
		if (toPath !== '/') homeScrollStore.pending = false;
		if (toPath === '/branch') sfx.enter();
		else if (toPath?.includes('/work/')) sfx.project();
		else if (toPath === '/') {
			if (fromPath === '/branch') sfx.exit();
			sfx.back();
		}
	});

	let lastSfxIndex = -1;
	$effect(() => {
		const index = countStore.activeIndex;
		untrack(() => {
			if (
				lastSfxIndex >= 0 &&
				index !== lastSfxIndex &&
				loadStore.loaded &&
				page.url.pathname === '/'
			) {
				sfx.step();
			}
			lastSfxIndex = index;
		});
	});

	const update = () => {
		countStore.isTouchScrolling = false;
		if (!data.projectsLength || !data.categoriesLength) return;
		// if (mediaEl[prev]) mediaEl[prev]?.pause?.();
		let goTo = countStore.activeIndex;

		// smooth snapping
		if (countStore.inertiaIndex <= 0) {
			goTo = 0;
		} else if (countStore.inertiaIndex >= data.projectsLength - 1) {
			goTo = data.projectsLength - 1;
		}

		tl.clear();
		tl.to(countStore, {
			inertiaIndex: goTo,
			ease: 'power4.out',
			duration: Math.min(Math.abs(countStore.inertiaIndex - goTo) * 0.3, 0.5),
			onUpdate: () => {
				if (goTo !== countStore.inertiaIndex) {
					debouncedInertia.restart(true);
				}
			}
		});

		// play video
		if (mediaEl[goTo] && loadStore.loaded) {
			mediaEl.forEach((el) => {
				if (el instanceof HTMLVideoElement) {
					el.pause();
				}
			});
			const targetEl = mediaEl[goTo];
			if (targetEl instanceof HTMLVideoElement) {
				targetEl.play();
			}
		}

		// check dir from prev value
		// must use set timeout to send things in order
		checkCategory(goTo);
	};

	/* 
	-----
	VIDEO
	-----
	*/
	// Load in Animation
	$effect(() => {
		if (!loadStore.loaded) return;
		// Do not pause non-active videos here. On iOS Safari, calling el.pause() from
		// a non-gesture async context (effect/microtask) puts the video into a
		// "user-interrupted" state that prevents el.play() from succeeding later.
		// Videos have `autoplay muted playsinline` HTML attributes — the browser
		// manages initial playback. We only control the ACTIVE card via the effect below.
	});

	$effect(() => {
		showIntroPrompt;
		gptStore.opened;
		page.url.pathname;
		untrack(() => {
			const managingScrollPrompt = notificationStore.message === 'Scroll to browse';
			if (showIntroPrompt && !gptStore.opened) {
				notificationStore.message = 'Scroll to browse';
				notificationStore.sub = '';
				notificationStore.persistent = true;
				notificationStore.opened = true;
				return;
			}

			if (managingScrollPrompt) {
				notificationStore.persistent = false;
				notificationStore.opened = false;
			}
		});
	});

	// Calculate Loading
	let loadedMediaIndices = new Set<number>();
	const expectedMediaCount = $derived.by(() => {
		if (!data.projects?.length) return 0;
		return data.projects.reduce((count, project) => {
			const usesImageThumbnail = preferImageThumbnails && !!project.thumbnailImage?.asset?.url;
			const hasRenderableMedia = usesImageThumbnail || !!project.thumbnail?.asset?.url;
			return count + (hasRenderableMedia ? 1 : 0);
		}, 0);
	});

	$effect(() => {
		mediaEl.length;
		thumbnailEls.length;
		preferImageThumbnails;
		expectedMediaCount;
		untrack(() => {
			if (expectedMediaCount === 0) {
				loadStore.load = 100;
				return;
			}

			const attachVideoListeners = (el: HTMLVideoElement, i: number) => {
				const onMediaLoadForIndex = () => {
					if (loadedMediaIndices.has(i)) return;
					loadedMediaIndices.add(i);
					onMediaLoad();
				};

				console.log(
					`[video:load] attachVideoListeners el[${i}] readyState:${el.readyState} src:${el.src?.slice(-40)}`
				);
				const playPromise = el.play();
				if (playPromise?.catch) {
					playPromise.catch((error: unknown) => {
						if (error instanceof Error && error.name === 'NotAllowedError') {
							console.warn(`[video:load] el[${i}] NotAllowedError (Power Saver / no gesture yet)`);
							onMediaLoadForIndex();
						}
					});
				}

				if (el.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
					onMediaLoadForIndex();
					return;
				}

				el.addEventListener('canplay', onMediaLoadForIndex, { once: true });
				el.addEventListener('loadeddata', onMediaLoadForIndex, { once: true });
				// iOS Safari may never fire canplay/loadeddata for stalled videos; don't block loading
				el.addEventListener('loadedmetadata', onMediaLoadForIndex, { once: true });
				setTimeout(onMediaLoadForIndex, 4000);
				el.addEventListener(
					'error',
					() => {
						console.error('Video error for media index', i);
						onMediaLoadForIndex();
					},
					{ once: true }
				);
			};

			const attachImageListeners = (el: HTMLImageElement, i: number) => {
				const onMediaLoadForIndex = () => {
					if (loadedMediaIndices.has(i)) return;
					loadedMediaIndices.add(i);
					onMediaLoad();
				};

				if (el.complete) {
					onMediaLoadForIndex();
				} else {
					el.addEventListener('load', onMediaLoadForIndex, { once: true });
				}
				el.addEventListener(
					'error',
					() => {
						console.error('Image error for media index', i);
						onMediaLoadForIndex();
					},
					{ once: true }
				);
			};

			mediaEl.forEach((el, i) => {
				if (!el) return;
				attachVideoListeners(el, i);
			});

			thumbnailEls.forEach((el, i) => {
				if (!el) return;
				attachImageListeners(el, i);
			});
		});
	});

	$effect(() => {
		countStore.activeIndex;
		mediaEl.length;
		loadStore.loaded;
		untrack(() => {
			if (!loadStore.loaded || !mediaEl.length) return;
			if (page.url.pathname === '/') {
				navigator.vibrate?.(10);
			}
			// Only ensure the active card is playing. Non-active videos are left running
			// (muted, they continue via autoplay attribute). Calling el.pause() from an
			// async effect context on iOS Safari blocks future play() calls on that element.
			const activeEl = mediaEl[countStore.activeIndex];
			const tag = `[video:${countStore.activeIndex}]`;
			if (activeEl instanceof HTMLVideoElement) {
				activeEl.muted = true; // ensure muted so iOS allows play() from async context
				console.log(
					tag,
					'play() attempt — readyState:',
					activeEl.readyState,
					'paused:',
					activeEl.paused,
					'networkState:',
					activeEl.networkState,
					'src:',
					activeEl.src?.slice(-40),
					'videosUnlocked:',
					videosUnlocked
				);
				activeEl
					.play()
					.then(() => console.log(tag, 'play() resolved ✓'))
					.catch((err: unknown) => console.warn(tag, 'play() rejected —', err));
			} else {
				console.log(
					tag,
					'no video element found — mediaEl.length:',
					mediaEl.length,
					'activeIndex:',
					countStore.activeIndex
				);
			}
		});
	});

	function onMediaLoad() {
		if (expectedMediaCount <= 0) {
			loadStore.load = 100;
			return;
		}

		const percentLoaded = Math.min(loadedMediaIndices.size / expectedMediaCount, 1);
		loadStore.load = percentLoaded * 90 + 10;
		// SAFARI: can't pause here, video needs to play for a bit
	}

	/* 
	---------
	SCROLLING
	---------
	*/
	const debouncedInertia = gsap.delayedCall(0.1, update).pause();

	// const debouncedInertia = debounce(update, 100, { maxWait: 200, trailing: true });
	$effect(() => {
		countStore.inertiaIndex;
		gptStore.opened;
		untrack(() => {
			if (timer) clearTimeout(timer);
		});
		return () => {
			document.removeEventListener('wheel', (event) => onScroll(event));
		};
	});

	// let reset = gsap.timeline();

	// function overScroll() {
	// 	reset.to(scrollStore, {
	// 		overScroll: 0,
	// 		duration: 0.5,
	// 		ease: 'power4.out'
	// 	});
	// }

	//rate limit the reset function
	// const debouncedOverscroll = gsap.delayedCall(0.15, overScroll).pause();
	const mapper = gsap.utils.mapRange(-2000, 2000, -5, 5);

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname !== '/gallery') {
				galleryScrollStore.set(0);
			}
		});
	});

	// Disable PostFX ghosting on work pages for mobile devices.
	// isMobileSafari already initialises persist factors to 0, but other mobile browsers
	// (Android Chrome, iOS Chrome) default to 0.7/0.9. Zero them out on the work route
	// so the ping-pong trail effect doesn't show during the detail view on mobile.
	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (!isMobile) return;
			if (page.url.pathname.includes('work')) {
				optionsStore.rgbPersistFactor = 0;
				optionsStore.alphaPersistFactor = 0;
			} else {
				optionsStore.rgbPersistFactor = 0.7;
				optionsStore.alphaPersistFactor = 0.9;
			}
		});
	});

	function handleVirtualScroll(deltaY: number) {
		if (page.url.pathname === '/') {
			return;
		}
		if (page.url.pathname === '/gallery') {
			const mappedDelta = mapper(deltaY);
			countStore.inertiaIndex += mappedDelta;
			galleryScrollStore.set(countStore.inertiaIndex);
			scrollStore.scroll = countStore.inertiaIndex;
		} else {
			const mappedDelta = mapper(deltaY) * 0.5;
			countStore.inertiaIndex += mappedDelta;
			debouncedInertia.restart(true);
		}
	}

	let lastSyncedScroll = -1;

	function syncWorkScroll() {
		const documentScrollRoot = document.scrollingElement ?? document.documentElement;
		const scrollRoot = page.url.pathname.includes('work')
			? documentScrollRoot
			: app && app.scrollHeight > app.clientHeight
				? app
				: documentScrollRoot;
		const currentScroll = page.url.pathname.includes('work')
			? Math.max(window.scrollY, documentScrollRoot?.scrollTop ?? 0)
			: page.url.pathname === '/'
				? window.scrollY
				: Math.max(window.scrollY, scrollRoot?.scrollTop ?? 0);
		if (currentScroll !== lastSyncedScroll) {
			lastSyncedScroll = currentScroll;
			scrollStore.scroll = currentScroll;
		}
		return currentScroll;
	}

	function onScroll(event: WheelEvent) {
		if (!loadStore.loaded || gptStore.opened || introGateStore.phase !== 'done') return;
		let deltaY = event.deltaY;
		if (event.deltaMode === WheelEvent.DOM_DELTA_PIXEL) {
			deltaY *= 1;
		} else if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) {
			deltaY *= 17;
		} else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) {
			deltaY *= 53;
		}
		if (page.url.pathname.includes('work')) return;

		handleVirtualScroll(deltaY);
	}

	function onTouchStart(event: TouchEvent) {
		if (!event.touches.length) return;
		touchStartY = event.touches[0].clientY;
		// Unlock all video elements on the very first user gesture (touchstart is
		// the earliest synchronous gesture context iOS Safari trusts for el.play()).
		// This must happen regardless of scroll state so even a tap unlocks videos.
		if (!videosUnlocked && page.url.pathname === '/') {
			videosUnlocked = true;
			console.log('[video:unlock] onTouchStart — unlocking', mediaEl.length, 'video(s)');
			mediaEl.forEach((el, i) => {
				if (el instanceof HTMLVideoElement) {
					console.log(
						`[video:unlock] el[${i}] readyState:${el.readyState} paused:${el.paused} src:${el.src?.slice(-40)}`
					);
					el.play()
						.then(() => console.log(`[video:unlock] el[${i}] play() ✓`))
						.catch((err: unknown) => console.warn(`[video:unlock] el[${i}] play() ✗`, err));
				}
			});
		}
		if (page.url.pathname === '/') {
			// Cancel any pending isTouchScrolling=false from a previous gesture
			// so rapid up/down swipes don't prematurely clear the flag mid-scroll.
			if (touchScrollTimer !== null) {
				clearTimeout(touchScrollTimer);
				touchScrollTimer = null;
			}
			countStore.isTouchScrolling = true;
		}
	}

	function onTouchEnd() {
		if (!countStore.isTouchScrolling) return;
		// Delay clears the scroll flag only after the ScrollTrigger snap animation
		// (60-120ms) has settled. Track the timer so onTouchStart can cancel it
		// if the user starts a new gesture before 300ms has elapsed.
		touchScrollTimer = setTimeout(() => {
			touchScrollTimer = null;
			countStore.isTouchScrolling = false;
		}, 300);
	}

	function onTouchMove(event: TouchEvent) {
		if (
			!loadStore.loaded ||
			gptStore.opened ||
			introGateStore.phase !== 'done' ||
			!event.touches.length
		)
			return;
		const currentY = event.touches[0].clientY;
		const deltaY = touchStartY - currentY;
		if (Math.abs(deltaY) < 1) return;
		touchStartY = currentY;
		const scaledDelta = Math.max(Math.min(deltaY * 10, 2000), -2000);
		if (page.url.pathname.includes('work')) return;
		if (!page.url.pathname.includes('work')) {
			// event.preventDefault();
		}
		handleVirtualScroll(scaledDelta);
	}

	function disableScroll(e: Event) {
		e.preventDefault();
	}

	$effect(() => {
		page.url.pathname;
		return untrack(() => {
			if (!wheelHandler || !touchStartHandler || !touchMoveHandler) return;
			const useVirtualScroll = !page.url.pathname.includes('work');
			if (useVirtualScroll) {
				document.addEventListener('wheel', wheelHandler, { passive: false });
				document.addEventListener('touchstart', touchStartHandler, { passive: true });
				document.addEventListener('touchmove', touchMoveHandler, { passive: false });
				document.addEventListener('touchend', touchEndHandler!, { passive: true });
				return () => {
					document.removeEventListener('wheel', wheelHandler!);
					document.removeEventListener('touchstart', touchStartHandler!);
					document.removeEventListener('touchmove', touchMoveHandler!);
					document.removeEventListener('touchend', touchEndHandler!);
				};
			}

			document.removeEventListener('wheel', wheelHandler);
			document.removeEventListener('touchstart', touchStartHandler);
			document.removeEventListener('touchmove', touchMoveHandler);
			document.removeEventListener('touchend', touchEndHandler!);
		});
	});

	$effect(() => {
		optionsStore.fullscreen;
		// 	loadStore.cardLoading;
		// 	page.params.slug;
		untrack(() => {
			if (optionsStore.fullscreen) {
				window.addEventListener('wheel', disableScroll, { passive: false });
				window.addEventListener('touchmove', disableScroll, { passive: false });
			} else {
				window.removeEventListener('wheel', disableScroll);
				window.removeEventListener('touchmove', disableScroll);
			}
		});
	});

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (!app || !page.url.pathname.includes('work')) return;
			if (app.scrollTop !== 0) app.scrollTop = 0;
		});
	});

	onMount(() => {
		initAnalytics();
		ambient.armOnFirstGesture();
		const unsubscribeProjectListHost = projectListHost.subscribe((host) => {
			currentProjectListHost = host;
			relocateProjectList(host);
		});
		if (browser && typeof navigator !== 'undefined' && isSafariUserAgent(navigator.userAgent)) {
			// Mobile Safari video textures stay blank until playback is allowed, so use
			// static thumbnails on all Safari.
			preferImageThumbnails = true;
		}
		if (page.params.slug) animationStore.isTransitioning = true;

		app = document.querySelector('.app') as HTMLDivElement;

		wheelHandler = (event: WheelEvent) => onScroll(event);
		touchStartHandler = (event: TouchEvent) => onTouchStart(event);
		touchMoveHandler = (event: TouchEvent) => onTouchMove(event);
		touchEndHandler = () => onTouchEnd();
		workScrollHandler = () => {
			if (page.url.pathname.includes('work') || page.url.pathname === '/') {
				syncWorkScroll();
			}
		};

		window.addEventListener('scroll', workScrollHandler, { passive: true });
		const onLinkHover = (event: MouseEvent) => {
			const link = (event.target as HTMLElement | null)?.closest?.('a[href]');
			if (!link || link.contains(event.relatedTarget as Node | null)) return;
			sfx.hover();
		};
		document.addEventListener('mouseover', onLinkHover);

		// Keyboard focus moves the Rive cursor; a moving mouse takes it back.
		let lastMouseMoveAt = 0;
		const onRealMouseMove = (event: MouseEvent) => {
			if (!event.movementX && !event.movementY) return;
			lastMouseMoveAt = performance.now();
			if (focusCursor.active) focusCursor.clear();
		};
		const onFocusIn = (event: FocusEvent) => {
			const el = event.target as HTMLElement | null;
			if (!el || el === document.body || introGateStore.phase !== 'done' || viewerStore.active)
				return;
			if (performance.now() - lastMouseMoveAt < 400) return;
			if (!el.matches?.(':focus-visible')) return;
			focusCursor.set(el);
		};
		const onFocusOut = () => focusCursor.clear();
		document.addEventListener('mousemove', onRealMouseMove, { passive: true });
		document.addEventListener('focusin', onFocusIn);
		document.addEventListener('focusout', onFocusOut);
		app?.addEventListener('scroll', workScrollHandler, { passive: true });
		// iOS delivers scroll events late during momentum scroll; poll every frame instead.
		// On the landing page this keeps the cards in step with the page while the list is unpinned.
		const pollWorkScroll = () => {
			const path = page.url.pathname;
			if (path.includes('work') || (isMobile && path === '/')) syncWorkScroll();
		};
		gsap.ticker.add(pollWorkScroll);

		//disable overflow
		// document.documentElement.classList.add('overflow-hidden');
		if (page.url.pathname === '/') {
			animationStore.isTransitioning = true;
			// } else {
			// document.documentElement.classList.remove('overflow-hidden');
		}

		return () => {
			document.removeEventListener('mouseover', onLinkHover);
			document.removeEventListener('mousemove', onRealMouseMove);
			document.removeEventListener('focusin', onFocusIn);
			document.removeEventListener('focusout', onFocusOut);
			unsubscribeProjectListHost();
			gsap.ticker.remove(pollWorkScroll);
			relocateProjectList(null);
			if (wheelHandler) document.removeEventListener('wheel', wheelHandler);
			if (touchStartHandler) document.removeEventListener('touchstart', touchStartHandler);
			if (touchMoveHandler) document.removeEventListener('touchmove', touchMoveHandler);
			if (touchEndHandler) document.removeEventListener('touchend', touchEndHandler);
			if (workScrollHandler) window.removeEventListener('scroll', workScrollHandler);
			if (workScrollHandler) app?.removeEventListener('scroll', workScrollHandler);
		};
	});
</script>

<svelte:window bind:innerWidth bind:innerHeight on:keydown={onKeyDown} />

<div class="app min-h-svh w-screen overflow-x-hidden overflow-y-hidden">
	<!-- Header -->
	<Nav bind:this={navComponent} revealed={showSiteChrome} />

	<!-- Main -->
	<main
		class="w-full overscroll-none z-10 relative flex flex-col items-center justify-center transition-opacity duration-500"
		class:mix-blend-difference={page.url.pathname !== '/branch'}
		class:pointer-events-none={page.url.pathname === '/' || page.url.pathname.includes('work')}
		class:opacity-0={gptStore.opened}
	>
		{#if showLoadingScreen}
			<div
				class="fixed inset-0 z-200 flex h-screen w-full items-center justify-center p-24 pointer-events-none"
				transition:scale={{ duration: 500, delay: 500, start: 0.5, easing: quintOut }}
			>
				<Loading />
			</div>
		{:else if data.projectsLength}
			{@render children()}
			{#if showProjectList}
				<div
					class="project-list-fallback relative w-full h-full"
					class:pointer-events-none={true}
					bind:this={projectListFallback}
				>
					<div
						bind:this={projectListWrapper}
						class:pointer-events-auto={page.url.pathname.includes('work') ||
							(page.url.pathname === '/' && $projectSectionStore.pinned)}
						class:pointer-events-none={page.url.pathname === '/' && !$projectSectionStore.pinned}
					>
						<ProjectList data={data as Required<PageData>} />
					</div>
				</div>
			{/if}
			<!-- inactivity -->
			<!-- {#if !page.params.slug && activityStore.inactive}
				<p
					transition:scale={{ duration: 500, start: 0.5, easing: quintOut }}
					class="text-white text-center text-xs leading-none mix-blend-difference fixed bottom-10"
				>
					scroll to browse
				</p>
			{/if} -->
		{/if}
	</main>

	<Notifications />
	<MediaViewer />
	<IntroStack />
	<!-- BG -->
	<div
		class="fixed w-screen h-lvh z-0 top-0 left-0 canvas-container transition-opacity duration-500 bg-black"
		class:invert={!optionsStore.dark}
		class:invert-0={optionsStore.dark}
		class:opacity-0={gptStore.opened &&
			page.url.pathname === '/' &&
			($introSectionStore.active || $introSectionStore.progress < 1)}
	>
		<Three bind:this={webGLComponent} {data} {preferImageThumbnails} />
	</div>
	<GPT
		bind:this={gptEl}
		{data}
		categoryAnim={webGLComponent ? webGLComponent.getRiveSceneInstance().categoryAnim : null}
	/>
	<!-- Footer -->
	<Footer bind:this={footerComponent} revealed={showSiteChrome} />

	<!-- Video Elements -->
	<div class="absolute top-0 w-52 pointer-events-none {showSource}">
		{#if data.projects}
			{#each data.projects as project, i}
				{#if project.thumbnail?.asset?.url && !(preferImageThumbnails && project.thumbnailImage?.asset?.url)}
					<video
						class="absolute w-full h-auto"
						style="transform: translateY({i}0%);"
						bind:this={mediaEl[i]}
						muted
						playsinline={true}
						autoplay
						controls={false}
						src={process.env.NODE_ENV === 'production'
							? project.thumbnail.asset.url
							: project.thumbnail.asset.url.replace(
									'https://cdn.sanity.io/files/rdnxsacz/production/',
									'/dev/'
								)}
						id={project.slug!.current}
						crossorigin="anonymous"
						loop
					></video>
				{/if}
				{#if preferImageThumbnails && project.thumbnailImage?.asset?.url}
					<img
						class="absolute w-full h-auto opacity-0"
						style="transform: translateY({i}0%);"
						bind:this={thumbnailEls[i]}
						src={withOptimizedThumbnail(project.thumbnailImage.asset.url)}
						id={`${project.slug!.current}-thumb`}
						alt=""
						loading="eager"
						decoding="async"
						crossorigin="anonymous"
					/>
				{/if}
			{/each}
		{/if}
	</div>
</div>

{#if browser && dev}
	<Debug pushMessage={gptEl.pushMessage} />
{/if}
