<script lang="ts">
	import { T } from '@threlte/core';
	import { getContext, onMount } from 'svelte';

	let {
		enabled = true,
		overlay = false,
		beforeRender = (delta: number) => {},
		children
	} = $props();

	const postfx = getContext<any>('postfx');
	let sceneRef = $state<any>();

	onMount(() => {
		if (enabled && postfx && sceneRef) {
			return postfx.registerScene(sceneRef, beforeRender, { overlay });
		}
	});
</script>

<T.Scene bind:ref={sceneRef}>
	{@render children?.()}
</T.Scene>
