<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { type IntersectionEvent } from '@threlte/extras';
	import { type Mesh, type ShaderMaterial, PlaneGeometry, type Texture, Vector2 } from 'three';
	import {
		animationStore,
		countStore,
		cursorStore,
		currentHomeCardSnapshotStore,
		gptStore,
		homeTransitionStore,
		loadStore,
		sharedCardTransitionStore,
		scrollStore
	} from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import fragmentShader from '../shaders/glitchFragment.glsl?raw';
	import vertexShader from '../shaders/vertexBend.glsl?raw';
	import gsap from 'gsap';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
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
				transform = initialLoadComplete
					? works
						? projectPage(index, $size, works, imageGeo, $size.width)
						: centerPos(index)
					: initialPos(index);
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
		untrack(() => {
			if (hidden) {
				tweenOpacity(0, 'power2.out');
			} else if (initialLoadComplete && !loadIn) {
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
			if (works && !hidden && !full) {
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
			updateImage(0.2, 0.5, () => {
				loadIn = false;
				animationStore.isTransitioning = false;
			});
		});
	});

	// homepage && agent modal state card update
	$effect(() => {
		countStore.inertiaIndex;
		gptStore.opened;
		loadStore.galleryTransitioning;
		handoffInProgress;
		untrack(() => {
			if (loadIn || !initialLoadComplete || handoffInProgress) return;
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

	function updateFullscreen(bool: boolean, updateStore = true) {
		if (updateStore) optionsStore.fullscreen = bool;
		const el = document.getElementById(`${slug}${works ? '-' + index : ''}`);
		if (el instanceof HTMLVideoElement) {
			el.muted = !bool;
			el.currentTime = 0;
			if (bool) el.play();
		}
		full = bool;
		if (bool) {
			gsap.to(img, {
				scale: 1
			});
			// we have to set timeout here so the click doesn't run this too on the same event loop
			setTimeout(() => document.addEventListener('click', escapeListener), 0);
			window.addEventListener('keydown', escapeListener);
		} else {
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
					updateImage(0, 0.5);
				});
			}
		});
	}

	function handleClick(event: IntersectionEvent<'click'>, index: number) {
		if (hidden) return;

		event.stopPropagation();
		// stopPropagation = true;
		// If in enlarged mode, make it smaller
		if (full && slug !== 'reels') {
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
			transform = {
				...transform,
				...homePos(index, imageGeo, $size),
				opacity: 0
			};
		});
	});

	function syncWorkTransform() {
		if (!works || !imageGeo || hidden || full) return;
		transform = {
			...transform,
			...projectPage(index, $size, works, imageGeo, $size.width)
		};
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
		}

		if (!data.projectsLength) return;
		gsap.killTweensOf(transform);
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
			? velocityToMotionProgress(scrollStore.velocity, 650)
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
			bendMax: works ? 60 : 50,
			rotationMax: works ? 0.17 : 0.15,
			zoomMax: works ? 0.18 : 0.25,
			textureRotationMax: works ? 0.095 : 0.1,
			threshold: works ? 0.045 : 0.1
		});
		imageMat.uniforms.uBendAmplitude.value = motionState.bendAmount;
		imageMat.uniforms.uRotation.value = motionState.rotationAmount;
		imageMat.uniforms.uEnableRoll.value = works;
		imageMat.uniforms.uTextureZoom.value = motionState.textureZoom;
		imageMat.uniforms.uTextureRotation.value = motionState.textureRotation;
		const isWorkDetailCard = works && index > 0;
		const invertAfterOutput = isWorkDetailCard && !optionsStore.dark;
		imageMat.uniforms.uApplyOutputColorSpace.value = isWorkDetailCard;
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
		const syncInitialPosition = () => updateImage(0, 0.01);
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

	// Ensure suppressed updates are released once we land back on the home page
	$effect(() => {
		suppressUpdates;
		page.url.pathname;
		untrack(() => {
			if (!suppressUpdates || page.url.pathname !== '/') return;
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
			queueMicrotask(() => syncWorkTransform());
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
</script>

<T.Mesh
	bind:ref={image as Mesh}
	scale={transform.scale}
	position={[transform.x, transform.y, transform.z]}
	onclick={(e: IntersectionEvent<'click'>) => {
		handleClick(e, index);
	}}
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
			uApplyOutputColorSpace: { value: works && index > 0 },
			uInvertAfterOutputColorSpace: { value: works && index > 0 && !optionsStore.dark },
			scale: { value: 1 },
			inverted: { value: !optionsStore.dark && !(works && index > 0) ? 1.0 : 0.0 },
			opacity: { value: 0.0 }
		}}
		transparent={true}
		depthWrite={false}
		{vertexShader}
		{fragmentShader}
	/>
</T.Mesh>
