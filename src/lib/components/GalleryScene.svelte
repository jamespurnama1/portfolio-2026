<script lang="ts">
	import { T, useThrelte, useLoader } from '@threlte/core';
	import { TextureLoader, type Texture, SRGBColorSpace } from 'three';
	import { spring, type Spring } from 'svelte/motion';
	import { untrack, onDestroy } from 'svelte';
	import { loadStore, countStore } from '$lib/stores/index.svelte';
	import type { Gallery } from '$lib/types';
	import { pointerInteractivity } from '$lib/utils/interactivity';

	let {
		data,
		galleryLoaded = $bindable(false)
	}: {
		data: Gallery;
		galleryLoaded?: boolean;
	} = $props();

	const { size, camera } = useThrelte();
	const textures: Texture[] = $state([]);
	const textureAspects: number[] = $state([]);
	const visibleCards = 7;
	const overlapFactor = 0.7;
	const scrollSpeed = 1;
	const aspectRatio = 2 / 3;
	const cardWidth = $derived(Math.min($size.width * 0.65, 900));
	const cardHeight = $derived(cardWidth * aspectRatio);
	const cardSpacing = $derived(cardWidth * overlapFactor);
	const depthOffset = $derived(cardWidth * 0.35);

	let scrollOffset = $state(0);
	let loadGeneration = 0;
	let selectedIndex: number | null = $state(null);
	let interactivityContext: ReturnType<typeof pointerInteractivity> | null = null;
	let loadReady = $state(false);
	let initialCountSynced = $state(false);
	const cardSprings: {
		position: Spring<[number, number, number]>;
		scale: Spring<[number, number, number]>;
		opacity: Spring<number>;
	}[] = $state([]);

	function handleClick(event: PointerEvent, index: number) {
		event.stopPropagation();
		selectCard(index);
	}

	$effect(() => {
		const inertia = countStore.inertiaIndex;
		scrollOffset = inertia * cardSpacing * scrollSpeed;
	});

	$effect(() => {
		if (interactivityContext || !$camera) return;
		untrack(() => {
			interactivityContext = pointerInteractivity($camera);
		});
	});

	$effect(() => {
		if (!data.media || data.media.length === 0) {
			galleryLoaded = false;
			loadReady = false;
			initialCountSynced = false;
			cardSprings.length = 0;
			return;
		}

		const generation = ++loadGeneration;

		untrack(async () => {
			const { load } = useLoader(TextureLoader);
			galleryLoaded = false;
			loadReady = false;
			initialCountSynced = false;

			const newTextures: Texture[] = [];
			const newAspects: number[] = [];
			const mediaItems = data.media ?? [];

			for (let i = 0; i < mediaItems.length; i++) {
				const mediaItem = mediaItems[i];
				if (!mediaItem?.url) continue;
				try {
					const loadedTexture = await load(mediaItem.url);
					let tex: Texture | undefined;
					if (Array.isArray(loadedTexture)) {
						tex = loadedTexture[0];
					} else if (loadedTexture instanceof Object && 'isTexture' in loadedTexture) {
						tex = loadedTexture as Texture;
					} else {
						const candidates = Object.values(loadedTexture as Record<string, Texture>);
						tex = candidates[0];
					}

					if (!tex) continue;
					tex.colorSpace = SRGBColorSpace;
					const img = tex.image as {
						width?: number;
						height?: number;
						naturalWidth?: number;
						naturalHeight?: number;
					};
					const width = img?.width ?? img?.naturalWidth ?? 1;
					const height = img?.height ?? img?.naturalHeight ?? 1;
					newTextures.push(tex);
					newAspects.push(width / Math.max(height, 1));
				} catch (err) {
					console.error('Failed to load texture for gallery item:', mediaItem.filename || i, err);
				}
			}

			if (generation !== loadGeneration) {
				newTextures.forEach((tex) => {
					if (tex && typeof tex.dispose === 'function') tex.dispose();
				});
				return;
			}

			textures.forEach((tex) => {
				if (tex && typeof tex.dispose === 'function') tex.dispose();
			});
			textures.length = 0;
			cardSprings.length = 0;
			textures.push(...newTextures);

			textureAspects.length = 0;
			textureAspects.push(...newAspects);
			selectedIndex = null;
			ensureCardSprings();

			updateTextureMappings();
			galleryLoaded = true;
			if (!loadStore.loaded) {
				loadStore.load = 100;
				loadStore.loaded = true;
			}
			const viewportWidth = $size.width || 1;
			const viewportHeight = $size.height || 1;
			untrack(() => {
				updateCardAnimations(true, viewportWidth, viewportHeight, cardWidth, cardHeight);
			});
		});
	});

	function applyCoverMapping(texture: Texture, cardAspect: number, textureAspect: number) {
		texture.center.set(0.5, 0.5);
		let repeatX = 1;
		let repeatY = 1;
		if (textureAspect > cardAspect) {
			repeatX = cardAspect / textureAspect;
		} else {
			repeatY = textureAspect / cardAspect;
		}
		texture.repeat.set(repeatX, repeatY);
		texture.offset.set((1 - repeatX) / 2, (1 - repeatY) / 2);
		texture.needsUpdate = true;
	}

	function applyContainMapping(texture: Texture) {
		texture.center.set(0.5, 0.5);
		texture.repeat.set(1, 1);
		texture.offset.set(0, 0);
		texture.needsUpdate = true;
	}

	function updateTextureMappings() {
		const cardAspect = cardWidth / cardHeight;
		textures.forEach((texture, index) => {
			const aspect = textureAspects[index] ?? cardAspect;
			if (selectedIndex === index) {
				applyContainMapping(texture);
			} else {
				applyCoverMapping(texture, cardAspect, aspect);
			}
		});
	}

	$effect(() => {
		cardWidth;
		cardHeight;
		textures.length;
		selectedIndex;
		untrack(() => {
			updateTextureMappings();
		});
	});

	$effect(() => {
		$size.width;
		$size.height;
		untrack(() => {
			updateTextureMappings();
		});
	});

	$effect(() => {
		const loadPercent = loadStore.load;
		if (!textures.length) {
			loadReady = false;
			initialCountSynced = false;
			return;
		}
		if (loadPercent === 100 && !loadReady) {
			loadReady = true;
		}
		if (loadPercent === 100 && !initialCountSynced) {
			untrack(() => {
				countStore.inertiaIndex = textures.length - 1;
			});
			initialCountSynced = true;
		}
	});

	$effect(() => {
		const viewportWidth = $size.width || 1;
		const viewportHeight = $size.height || 1;
		const width = cardWidth || 1;
		const height = cardHeight || 1;
		scrollOffset;
		selectedIndex;
		textures.length;
		textureAspects.length;
		loadReady;
		untrack(() => {
			updateCardAnimations(!loadReady, viewportWidth, viewportHeight, width, height);
		});
	});

	function selectCard(index: number) {
		selectedIndex = selectedIndex === index ? null : index;
		updateTextureMappings();
	}

	function clearSelection() {
		if (selectedIndex !== null) {
			selectedIndex = null;
			updateTextureMappings();
		}
	}

	function getCarouselPosition(index: number) {
		if (selectedIndex === index) {
			return { x: 0, y: 0, z: -0.5 };
		}
		const totalItems = textures.length;
		if (totalItems === 0) return { x: 0, y: 0, z: 0 };

		const baseOffset = scrollOffset / Math.max(cardSpacing, 1);
		let relativeIndex = index - baseOffset;

		const halfVisible = Math.ceil(visibleCards / 2);
		while (relativeIndex < -halfVisible) relativeIndex += totalItems;
		while (relativeIndex > totalItems - halfVisible) relativeIndex -= totalItems;

		const x = relativeIndex * cardSpacing;
		const distanceFromCenter = Math.abs(relativeIndex);
		const z = -distanceFromCenter * depthOffset - 1;

		return { x, y: 0, z };
	}

	function getCardOpacity(index: number): number {
		const totalItems = textures.length;
		if (totalItems === 0) return 0;

		if (selectedIndex !== null) {
			return selectedIndex === index ? 1 : 0.1;
		}

		const baseOffset = scrollOffset / Math.max(cardSpacing, 1);
		let relativeIndex = index - baseOffset;

		const halfVisible = Math.ceil(visibleCards / 2);
		while (relativeIndex < -halfVisible) relativeIndex += totalItems;
		while (relativeIndex > totalItems - halfVisible) relativeIndex -= totalItems;

		const distanceFromCenter = Math.abs(relativeIndex);
		if (distanceFromCenter > halfVisible) return 0;

		return Math.max(0, 1 - (distanceFromCenter / halfVisible) * 0.5);
	}

	onDestroy(() => {
		interactivityContext?.target.set(undefined);
		textures.forEach((tex) => {
			if (tex && typeof tex.dispose === 'function') tex.dispose();
		});
		textures.length = 0;
		cardSprings.length = 0;
	});

	function ensureCardSprings() {
		while (cardSprings.length < textures.length) {
			cardSprings.push({
				position: spring<[number, number, number]>([0, 0, -1], {
					stiffness: 0.15,
					damping: 0.6
				}),
				scale: spring<[number, number, number]>([1, 1, 1], {
					stiffness: 0.15,
					damping: 0.6
				}),
				opacity: spring(0, {
					stiffness: 0.2,
					damping: 0.65
				})
			});
		}
		while (cardSprings.length > textures.length) {
			cardSprings.pop();
		}
	}

	function updateCardAnimations(
		hardSet: boolean,
		viewportWidth: number,
		viewportHeight: number,
		cardWidthValue: number,
		cardHeightValue: number
	) {
		if (!textures.length) return;
		ensureCardSprings();
		const options = hardSet ? { hard: true } : undefined;
		const maxWidth = viewportWidth * 0.85;
		const maxHeight = viewportHeight * 0.85;
		textures.forEach((_, i) => {
			const isSelected = selectedIndex === i;
			const pos = getCarouselPosition(i);
			const textureAspect = textureAspects[i] ?? cardWidthValue / Math.max(cardHeightValue, 1);

			let widthScale = 1;
			let heightScale = 1;

			if (isSelected) {
				// Calculate dimensions that fit within 85% viewport
				const selectedWidth = Math.min(maxWidth, maxHeight * textureAspect);
				const selectedHeight = selectedWidth / Math.max(textureAspect, 0.0001);

				// Ensure height also fits
				if (selectedHeight > maxHeight) {
					const adjustedHeight = maxHeight;
					const adjustedWidth = adjustedHeight * textureAspect;
					widthScale = adjustedWidth / Math.max(cardWidthValue, 1);
					heightScale = adjustedHeight / Math.max(cardHeightValue, 1);
				} else {
					widthScale = selectedWidth / Math.max(cardWidthValue, 1);
					heightScale = selectedHeight / Math.max(cardHeightValue, 1);
				}
			}

			const targetPos: [number, number, number] = isSelected ? [0, 0, 1] : [pos.x, pos.y, pos.z];
			let targetScale: [number, number, number] = [widthScale, heightScale, 1];
			let targetOpacity = getCardOpacity(i);
			if (hardSet) {
				targetScale = [targetScale[0] * 0.8, targetScale[1] * 0.8, 1];
				targetOpacity = 0;
			}
			cardSprings[i].position.set(targetPos, options);
			cardSprings[i].scale.set(targetScale, options);
			cardSprings[i].opacity.set(targetOpacity, options);
		});
	}
</script>

{#if loadStore.load === 100 && textures.length && loadReady}
	<T.Group on:pointermissed={clearSelection}>
		{#each textures as texture, i}
			{@const cardSpring = cardSprings[i]}
			{@const currentPosition = cardSpring?.position.current ?? [0, 0, -1]}
			{@const currentScale = cardSpring?.scale.current ?? [1, 1, 1]}
			{@const currentOpacity = cardSpring?.opacity.current ?? 0}
			{#if cardSpring}
				<T.Group
					position={currentPosition}
					scale={currentScale}
					on:click={(event) => {
						handleClick(event, i);
					}}
				>
					<T.Mesh
						on:click={(event) => {
							handleClick(event, i);
						}}
					>
						<T.PlaneGeometry args={[cardWidth, cardHeight]} />
						<T.MeshBasicMaterial map={texture} transparent opacity={currentOpacity} side={2} />
					</T.Mesh>
				</T.Group>
			{/if}
		{/each}
	</T.Group>
{/if}
