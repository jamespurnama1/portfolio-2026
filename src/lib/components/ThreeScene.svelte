<script lang="ts">
	import { useThrelte, useLoader, T } from '@threlte/core';
	import { pointerInteractivity } from '$lib/utils/interactivity';
	import {
		VideoTexture,
		type Texture,
		TextureLoader,
		type Mesh,
		CanvasTexture,
		RGBFormat,
		SRGBColorSpace,
		PerspectiveCamera,
		LinearFilter,
		LinearMipmapLinearFilter
	} from 'three';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { countStore, loadStore } from '$lib/stores/index.svelte';
	import { cardDimensionsStore } from '$lib/stores/cardDimensions.svelte';
	import { untrack, onDestroy, onMount } from 'svelte';
	import Cards from './Cards.svelte';
	import IntroGridScene from './IntroGridScene.svelte';
	import { page } from '$app/state';
	import type { PageData } from '../../routes/$types';
	import { beforeNavigate } from '$app/navigation';

	let {
		data,
		preferImageThumbnails = false,
		mouse = { x: 0, y: 0 }
	}: {
		data: PageData;
		preferImageThumbnails?: boolean;
		mouse?: { x: number; y: number };
	} = $props();
	const textures: Texture[] = $state([]);
	let imageTextures: Array<Texture | Promise<Texture>> = $state([]);
	const { camera, canvas, renderer, size } = useThrelte();
	const { load: loadTexture } = useLoader(TextureLoader);
	let perspectiveCamera: PerspectiveCamera | undefined = $state();
	const interactivityContext = pointerInteractivity(() => perspectiveCamera);
	let postFXMesh: Mesh | undefined = $state();
	let gradientMesh: Mesh | undefined = $state();
	let gradientTexture = $state<CanvasTexture>();

	const GRADIENT_HEIGHT_RATIO = 0.15;
	const MOBILE_BREAKPOINT = 768;
	const TABLET_BREAKPOINT = 1024;
	const GRADIENT_WIDTH_OVERSCAN = 1.08;

	renderer.outputColorSpace = SRGBColorSpace;
	renderer.setPixelRatio(devicePixelRatio || 1);

	const videoBank: Array<HTMLVideoElement> = [];
	let sanityImageParams = $state('auto=format&fit=max&q=85&w=1920');

	function configureColorTexture(texture: Texture, { isVideo = false } = {}) {
		texture.colorSpace = SRGBColorSpace;
		texture.magFilter = LinearFilter;
		texture.minFilter = isVideo ? LinearFilter : LinearMipmapLinearFilter;
		texture.generateMipmaps = !isVideo;
		texture.premultiplyAlpha = false;
		texture.anisotropy = Math.min(renderer.capabilities.getMaxAnisotropy(), 8);
		texture.needsUpdate = true;
		return texture;
	}

	function disposeTextureList(items: Texture[]) {
		items.forEach((tex) => {
			if (tex && typeof tex.dispose === 'function') {
				tex.dispose();
			}
		});
	}

	function disposeResolvedWorkTextures() {
		imageTextures.forEach((tex) => {
			if (tex instanceof Promise) return;
			if (tex && typeof tex.dispose === 'function') {
				tex.dispose();
			}
		});
		imageTextures = [];
		cardDimensionsStore.set([]);
	}

	function cleanupWorkVideoBank() {
		videoBank.forEach((video) => {
			video.pause();
			if (video.parentNode) video.parentNode.removeChild(video);
		});
		videoBank.length = 0;
	}

	$effect(() => {
		const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
		const baseWidth = $size.width || fallbackWidth;
		const targetWidth = Math.min(Math.max(Math.round(baseWidth || 1920), 480), 2560);
		sanityImageParams = `auto=format&fit=max&q=85&w=${targetWidth}`;
	});

	function withSanityImageParams(url: string) {
		if (!url || /\.(mp4|webm)$/i.test(url) || !url.includes('cdn.sanity.io')) {
			return url;
		}
		return `${url}${url.includes('?') ? '&' : '?'}${sanityImageParams}`;
	}

	async function loadImageTexture(url: string) {
		const texture = await loadTexture(url);
		return configureColorTexture(texture);
	}

	function isVideoUrl(url: string) {
		return /\.(mp4|webm)$/i.test(url);
	}

	function initGradientTexture() {
		if (gradientTexture || typeof document === 'undefined') return;
		const canvas = document.createElement('canvas');
		canvas.width = 256;
		canvas.height = 256;
		const texture = new CanvasTexture(canvas);
		texture.needsUpdate = true;
		gradientTexture = texture;
		updateGradientTexture();
	}

	function updateGradientTexture() {
		if (!gradientTexture) return;
		const canvas = gradientTexture.image as HTMLCanvasElement | undefined;
		const ctx = canvas?.getContext('2d');
		if (!canvas || !ctx) return;
		const color = '0,0,0';
		ctx.clearRect(0, 0, canvas.width, canvas.height);

		const verticalGradient = ctx.createLinearGradient(0, canvas.height, 0, 0);
		verticalGradient.addColorStop(0.45, `rgba(${color}, 1)`);
		verticalGradient.addColorStop(1, `rgba(${color}, 0)`);
		ctx.fillStyle = verticalGradient;
		ctx.fillRect(0, 0, canvas.width, canvas.height);

		const horizontalMask = ctx.createLinearGradient(0, 0, canvas.width, 0);
		horizontalMask.addColorStop(0, 'rgba(0, 0, 0, 0)');
		horizontalMask.addColorStop(0.18, 'rgba(0, 0, 0, 1)');
		horizontalMask.addColorStop(0.82, 'rgba(0, 0, 0, 1)');
		horizontalMask.addColorStop(1, 'rgba(0, 0, 0, 0)');
		ctx.globalCompositeOperation = 'destination-in';
		ctx.fillStyle = horizontalMask;
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.globalCompositeOperation = 'source-over';

		gradientTexture.needsUpdate = true;
	}

	function updateGradientPlaneTransform() {
		if (!gradientMesh) return;
		const fallbackWidth = typeof window !== 'undefined' ? window.innerWidth : 1920;
		const fallbackHeight = typeof window !== 'undefined' ? window.innerHeight : 1080;
		const width = $size.width || fallbackWidth;
		const height = $size.height || fallbackHeight;
		const gptRestingWidthRatio =
			width >= TABLET_BREAKPOINT ? 0.6 : width >= MOBILE_BREAKPOINT ? 0.7 : 0.75;
		const gradientWidth = Math.max(width * gptRestingWidthRatio * GRADIENT_WIDTH_OVERSCAN, 1);
		const gradientHeight = Math.max(height * GRADIENT_HEIGHT_RATIO, 1);
		const gradientCenterX = width < MOBILE_BREAKPOINT ? width / 2 - gradientWidth / 2 : 0;
		gradientMesh.scale.set(gradientWidth, gradientHeight, 1);
		gradientMesh.position.set(gradientCenterX, -height / 2 + gradientHeight / 2, 5);
		gradientMesh.renderOrder = 999;
	}

	function updateGradientRenderMode() {
		if (!gradientMesh) return;
		gradientMesh.userData = gradientMesh.userData ?? {};
		gradientMesh.userData.skipPostFX = page.url.pathname.includes('work');
	}

	function waitForVideoData(video: HTMLVideoElement) {
		if (
			video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA &&
			video.videoWidth > 0 &&
			video.videoHeight > 0
		) {
			return Promise.resolve();
		}

		return new Promise<void>((resolve) => {
			const finalize = () => {
				video.removeEventListener('loadeddata', onReady);
				video.removeEventListener('canplay', onReady);
				video.removeEventListener('error', onReady);
				resolve();
			};

			const onReady = () => finalize();

			video.addEventListener('loadeddata', onReady, { once: true });
			video.addEventListener('canplay', onReady, { once: true });
			video.addEventListener('error', onReady, { once: true });

			const playPromise = video.play();
			if (playPromise?.catch) {
				playPromise.catch(() => {});
			}
		});
	}

	async function createVideoTexture(video: HTMLVideoElement) {
		await waitForVideoData(video);
		const texture = new VideoTexture(video);
		texture.format = RGBFormat;
		return configureColorTexture(texture, { isVideo: true });
	}

	async function videoLoader(str: string, index: number, id = false) {
		let video: HTMLVideoElement | null;
		if (id) {
			video = document.getElementById(str) as HTMLVideoElement;
		} else {
			video = document.createElement('video');
			video.id = `${page.params.slug}-${index}`;
			video.src = str;
			video.autoplay = true;
			video.muted = true;
			video.preload = 'auto';
			video.playsInline = true;
			video.crossOrigin = 'anonymous';
			video.loop = true;
			document.body.appendChild(video);
			video.style.visibility = 'hidden';
			videoBank.push(video);
		}

		if (!video) {
			throw new Error(`Video element not found for ${str}`);
		}

		return createVideoTexture(video);
	}

	beforeNavigate(() => {
		cleanupWorkVideoBank();
	});

	// Calculate camera to match orthographic viewport
	const cameraZ = $derived.by(() => {
		// Fixed distance that works well with the orthographic plane
		return 600;
	});

	// Calculate FOV to match orthographic frustum at cameraZ distance
	const fov = $derived.by(() => {
		// tan(fov/2) = (height/2) / distance
		// fov = 2 * atan((height/2) / distance)
		const vFOV = 2 * Math.atan($size.height / (2 * cameraZ)) * (180 / Math.PI);
		return vFOV;
	});

	$effect(() => {
		$size;
		untrack(() => {
			if (!$camera || !renderer || !$size.width || !$size.height) return;
			if ($camera instanceof PerspectiveCamera) {
				$camera.aspect = ($size.width || 1) / ($size.height || 1);
				$camera.fov = fov;
				$camera.position.z = cameraZ;
				$camera.updateProjectionMatrix();
			}
			renderer.setSize($size.width, $size.height, false);
		});
	});

	// textures
	let textureLoadGeneration = 0;

	$effect(() => {
		loadStore.loaded;
		data.projects;
		preferImageThumbnails;
		untrack(async () => {
			if (!loadStore.loaded || !data.projects) return;
			const generation = ++textureLoadGeneration;
			const nextTextures: Texture[] = [];

			for (let i = 0; i < data.projects.length; i++) {
				const project = data.projects[i];
				const thumbnailUrl = project.thumbnailImage?.asset?.url
					? withSanityImageParams(project.thumbnailImage.asset.url)
					: null;
				if (preferImageThumbnails && thumbnailUrl) {
					try {
						nextTextures[i] = configureColorTexture(await loadTexture(thumbnailUrl));
						continue;
					} catch (error) {
						console.error(
							'Thumbnail image texture load failed, falling back to video',
							project.slug?.current,
							error
						);
					}
				}
				nextTextures[i] = await videoLoader(project.slug.current, i, true);
			}

			if (generation !== textureLoadGeneration) {
				disposeTextureList(nextTextures);
				return;
			}

			disposeTextureList(textures);
			textures.length = 0;
			nextTextures.forEach((tex) => textures.push(tex));
		});
	});

	function useWorkCardMedia(x: any) {
		let url = '';
		if (x.video?.url) {
			url = x.video.url;
		} else if (x.image?.url) {
			url = x.image.url;
		} else if (!optionsStore.dark && x.imageLight?.url) {
			url = x.imageLight.url;
		} else if (x.imageLight?.url) {
			url = x.imageLight.url;
		}
		return withSanityImageParams(url);
	}

	async function handleWorkCards() {
		loadStore.cardLoading = true;
		disposeResolvedWorkTextures();
		cleanupWorkVideoBank();
		const current = data!.projects!.find((x) => x.slug.current === page.params.slug)!;
		const promises: Promise<Texture>[] = [];
		const dimensions: { width: number; height: number }[] = [];
		current.content.forEach((x, i) => {
			let url = useWorkCardMedia(x);
			if (!url.length) {
				console.warn('No valid media URL found for content item', i, x);
				return;
			}
			if (/\.(mp4|webm)$/.test(url)) {
				const promise = videoLoader(url, i).then((texture) => {
					const video = document.getElementById(
						`${page.params.slug}-${i}`
					) as HTMLVideoElement | null;
					if (video) {
						dimensions[i] = { width: video.videoWidth, height: video.videoHeight };
					} else {
						dimensions[i] = { width: 0, height: 0 };
					}
					return texture;
				});
				imageTextures.push(promise);
				promises.push(promise);
			} else {
				const promise = loadImageTexture(url).then((texture) => {
					if (texture.image) {
						dimensions[i] = {
							width: texture.image.naturalWidth || texture.image.width || 0,
							height: texture.image.naturalHeight || texture.image.height || 0
						};
					} else {
						dimensions[i] = { width: 0, height: 0 };
					}
					return texture;
				});
				imageTextures.push(promise);
				promises.push(promise);
			}
		});
		if (promises.length > 0) {
			await Promise.all(promises);
		}
		cardDimensionsStore.set(dimensions);
		loadStore.cardLoading = false;
	}

	onMount(() => {
		initGradientTexture();
		updateGradientPlaneTransform();
		updateGradientRenderMode();
	});

	$effect(() => {
		optionsStore.dark;
		if (!loadStore.loaded || !data.projects || !page.route.id?.includes('work')) return;
		untrack(() => handleWorkCards());
	});

	$effect(() => {
		optionsStore.dark;
		untrack(() => updateGradientTexture());
	});

	$effect(() => {
		$size;
		gradientMesh;
		untrack(() => updateGradientPlaneTransform());
	});

	$effect(() => {
		page.url.pathname;
		gradientMesh;
		untrack(() => updateGradientRenderMode());
	});

	// Update textures on theme change
	// $effect(() => {
	// 	optionsStore.dark;
	// 	page.params.slug;
	// 	untrack(async () => {
	// 		if (!loadStore.loaded || !data.projects || !page.route.id?.includes('work')) return;
	// 		loadStore.cardLoading = true;
	// 		const { load } = useLoader(TextureLoader);
	// 		const current = data.projects.find((x) => x.slug.current === page.params.slug)!;
	// 		imageTextures = [];
	// 		const promises: Promise<Texture>[] = [];
	// 		current.content.forEach((x, i) => {
	// 			let url = useLightImage(x, i);
	// 			if (!url.length) {
	// 				console.warn('No valid media URL found for content item', i, x);
	// 				return;
	// 			}
	// 			if (/\.(mp4|webm)$/.test(url)) {
	// 				const texture = videoLoader(url, i);
	// 				imageTextures.push(texture);
	// 			} else {
	// 				const promise = load(url).then((texture) => {
	// 					texture.colorSpace = SRGBColorSpace;
	// 					return texture;
	// 				});
	// 				imageTextures.push(promise);
	// 				promises.push(promise);
	// 			}
	// 		});
	// 		if (promises.length > 0) {
	// 			await Promise.all(promises);
	// 		}
	// 		loadStore.cardLoading = false;
	// 	});
	// });

	onDestroy(() => {
		interactivityContext.target.set(undefined);
		cleanupWorkVideoBank();
		// Dispose all loaded textures
		textures.forEach((tex) => {
			if (tex && typeof tex.dispose === 'function') tex.dispose();
		});
		disposeResolvedWorkTextures();
		if (postFXMesh && typeof postFXMesh.geometry?.dispose === 'function')
			postFXMesh.geometry.dispose();
		// Optionally clear arrays
		textures.length = 0;
	});
