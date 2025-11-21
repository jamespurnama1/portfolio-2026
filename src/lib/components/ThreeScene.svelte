<script lang="ts">
	import { useThrelte, useLoader } from '@threlte/core';
	import { pointerInteractivity } from '$lib/utils/interactivity';
	import {
		VideoTexture,
		type Texture,
		TextureLoader,
		type Mesh,
		RGBFormat,
		SRGBColorSpace,
		PerspectiveCamera
	} from 'three';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { countStore, loadStore } from '$lib/stores/index.svelte';
	import { cardDimensionsStore } from '$lib/stores/cardDimensions.svelte';
	import gsap from 'gsap';
	import { untrack, onDestroy } from 'svelte';
	import Cards from './Cards.svelte';
	import { page } from '$app/state';
	import type { PageData } from '../../routes/$types';
	import { beforeNavigate } from '$app/navigation';

	let { data }: { data: PageData } = $props();
	const textures: Texture[] = $state([]);
	let imageTextures: Array<Texture | Promise<Texture>> = $state([]);
	const { camera, canvas, renderer, size } = useThrelte();

	let postFXMesh: Mesh | undefined = $state();

	renderer.outputColorSpace = SRGBColorSpace;
	renderer.setPixelRatio(devicePixelRatio || 1);

	pointerInteractivity($camera);

	// theme
	$effect(() => {
		optionsStore.dark;
		untrack(() => {
			if (!canvas) return;
			if (!optionsStore.dark) {
				gsap.to(canvas, {
					filter: 'invert(100%)'
				});
			} else if (optionsStore.dark) {
				gsap.to(canvas, {
					filter: 'invert(0%)'
				});
			}
		});
	});

	const videoBank: Array<HTMLVideoElement> = [];

	function videoLoader(str: string, index: number, id = false) {
		let video;
		if (id) {
			video = document.getElementById(str) as HTMLVideoElement;
		} else {
			video = document.createElement('video');
			video.id = `${page.params.slug}-${index}`;
			video.src = str;
			video.autoplay = true;
			video.muted = true;
			video.playsInline = true;
			video.crossOrigin = 'anonymous';
			video.loop = true;
			document.body.appendChild(video);
			video.play();
			video.style.visibility = 'hidden';
			videoBank.push(video);
		}
		const texture = new VideoTexture(video);
		texture.format = RGBFormat;
		return texture;
	}

	beforeNavigate(() => {
		videoBank.forEach((v) => {
			if (v.parentNode) v.parentNode.removeChild(v);
		});
	});

	$effect(() => {
		$size;
		untrack(() => {
			if (!$camera || !renderer) return;
			if ($camera instanceof PerspectiveCamera) {
				$camera.aspect = ($size.width || 1) / ($size.height || 1);
				$camera.updateProjectionMatrix();
			}
			renderer.setSize($size.width, $size.height, false);
		});
	});

	// textures
	$effect(() => {
		if (!loadStore.loaded || !data.projects) return;
		untrack(() => {
			data.projects.forEach((y, i) => {
				textures.push(videoLoader(y.slug.current, i, true));
			});
		});
	});

	function useLightImage(x: any, i: number) {
		let url = '';
		if (x.video?.url) {
			url = x.video.url;
		} else if (x.imageLight?.url && !optionsStore.dark) {
			url = x.imageLight.url;
		} else if (x.image?.url) {
			url = x.image.url;
		}
		return url;
	}

	async function handleWorkCards() {
		loadStore.cardLoading = true;
		const { load } = useLoader(TextureLoader);
		const current = data!.projects!.find((x) => x.slug.current === page.params.slug)!;
		imageTextures = [];
		const promises: Promise<Texture>[] = [];
		const dimensions: { width: number; height: number }[] = [];
		current.content.forEach((x, i) => {
			let url = useLightImage(x, i);
			if (!url.length) {
				console.warn('No valid media URL found for content item', i, x);
				return;
			}
			if (/\.(mp4|webm)$/.test(url)) {
				const texture = videoLoader(url, i);
				imageTextures.push(texture);
				const video = document.getElementById(`${page.params.slug}-${i}`) as HTMLVideoElement;
				if (video) {
					dimensions[i] = { width: video.videoWidth, height: video.videoHeight };
				} else {
					dimensions[i] = { width: 0, height: 0 };
				}
			} else {
				const promise = load(url).then((texture) => {
					texture.colorSpace = SRGBColorSpace;
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

	$effect(() => {
		optionsStore.dark;
		if (!loadStore.loaded || !data.projects || !page.route.id?.includes('work')) return;
		untrack(() => handleWorkCards());
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
		// Dispose all loaded textures
		textures.forEach((tex) => {
			if (tex && typeof tex.dispose === 'function') tex.dispose();
		});
		imageTextures.forEach((tex) => {
			if (
				tex &&
				tex instanceof Object &&
				'dispose' in tex &&
				typeof (tex as Texture).dispose === 'function'
			) {
				(tex as Texture).dispose();
			}
		});
		if (postFXMesh && typeof postFXMesh.geometry?.dispose === 'function')
			postFXMesh.geometry.dispose();
		// Optionally clear arrays
		textures.length = 0;
		imageTextures.length = 0;
	});
</script>

{#if textures.length && data}
	{#each textures as texture, i}
		<Cards
			{texture}
			index={page.url.pathname.includes('work') ? 0 : i}
			data={data as Required<PageData>}
			home={page.url.pathname === '/'}
			works={page.url.pathname.includes('work') && i === countStore.activeIndex}
		/>
	{/each}
{/if}

{#if page.params.slug && data}
	{#each imageTextures as texture, i}
		{#if texture instanceof Promise}
			{#await texture then x}
				<Cards texture={x} index={i + 1} works={true} data={data as Required<PageData>} />
			{/await}
		{:else}
			<Cards {texture} index={i + 1} works={true} data={data as Required<PageData>} />
		{/if}
	{/each}
{/if}
