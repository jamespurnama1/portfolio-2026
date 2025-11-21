<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import { Vector2 } from 'three';
	import type { Texture, ShaderMaterial, PlaneGeometry } from 'three';
	import type { PageData } from '../../routes/$types';
	import fragmentShader from '../shaders/glitchFragment.glsl?raw';
	import vertexShader from '../shaders/vertex.glsl?raw';
	import { optionsStore } from '$lib/stores/options.svelte';

	let {
		texture,
		index,
		opacity = 1,
		data
	}: {
		texture: Texture;
		index: number;
		opacity?: number;
		data: Required<PageData>;
	} = $props();

	const { size } = useThrelte();
	const sizing = 0.4; // Card size in world units
	let imageMat = $state() as ShaderMaterial;
	let imageGeo = $state() as PlaneGeometry;

	// Calculate texture aspect ratio
	const textureAspect = $derived(() => {
		if (texture && texture.image) {
			const width = texture.image.videoWidth || texture.image.width;
			const height = texture.image.videoHeight || texture.image.height;
			return width && height ? width / height : 16 / 9;
		}
		return 16 / 9;
	});

	useTask(() => {
		if (imageMat) {
			imageMat.uniforms.opacity.value = opacity;
			imageMat.uniforms.inverted.value = !optionsStore.dark;
		}
	});
</script>

<T.Mesh>
	<T.PlaneGeometry bind:ref={imageGeo} args={[sizing, (sizing * 2) / 3]} />
	<T.ShaderMaterial
		bind:ref={imageMat}
		uniforms={{
			u_mouse: { value: new Vector2(0.5, 0.5) },
			u_prevMouse: { value: new Vector2(0.5, 0.5) },
			u_aberrationIntensity: { value: 0.0 },
			u_texture: { value: texture },
			textureAspect: { value: textureAspect() },
			planeAspect: { value: 3 / 2 },
			scale: { value: 1 },
			inverted: { value: false },
			opacity: { value: opacity }
		}}
		transparent={true}
		{vertexShader}
		{fragmentShader}
	/>
</T.Mesh>
