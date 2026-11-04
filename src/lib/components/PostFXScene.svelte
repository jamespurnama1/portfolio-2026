<script lang="ts">
	import { T } from '@threlte/core';
	import { getContext } from 'svelte';
	import type { Camera } from 'three';

	let {
		enabled = true,
		overlay = false,
		camera = undefined as Camera | undefined,
		beforeRender = (delta: number) => {},
		children
	} = $props();

	const postfx = getContext<any>('postfx');
	let sceneRef = $state<any>();

	$effect(() => {
		if (enabled && postfx && sceneRef) {
			return postfx.registerScene(sceneRef, beforeRender, { overlay, camera });
		}
	});
</script>

<T.Scene bind:ref={sceneRef}>
	{@render children?.()}
</T.Scene>
