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
	import vertexShader from '../shaders/vertex.glsl?raw';
	import gsap from 'gsap';
	import { beforeNavigate, goto } from '$app/navigation';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { homePos, centerPos, enlarged, projectPage, initialPos } from '$lib/utils/positions';
	import { type PageData } from '../../routes/$types';

	let easeFactor = 0.02;
	let imageMat = $state() as ShaderMaterial;
	let imageGeo = $state() as PlaneGeometry;
	let {
		texture,
		index,
		works,
		home = false,
		gallery = false,
		data
	}: {
		texture: Texture;
		index: number;
		works: boolean;
		gallery?: boolean;
		home?: boolean;
		data: Required<PageData>;
	} = $props();
	const slug = $derived(works ? page.params.slug : data.projects[index].slug.current.toString());
	const img = { scale: 1 };
	const { size } = useThrelte();
	let image: Mesh | null = $state(null);
	let loadIn = $state(true);
	let initialLoadComplete = $state(false);
	let full = $state(false);
	let prevParams = $state('');
	let aberrationIntensity = 0.0;
	let mousePosition = { x: 0.5, y: 0.5 };
	let targetMousePosition = { x: 0.5, y: 0.5 };
	let prevPosition = { x: 0.5, y: 0.5 };
	let transform = $state({ x: 0, y: 0, z: 0, scale: 1, opacity: 0 });

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
		// not current project in the work page
		(!works && page.url.pathname.includes('work')) ||
			// on home but before current index
			(index < countStore.activeIndex && !page.params.slug) ||
			// in fullscreen but not this image
			(optionsStore.fullscreen && !full) ||
			// gpt modal opened
			gptStore.opened ||
			// during gallery transition
			loadStore.galleryTransitioning ||
			// in gallery page TODO: change this
			page.route.id?.includes('gallery')
	);

	// Update image on scroll or size changes
	$effect(() => {
		scrollStore.scroll;
		$size;
		loadIn;
		untrack(() => {
			if (loadIn || !initialLoadComplete) return;
			updateImage(0, 0.1);
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
			updateImage(0.2, 0.5, () => {
				loadIn = false;
				animationStore.isTransitioning = false;
			});
		});
	});

	// homepage card update
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
			updateImage(0, 0.5);
		});
	});

	//theme
	$effect(() => {
		imageMat.uniforms.inverted.value = !optionsStore.dark;
		// untrack(() => console.log(slug, works, 'inverted:', imageMat.uniforms.inverted.value));
	});
	function updateFullscreen(bool: boolean, updateStore = true) {
		if (updateStore) optionsStore.fullscreen = bool;
		const el = document.getElementById(`${slug}${works ? '-' + index : ''}`);
		if (el instanceof HTMLVideoElement) {
			el.muted = !bool;
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

	// if (index === 0) $inspect(transform.scale);

	function handleClick(event: IntersectionEvent<'click'>, index: number) {
		console.log('click');
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
		} else if (page.params.slug && !full) {
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
		if (!loadStore.loaded) return;
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
			// if work page & work card
		} else if (works) {
			console.log('[WORK PAGE UPDATE]', index);
			pos = projectPage(index, $size, works, imageGeo, $size.width);
		} else if (optionsStore.fullscreen) {
			pos = enlarged(index, 0);
		}

		if (!data.projectsLength) return;
		gsap.to(transform, {
			...pos,
			delay,
			duration,
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

		imageMat.uniforms.u_prevMouse.value.set(prevPosition.x, prevPosition.y);

		aberrationIntensity = works ? 0.0 : Math.max(0.0, aberrationIntensity - 0.05);
		imageMat.uniforms.u_aberrationIntensity.value = aberrationIntensity;
	});

	// Initial load animation effect
	$effect(() => {
		loadStore.loaded;
		imageGeo;
		untrack(() => {
			if (!loadStore.loaded || initialLoadComplete || works || !imageGeo) return;

			// Stagger the animation based on index with longer delays
			const delay = 0.5 + index * 0.1;

			gsap.to(transform, {
				...homePos(index, imageGeo, $size),
				delay,
				duration: 1.2,
				ease: 'power3.out',
				onComplete: () => {
					initialLoadComplete = true;
					loadIn = false;
				}
			});
		});
	});

	onMount(() => {
		texture.needsUpdate = true;
		const html = document.documentElement;
		scrollStore.scroll = html.scrollTop;

		// If it's a work page image, skip the initial animation
		if (works) {
			initialLoadComplete = true;
			loadIn = false;
		}
		// if ($page.params.slug) {
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
			let w = $size.width * 0.5;
			let h = ($size.width / aspect) * 0.5;
			if (h > $size.width) {
				w = $size.width * aspect * 0.5;
				h = $size.width * 0.5;
			}
			expected = [w, h];
		} else {
			expected = [$size.width * 0.5, ($size.width / (16 / 9)) * 0.5];
		}
		if (geometryArgs[0] !== expected[0] || geometryArgs[1] !== expected[1]) {
			geometryArgs = expected;
			if (imageGeo && image) {
				imageGeo.dispose();
				const newGeo = new PlaneGeometry(...expected);
				image.geometry = newGeo;
				imageGeo = newGeo;
			}
		}
	});

	// exit transition to home
	beforeNavigate(({ to, cancel }) => {
		if (!to) return;
		if (to.url.toString() === '/') {
			cancel();
			updateFullscreen(false);
			scrollTo(0, 0);
			// console.log('[EXIT]', index);
			updateImage(1, 0.5, () => goto('/'));
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
	<T.PlaneGeometry bind:ref={imageGeo} args={geometryArgs} />

	<T.ShaderMaterial
		bind:ref={imageMat}
		uniforms={{
			u_mouse: { value: new Vector2() },
			u_prevMouse: { value: new Vector2() },
			u_aberrationIntensity: { value: 0.0 },
			u_texture: { value: texture },
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
			scale: { value: 1 },
			inverted: { value: !optionsStore.dark },
			opacity: { value: 0.0 }
		}}
		transparent={true}
		{vertexShader}
		{fragmentShader}
	/>
</T.Mesh>