</script>

<T.PerspectiveCamera bind:ref={perspectiveCamera} makeDefault position={[0, 0, cameraZ]} {fov} />
{#if page.url.pathname === '/'}
	<IntroGridScene {mouse} />
{/if}
{#if textures.length && data}
	{#each textures as texture, i}
		{#if page.url.pathname === '/'}
			{#key `home-card-${i}`}
				<Cards
					{texture}
					index={i}
					data={data as Required<PageData>}
					home={true}
					works={false}
					homeAspectRatio={preferImageThumbnails ? 16 / 9 : undefined}
				/>
			{/key}
		{:else if page.url.pathname.includes('work') && i === countStore.activeIndex}
			{#key `work-hero-${page.params.slug}-${i}`}
				<Cards
					{texture}
					index={0}
					data={data as Required<PageData>}
					home={false}
					works={true}
					homeAspectRatio={preferImageThumbnails ? 16 / 9 : undefined}
				/>
			{/key}
		{/if}
	{/each}
{/if}

{#if page.url.pathname.includes('work') && data}
	{#each imageTextures as texture, i}
		{#if texture instanceof Promise}
			{#await texture then x}
				{#key `work-detail-${page.params.slug}-${i}`}
					<Cards texture={x} index={i + 1} works={true} data={data as Required<PageData>} />
				{/key}
			{/await}
		{:else}
			{#key `work-detail-${page.params.slug}-${i}`}
				<Cards {texture} index={i + 1} works={true} data={data as Required<PageData>} />
			{/key}
		{/if}
	{/each}
{/if}

{#if gradientTexture}
	<T.Mesh bind:ref={gradientMesh} position={[0, 0, 5]} renderOrder={999}>
		<T.PlaneGeometry args={[1, 1]} />
		<T.MeshBasicMaterial
			map={gradientTexture}
			transparent={true}
			depthWrite={false}
			depthTest={false}
		/>
	</T.Mesh>
{/if}
