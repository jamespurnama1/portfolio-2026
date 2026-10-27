<script lang="ts">
	import { T, useTask, useThrelte } from '@threlte/core';
	import {
		Vector2,
		Vector3,
		WebGLRenderTarget,
		ShaderMaterial,
		Mesh,
		Object3D,
		OrthographicCamera,
		Scene
	} from 'three';
	import { setContext, untrack, onDestroy } from 'svelte';
	import { writable } from 'svelte/store';
	import fragmentShader from '../shaders/fragment.glsl?raw';
	import blitFragmentShader from '../shaders/blitFragment.glsl?raw';
	import vertexShader from '../shaders/vertex.glsl?raw';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { isMobileSafari, isSafari } from '$lib/utils/device';
	import { perfStore } from '$lib/stores/perf.svelte';

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

	let postFXScene = $state<any>();
	let postFXMesh = $state<Mesh>();
	let postFXMeshMaterial = $state<ShaderMaterial>();
	// Blit material: trivial passthrough used for Pass 2 (screen composite).
	// Avoids re-running the expensive noise shader on the final blit.
	let blitMaterial: ShaderMaterial | undefined;
	$effect(() => {
		blitMaterial = new ShaderMaterial({
			uniforms: { sampler: { value: null } },
			vertexShader,
			fragmentShader: blitFragmentShader,
			transparent: true,
			depthTest: false,
			depthWrite: false
		});
		return () => {
			blitMaterial?.dispose();
			blitMaterial = undefined;
		};
	});

	// Render targets for Chrome ping-pong
	let renderBufferA: WebGLRenderTarget | undefined;
	let renderBufferB: WebGLRenderTarget | undefined;

	// Single history buffer for desktop Safari single-pass path.
	// Populated each frame via copyFramebufferToTexture (GPU blit, not a render pass).
	let safariHistoryBuffer: WebGLRenderTarget | undefined;

	// Pending size for debounced Safari resize.
	const pendingSafariSize = { sw: 0, sh: 0 };
	let safariResizeTimer: ReturnType<typeof setTimeout> | null = null;
	let pingPongResizeTimer: ReturnType<typeof setTimeout> | null = null;

	// Reused every frame — avoids per-frame Vector2 allocation.
	const zeroVec2 = new Vector2(0, 0);

	// WebGL context — used by measureSync for gl.finish() GPU sync timing.
	const gl = renderer.getContext() as WebGL2RenderingContext;

	// Prevent iOS from permanently losing the WebGL context on a Metal command-buffer
	// validation error (e.g. texture dimension mismatch during address-bar resize).
	// preventDefault() in webglcontextlost signals the browser to attempt restoration.
	gl.canvas.addEventListener(
		'webglcontextlost',
		(e) => {
			e.preventDefault();
		},
		{ passive: false }
	);

	type SceneEntry = { scene: any; render: (delta: number) => void };

	// Store for scenes to register themselves
	const registeredScenes = writable<SceneEntry[]>([]);

	// Expose registration function via context
	setContext('postfx', {
		registerScene: (
			scene: any,
			renderFn: (delta: number) => void,
			options: { overlay?: boolean } = {}
		) => {
			registeredScenes.update((scenes) => [...scenes, { scene, render: renderFn }]);
			// Pre-warm all Metal PSOs on Safari to prevent first-render pipeline stall.
			// renderer.compile() internally uses traverseVisible(), so it skips meshes
			// with visible=false (cards start hidden). We temporarily un-hide all
			// invisible meshes so every ShaderMaterial / MeshPhysicalMaterial variant
			// gets its Metal PSO compiled before it's ever drawn mid-frame.
			// Skip expensive PSO pre-warm on mobile Safari: the iOS GPU handles first-draw
			// compilation efficiently, and the 5-RAF shader compile is a significant source
			// of jank during the card-loading phase on older iPhones.
			if (isSafari && !isMobileSafari && typeof window !== 'undefined') {
				// Defer compile until all child components (Cards, IntroGridScene etc.)
				// have mounted their meshes and materials into the scene graph.
				// Svelte renders synchronously but Threlte's T.* bindings and onMount
				// callbacks fire over several microtask/RAF cycles. 5 RAFs gives enough
				// runway for a typical scene with many Cards children.
				let rafCount = 0;
				let cancelled = false;
				const waitAndCompile = () => {
					if (cancelled) return;
					if (++rafCount < 5) {
						window.requestAnimationFrame(waitAndCompile);
						return;
					}
					// Build a throwaway compilation scene containing one proxy mesh per
					// unique material found in the real scene (including hidden meshes).
					// This avoids writing to any mesh's .visible property, which would
					// bypass Threlte's reactive bindings and cause cards to stay hidden
					// after the compile. renderer.compile() uses traverseVisible so we
					// need all proxy meshes to start visible=true (the default).
					//
					// VideoTexture materials are intentionally EXCLUDED: the Metal PSO is
					// keyed by shader code — compiling any image-texture instance of the
					// same ShaderMaterial pre-warms the PSO for video cards too. Including
					// VideoTextures in compile() would call gl.texImage2D() on the video
					// frame and reset Three.js's internal upload counter, causing the video
					// to appear frozen on the next real render.
					const compileScene = new Scene();
					const seenMaterials = new Set<any>();
					try {
						scene.traverse((obj: any) => {
							if (!obj.isMesh || !obj.geometry) return;
							const mats: any[] = Array.isArray(obj.material) ? obj.material : [obj.material];
							mats.forEach((mat) => {
								if (!mat || seenMaterials.has(mat)) return;
								// Skip materials that use VideoTexture — see comment above.
								if (mat.uniforms) {
									const hasVideoTex = Object.values(mat.uniforms).some(
										(u: any) => u?.value?.isVideoTexture
									);
									if (hasVideoTex) return;
								}
								seenMaterials.add(mat);
								// Proxy mesh shares the same geometry + material but lives in
								// a temporary scene — never rendered, only used for compilation.
								compileScene.add(new Mesh(obj.geometry, mat));
							});
						});
						renderer.compile(compileScene, $camera);
					} catch (_) {
						// Non-fatal: scene may have been destroyed or camera unavailable
					}
					// Proxy meshes reference shared materials/geometries — only clear
					// the scene's own children array; do NOT call geometry.dispose() or
					// material.dispose() as that would destroy the live assets.
					compileScene.clear();
				};
				window.requestAnimationFrame(waitAndCompile);
				return () => {
					cancelled = true;
					registeredScenes.update((scenes) => scenes.filter((s) => s.scene !== scene));
				};
			}
		},
		getRenderTarget: () => renderBufferA
	});

	$effect(() => {
		$size;
		untrack(() => {
			if ($size.width && $size.height) {
				// Always disable auto-clear so multiple registered scenes composite
				// correctly — each scene renders on top of the previous without wiping it.
				renderer.autoClearColor = false;

				// Throttle pixel ratio: all Safari capped at 1.5× (vs 2× on Chrome)
				// — desktop Safari Metal is fill-rate limited, 1.5→2 saves ~44%.
				const dpr = Math.min(
					typeof devicePixelRatio !== 'undefined' ? devicePixelRatio : 1,
					isMobileSafari ? 1 : isSafari ? 1.5 : 2
				);
				renderer.setPixelRatio(dpr);

				const rtOptions = { depthBuffer: false, stencilBuffer: false };

				if (isSafari) {
					const sw = Math.floor($size.width * dpr);
					const sh = Math.floor($size.height * dpr);

					if (!safariHistoryBuffer) {
						// Initial creation: allocate immediately so the render loop can start.
						safariHistoryBuffer = new WebGLRenderTarget(sw, sh, rtOptions);
						renderer.setRenderTarget(safariHistoryBuffer);
						renderer.clear(true, true, true);
						renderer.setRenderTarget(null);
					} else {
						// Resize: debounce to avoid flooding GPU allocations during iOS address-bar
						// show/hide animation (~18 size events in 300ms at 60 fps).
						pendingSafariSize.sw = sw;
						pendingSafariSize.sh = sh;
						if (safariResizeTimer !== null) clearTimeout(safariResizeTimer);
						safariResizeTimer = setTimeout(() => {
							safariResizeTimer = null;
							if (safariHistoryBuffer) safariHistoryBuffer.dispose();
							safariHistoryBuffer = new WebGLRenderTarget(
								pendingSafariSize.sw,
								pendingSafariSize.sh,
								rtOptions
							);
							renderer.setRenderTarget(safariHistoryBuffer);
							renderer.clear(true, true, true);
							renderer.setRenderTarget(null);
						}, 150);
					}
					return;
				}

				// Chrome / non-Safari: full ping-pong at screen resolution.
				const pw = Math.floor($size.width * dpr);
				const ph = Math.floor($size.height * dpr);
				if (!renderBufferA || !renderBufferB) {
					// Initial creation: allocate immediately.
					renderBufferA = new WebGLRenderTarget(pw, ph, rtOptions);
					renderBufferB = new WebGLRenderTarget(pw, ph, rtOptions);
					renderer.setRenderTarget(renderBufferA);
					renderer.clear(true, true, true);
					renderer.setRenderTarget(renderBufferB);
					renderer.clear(true, true, true);
					renderer.setRenderTarget(null);
					renderer.clear(true, true, true);
				} else {
					// Resize: debounce to avoid rapid GPU allocations on orientation change.
					const pending = { pw, ph };
					if (pingPongResizeTimer !== null) clearTimeout(pingPongResizeTimer);
					pingPongResizeTimer = setTimeout(() => {
						pingPongResizeTimer = null;
						if (renderBufferA) renderBufferA.dispose();
						if (renderBufferB) renderBufferB.dispose();
						renderBufferA = new WebGLRenderTarget(pending.pw, pending.ph, rtOptions);
						renderBufferB = new WebGLRenderTarget(pending.pw, pending.ph, rtOptions);
						renderer.setRenderTarget(renderBufferA);
						renderer.clear(true, true, true);
						renderer.setRenderTarget(renderBufferB);
						renderer.clear(true, true, true);
						renderer.setRenderTarget(null);
						renderer.clear(true, true, true);
					}, 150);
				}
			}
		});
	});

	onDestroy(() => {
		if (safariResizeTimer !== null) clearTimeout(safariResizeTimer);
		if (pingPongResizeTimer !== null) clearTimeout(pingPongResizeTimer);
		renderBufferA?.dispose();
		renderBufferB?.dispose();
		safariHistoryBuffer?.dispose();
	});

	function renderSceneEntries(entries: SceneEntry[], delta: number) {
		entries.forEach(({ scene, render }, i) => {
			// Sub-phase: beforeRender callback (animation/update CPU work for this scene)
			perfStore.measureSync(`scene${i}:update`, gl, () => {
				render(delta);
			});
			// Sub-phase: actual WebGL draw for this scene (Three.js traverse + state + draw calls)
			if (isSafari) {
				perfStore.measureSync(`scene${i}:draw`, gl, () => {
					renderer.render(scene, $camera);
				});
				return;
			}
			const hidden: Array<{ obj: Mesh; visible: boolean }> = [];
			scene.traverse((obj: Object3D) => {
				const mesh = obj as Mesh;
				if (mesh.isMesh && mesh.userData?.skipPostFX) {
					hidden.push({ obj: mesh, visible: mesh.visible });
					mesh.visible = false;
				}
			});
			perfStore.measureSync(`scene${i}:draw`, gl, () => {
				renderer.render(scene, $camera);
			});
			hidden.forEach(({ obj, visible }) => {
				obj.visible = visible;
			});
		});
	}

	// Tracks per-frame WebGL draw calls and triangles for the debug panel.
	// Called at the bottom of every useTask callback path.
	function captureRendererInfo() {
		if (!perfStore.enabled) return;
		perfStore.drawCalls = renderer.info.render.calls;
		perfStore.triangles = renderer.info.render.triangles;
	}

	useTask((delta) => {
		perfStore.tick(delta);
		// Disable Three.js auto-reset so info.render accumulates across all
		// renderer.render() calls this frame. We reset manually once at the start.
		renderer.info.autoReset = false;
		renderer.info.reset();

		perfStore.measure('frame', () => {
			// ── Mobile Safari: no postFX, direct render ────────────────────────────
			// if (isMobileSafari) {
			// 	perfStore.measure('postfx', () => {
			// 		renderer.setRenderTarget(null);
			// 		renderer.clear(true, true, true);
			// 		renderSceneEntries($registeredScenes, delta);
			// 	});
			// 	captureRendererInfo();
			// 	return;
			// }

			// ── Mobile Safari: no postFX, direct render ────────────────────────────
			// if (isMobileSafari) {
			// 	perfStore.measure('postfx', () => {
			// 		renderer.setRenderTarget(null);
			// 		renderer.clear(true, true, true);
			// 		renderSceneEntries($registeredScenes, delta);
			// 	});
			// 	captureRendererInfo();
			// 	return;
			// }

			// ── Desktop Safari: single Metal render pass + GPU blit ────────────────
			if (isSafari) {
				if (!postFXMeshMaterial || !orthoCamera || !safariHistoryBuffer) return;
				postFXMeshMaterial!.uniforms.sampler.value = safariHistoryBuffer!.texture;
				postFXMeshMaterial!.uniforms.time.value += delta;
				renderer.setRenderTarget(null);
				renderer.clear(true, true, true);
				// Sub-phase: ghost quad (noise shader, reads last frame's history)
				perfStore.measureSync('postfx:ghost', gl, () => {
					renderer.render(postFXScene, orthoCamera!);
				});
				// Sub-phase: 3D scenes composite on top — same Metal render pass
				perfStore.measureSync('postfx:scenes', gl, () => {
					renderSceneEntries($registeredScenes, delta);
				});
				// Sub-phase: GPU blit — capture screen → history for next frame
				// copyFramebufferToTexture = gl.copyTexImage2D, no new render pass.
				// Guard: only blit when the history buffer dimensions exactly match the
				// current drawing buffer. During the 150ms debounce window after an iOS
				// address-bar resize, the buffer may be stale. Skipping the blit (rather
				// than catching the resulting Metal command-buffer error) prevents iOS
				// from issuing a GPU context abort that bypasses JS try-catch.
				perfStore.measureSync('postfx:copy', gl, () => {
					const dbw = gl.drawingBufferWidth;
					const dbh = gl.drawingBufferHeight;
					if (safariHistoryBuffer!.width === dbw && safariHistoryBuffer!.height === dbh) {
						try {
							renderer.copyFramebufferToTexture(safariHistoryBuffer!.texture, zeroVec2);
						} catch (_) {
							// Fallback: should not normally trigger with the dimension guard above,
							// but retained as a last-resort safety net.
						}
					}
					// else: dimensions mismatch — skip blit, ghost is one frame stale (imperceptible)
				});
				captureRendererInfo();
				return;
			}

			// ── Chrome / non-Safari: full ping-pong ────────────────────────────────
			if (!renderBufferA || !renderBufferB) return;
			if (!postFXMeshMaterial || !blitMaterial || !orthoCamera) return;

			postFXMeshMaterial!.uniforms.sampler.value = renderBufferB!.texture;
			postFXMeshMaterial!.uniforms.time.value += delta;

			renderer.setRenderTarget(renderBufferA!);
			renderer.clear(true, true, true);
			// Sub-phase: pass 1 — ghost quad + scenes into renderBufferA
			perfStore.measureSync('postfx:pass1', gl, () => {
				renderer.render(postFXScene, orthoCamera!);
				renderSceneEntries($registeredScenes, delta);
			});
			// Sub-phase: pass 2 — blit renderBufferA to screen
			renderer.setRenderTarget(null);
			postFXMesh!.material = blitMaterial!;
			blitMaterial!.uniforms.sampler.value = renderBufferA!.texture;
			renderer.clear(true, true, true);
			perfStore.measureSync('postfx:pass2', gl, () => {
				renderer.render(postFXScene, orthoCamera!);
			});
			postFXMesh!.material = postFXMeshMaterial!;

			const temp = renderBufferA;
			renderBufferA = renderBufferB;
			renderBufferB = temp;
			captureRendererInfo();
		}); // end perfStore.measure('frame')
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
