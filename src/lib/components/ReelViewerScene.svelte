<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { onDestroy, untrack } from 'svelte';
	import { Mesh, SRGBColorSpace, VideoTexture } from 'three';
	import PostFXManager from './PostFXManager.svelte';
	import PostFXScene from './PostFXScene.svelte';

	let { video }: { video: HTMLVideoElement } = $props();
	const { size } = useThrelte();
	let mesh = $state<Mesh>();
	const texture = new VideoTexture(untrack(() => video));
	texture.colorSpace = SRGBColorSpace;
	onDestroy(() => texture.dispose());

	function updateVideoPosition() {
		if (!mesh) return;
		const rect = video.getBoundingClientRect();
		mesh.position.set(
			rect.left + rect.width / 2 - $size.width / 2,
			$size.height / 2 - rect.top - rect.height / 2,
			0
		);
		mesh.scale.set(rect.width, rect.height, 1);
	}
</script>

<T.OrthographicCamera
	makeDefault
	position={[0, 0, 1]}
	left={-$size.width / 2}
	right={$size.width / 2}
	top={$size.height / 2}
	bottom={-$size.height / 2}
/>
<PostFXManager mouse={{ x: 0, y: 0 }}>
	<PostFXScene beforeRender={updateVideoPosition}>
		<T.Mesh bind:ref={mesh}>
			<T.PlaneGeometry args={[1, 1]} />
			<T.MeshBasicMaterial map={texture} toneMapped={false} />
		</T.Mesh>
	</PostFXScene>
</PostFXManager>
