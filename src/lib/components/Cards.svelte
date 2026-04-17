<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { type IntersectionEvent } from '@threlte/extras';
	import { type Mesh, type ShaderMaterial, PlaneGeometry, type Texture, Vector2 } from 'three';
	import {
		animationStore,
		countStore,
		cursorStore,
		gptStore,
		loadStore,
		scrollStore
	} from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import fragmentShader from '../shaders/glitchFragment.glsl?raw';
	import vertexShader from '../shaders/vertexBend.glsl?raw';
	import gsap from 'gsap';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import {
		homePos,
		centerPos,
		enlarged,
		projectPage,
		initialPos,
		fullscreen
	} from '$lib/utils/positions';
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
	const shouldCoverTexture = $derived(home && !!homeAspectRatio);
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
	let transform = $state({ x: 0, y: 0, z: 0, scale: 1, opacity: 0 });
	let bendAmount = 0;
	let targetBend = 0;
	let rotationAmount = 0;
	let targetRotation = 0;
	let textureZoom = 1.0;
	let targetTextureZoom = 1.0;
	let textureRotation = 0.0;
	let targetTextureRotation = 0.0;

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
	let geometryArgs = $state([1000, 1000 / (16 / 9)]);

	// const currentProject = $derived(page.params.slug || index === countStore.activeIndex || works);

	// change transform based on page state
	$effect(() => {
		initialLoadComplete;
		// this make sures the effect only runs when initialLoadComplete actually changes value.
		let prevInitialLoad = initialLoadComplete;
		works;
		return () => {
			if (prevInitialLoad !== initialLoadComplete) {
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
			// intro section owns the homepage hero before the cards take over
			(home && ($introSectionStore.active || $introSectionStore.progress < 1)) ||
			// not current project in the work page - hide ALL home cards on work pages
			(!works && page.url.pathname.includes('work')) ||
			// on home but before current index
			(index < countStore.activeIndex && page.url.pathname === '/') ||
			// in fullscreen but not this image
			(optionsStore.fullscreen && !full) ||
			// during gallery transition
			loadStore.galleryTransitioning ||
			// in gallery page TODO: change this
			page.route.id?.includes('gallery') ||
			// on home but before current index (only applies to home page)
			(page.url.pathname === '/' && index < countStore.activeIndex)
	);

	function tweenOpacity(targetOpacity: number, ease: string) {
		gsap.killTweensOf(transform, 'opacity');
		gsap.to(transform, {
			opacity: targetOpacity,
			duration: 0.3,
			ease,
			onComplete: () => {
				if (countStore.activeIndex === index)
					console.log('[CARD OPACITY TWEEN COMPLETE]', index, targetOpacity);
			}
		});
	}

	$effect(() => {
		hidden;
		initialLoadComplete;
		loadIn;
		untrack(() => {
			if (countStore.activeIndex === index) console.log('[CARD VISIBILITY]', index, hidden);
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
		untrack(() => {
			if (loadIn || !initialLoadComplete) return;
			updateImage(0, 0.01);
		});
	});

	// update image on transition & fullscreen status
	$effect(() => {
		prevParams;
		page.params.slug;
		page.url.hash;
		// optionsStore.fullscreen;
		untrack(() => {
			// Don't run during initial load animation
			if (!initialLoadComplete && !works) return;

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
		untrack(() => {
			if (loadIn || !initialLoadComplete) return;
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

	function handleClick(event: IntersectionEvent<'click'>, index: number) {
		if (hidden) return;

		// Don't handle click if it originated from an interactive element
		// The pointer property contains normalized coordinates, we need screen coordinates
		// Convert from normalized device coordinates (-1 to 1) to screen coordinates
		if (event.pointer) {
			const x = ((event.pointer.x + 1) / 2) * window.innerWidth;
			const y = (-(event.pointer.y - 1) / 2) * window.innerHeight;
			const domTarget = document.elementFromPoint(x, y) as HTMLElement;
			if (
				domTarget &&
				(domTarget.tagName === 'BUTTON' ||
					domTarget.tagName === 'A' ||
					domTarget.closest('button') ||
					domTarget.closest('a'))
			) {
				return;
			}
		}

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
			// if index is same
		} else if (countStore.activeIndex === index && !page.params.slug) {
			// if in home & selected
			if (slug === 'reels') {
				goto('/#reels');
			} else {
				goto(`/work/${slug}`);
			}
			// if in home make as selected
		} else if (!page.params.slug) {
			countStore.inertiaIndex = index;
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
		aberrationIntensity = 1;
	}

	// Update image position and scale based on current state
	function updateImage(delay = 0, duration = 0.01, callback?: () => void) {
		if (!loadStore.loaded || suppressUpdates) return;
		if (countStore.activeIndex === index) console.log('[CARD UPDATE]', index);
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

		aberrationIntensity = works ? 0.0 : Math.max(0.0, aberrationIntensity - 0.05);
		imageMat.uniforms.u_aberrationIntensity.value = aberrationIntensity;

		// Smooth bend transition - return to 0 when not scrolling
		// Use scrollStore.velocity for works page, countStore.inertiaIndex for home page
		const velocitySource = works
			? Math.abs(scrollStore.velocity)
			: Math.abs(countStore.inertiaIndex - countStore.activeIndex) * 10000; // Scale inertia to similar range as velocity

		// Use eased curve for bend - slow changes = minimal bend, fast changes = strong bend
		// Apply cubic curve for steeper ease-in, making slow movements nearly invisible
		const normalizedVelocity = Math.min(1, velocitySource / 5000); // Normalize to 0-1 range
		const easedVelocity = normalizedVelocity > 0.1 ? Math.pow(normalizedVelocity, 3) : 0;
		// Add threshold to ignore very small movements and prevent jitter
		targetBend = easedVelocity * 50;
		bendAmount += (targetBend - bendAmount) * 0.15; // Increased from 0.1 for smoother interpolation
		imageMat.uniforms.uBendAmplitude.value = bendAmount;

		// Update screen position for bend calculation
		// transform.y is world position, scrollStore.scroll is how much we've scrolled
		// To get viewport position: world Y + scroll offset
		const viewportY = transform.y + scrollStore.scroll;
		imageMat.uniforms.uScreenPosition.value.set(transform.x, viewportY);
		imageMat.uniforms.uScreenCenter.value.set(0, scrollStore.scroll); // Center moves with scroll

		// Calculate rotation based on screen position
		// Normalize x position to -1 to 1 range
		const normalizedX = transform.x / ($size.width / 2);
		// Only rotate if significantly off-center AND scrolling/moving (works page only)
		const rotationStrength =
			works && velocitySource > 0.1 && Math.abs(normalizedX) > 0.3 ? normalizedX : 0;
		targetRotation = rotationStrength * 0.15;
		rotationAmount += (targetRotation - rotationAmount) * 0.1;
		imageMat.uniforms.uRotation.value = rotationAmount;
		imageMat.uniforms.uEnableRoll.value = works;

		// Texture zoom: scale up when moving (1.0 to 1.25)
		const zoomEasedVelocity = normalizedVelocity > 0.05 ? Math.pow(normalizedVelocity, 3) : 0; // Cubic for more noticeable zoom
		targetTextureZoom = 1.0 + zoomEasedVelocity * 0.25; // Max 1.25 scale
		textureZoom += (targetTextureZoom - textureZoom) * 0.03; // Much slower interpolation
		imageMat.uniforms.uTextureZoom.value = textureZoom;

		// Texture rotation: rotate slower than card, with higher easing
		const textureRotationEased = normalizedVelocity > 0.1 ? Math.pow(normalizedVelocity, 3) : 0; // Cubic for more visible effect
		const textureRotationStrength = Math.abs(normalizedX) > 0.3 ? normalizedX : 0;
		targetTextureRotation = textureRotationStrength * textureRotationEased * 0.2; // Increased from 0.1
		textureRotation += (targetTextureRotation - textureRotation) * 0.03; // Much slower interpolation
		imageMat.uniforms.uTextureRotation.value = textureRotation;
		imageMat.uniforms.inverted.value = optionsStore.dark ? 0.0 : 1.0;
		imageMat.uniformsNeedUpdate = true;
	});

	onMount(() => {
		texture.needsUpdate = true;
		// const html = document.documentElement;
		// scrollStore.scroll = html.scrollTop;

		initialLoadComplete = true;
		loadIn = false;
		if (!works) {
			queueMicrotask(() => updateImage(0, 0.01));
		}
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
		untrack(() => {
			if (currentPath === '/' && lastPathname?.includes('work') && initialLoadComplete && !loadIn) {
				const rerun = () => updateImage(0, 0.5);
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
			geometryArgs = [...expected, 32, 32];
			if (imageGeo && image) {
				imageGeo.dispose();
				const newGeo = new PlaneGeometry(...geometryArgs);
				image.geometry = newGeo;
				imageGeo = newGeo;
			}
		}
		updateAspectUniforms(textureAspectVal);
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

			gsap.to(transform, {
				...initialPos(index),
				duration: 0.5,
				ease: 'power3.out',
				onComplete: () => {
					goto('/').then(() => {
						isNavigating = false;
						suppressUpdates = false;
					});
				}
			});
		} else if (
			to.url.pathname.includes('work') &&
			!isNavigating &&
			countStore.activeIndex === index
		) {
			suppressUpdates = true;
			cancel();
			isNavigating = true;
			const tl = gsap.timeline();
			tl.to(transform, {
				scale: transform.scale * 0.75,
				ease: 'power3.out',
				duration: 0.3,
				onComplete: () => {
					goto(to.url).then(() => {
						isNavigating = false;
						suppressUpdates = false;
						updateImage(0, 0.5);
					});
				}
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
			scale: { value: 1 },
			inverted: { value: optionsStore.dark ? 0.0 : 1.0 },
			opacity: { value: 0.0 }
		}}
		transparent={true}
		depthWrite={false}
		{vertexShader}
		{fragmentShader}
	/>
</T.Mesh>
