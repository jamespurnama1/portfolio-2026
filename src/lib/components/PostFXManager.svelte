<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		Vector3,
		WebGLRenderTarget,
		ShaderMaterial,
		Mesh,
		Object3D,
		OrthographicCamera
	} from 'three';
	import { setContext, untrack } from 'svelte';
	import { writable } from 'svelte/store';
	import fragmentShader from '../shaders/fragment.glsl?raw';
	import vertexShader from '../shaders/vertex.glsl?raw';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { or } from 'three/tsl';

	let { children, mouse } = $props();
	let orthoCamera = $state<OrthographicCamera>();
	const { size, camera, renderer, scene } = useThrelte();
	const mouseEuler = $derived({ x: mouse.x / $size.width, y: mouse.y / $size.width });
	let uniforms = {
		mousePos: { value: [0, 0] },
		noiseFactor: { value: optionsStore.noiseFactor },
		noiseScale: { value: optionsStore.noiseScale },
		rgbPersistFactor: { value: optionsStore.rgbPersistFactor },
		alphaPersistFactor: { value: optionsStore.alphaPersistFactor }
	};

	$effect(() => {
		uniforms.noiseFactor.value = optionsStore.noiseFactor;
		uniforms.noiseScale.value = optionsStore.noiseScale;
		uniforms.rgbPersistFactor.value = optionsStore.rgbPersistFactor;
		uniforms.alphaPersistFactor.value = optionsStore.alphaPersistFactor;
		uniforms.mousePos.value = [mouseEuler.x, mouseEuler.y];
	});

	const aspect = $derived($size.width / $size.height);

	let postFXScene = $state<any>();
	let postFXMesh = $state<Mesh>();
	let postFXMeshMaterial = $state<ShaderMaterial>();

	// Render targets for ping-pong
	let renderBufferA = $state<WebGLRenderTarget>();
	let renderBufferB = $state<WebGLRenderTarget>();

	// Store for scenes to register themselves
	const registeredScenes = writable<Array<{ scene: any; render: (delta: number) => void }>>([]);

	// Expose registration function via context
	setContext('postfx', {
		registerScene: (scene: any, renderFn: (delta: number) => void) => {
			registeredScenes.update((scenes) => [...scenes, { scene, render: renderFn }]);
			return () => {
				registeredScenes.update((scenes) => scenes.filter((s) => s.scene !== scene));
			};
		},
		getRenderTarget: () => renderBufferA
	});

	$effect(() => {
		$size;
		untrack(() => {
			if ($size.width && $size.height) {
				// Dispose old render targets
				if (renderBufferA) renderBufferA.dispose();
				if (renderBufferB) renderBufferB.dispose();

				// Create new render targets
				renderBufferA = new WebGLRenderTarget($size.width, $size.height);
				renderBufferB = new WebGLRenderTarget($size.width, $size.height);

				// Clear the main canvas and both buffers immediately
				renderer.setRenderTarget(renderBufferA);
				renderer.clear(true, true, true);
				renderer.setRenderTarget(renderBufferB);
				renderer.clear(true, true, true);
				renderer.setRenderTarget(null);
				renderer.clear(true, true, true);
			}
		});
	});

	useTask((delta) => {
		if (!renderBufferA || !renderBufferB || !postFXMeshMaterial || !orthoCamera) return;
		renderer.autoClearColor = false;
		postFXMeshMaterial.uniforms.sampler.value = renderBufferB.texture;
		postFXMeshMaterial.uniforms.time.value += delta;
		postFXMeshMaterial.needsUpdate = true;

		// Render decayed history into the fresh buffer, then draw the current scenes on top.
		renderer.setRenderTarget(renderBufferA);
		renderer.clear(true, true, true);

		renderer.render(postFXScene, orthoCamera);

		$registeredScenes.forEach(({ scene, render }) => {
			render(delta); // Execute custom render logic
			const hidden: Array<{ obj: Mesh; visible: boolean }> = [];
			scene.traverse((obj: Object3D) => {
				const mesh = obj as Mesh;
				if (mesh.isMesh && mesh.userData?.skipPostFX) {
					hidden.push({ obj: mesh, visible: mesh.visible });
					mesh.visible = false;
				}
			});
			renderer.render(scene, $camera);
			hidden.forEach(({ obj, visible }) => {
				obj.visible = visible;
			});
		});

		// Apply post-FX
		renderer.setRenderTarget(null);
		postFXMeshMaterial.uniforms.sampler.value = renderBufferA.texture;
		postFXMeshMaterial.needsUpdate = true;
		renderer.clear(true, true, true);
		renderer.render(postFXScene, orthoCamera);

		// Ping-pong
		const temp = renderBufferA;
		renderBufferA = renderBufferB;
		renderBufferB = temp;
	});
</script>

<T.Scene bind:ref={postFXScene}>
	<T.OrthographicCamera
		makeDefault={false}
		bind:ref={orthoCamera}
		position.z={1}
		on:create={({ ref }) => {
			ref.lookAt(new Vector3(0, 0, 0));
		}}
		position={[0, 0, 1]}
		rotation={[0, 0, 0]}
		scale={[1, 1, 1]}
	/>
	<T.Mesh bind:ref={postFXMesh} position={[0, 0, 0]}>
		<T.PlaneGeometry args={[$size.width, $size.height]} />
		<T.ShaderMaterial
			bind:ref={postFXMeshMaterial}
			uniforms={{
				sampler: { value: null },
				time: { value: 0 },
				aspect: { value: aspect },
				...uniforms
			}}
			depthTest={false}
			depthWrite={false}
			{vertexShader}
			{fragmentShader}
		/>
	</T.Mesh>
</T.Scene>

{@render children?.()}
