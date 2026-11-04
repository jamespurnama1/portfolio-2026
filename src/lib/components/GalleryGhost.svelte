<script lang="ts">
	import { T, useThrelte } from '@threlte/core';
	import { onDestroy, onMount } from 'svelte';
	import {
		Group,
		LinearFilter,
		Mesh,
		OrthographicCamera,
		PlaneGeometry,
		ShaderMaterial,
		SRGBColorSpace,
		Texture
	} from 'three';
	import PostFXScene from './PostFXScene.svelte';

	const { size } = useThrelte();
	let group = $state<Group>();
	const galleryCamera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 10);
	galleryCamera.position.z = 1;
	const geometry = new PlaneGeometry(1, 1);
	const meshes = new Map<Element, Mesh<PlaneGeometry, ShaderMaterial>>();
	const freeMeshes: Mesh<PlaneGeometry, ShaderMaterial>[] = [];
	const textures = new Map<string, { texture: Texture; bitmap: ImageBitmap; used: number }>();
	const pendingTextures = new Set<string>();
	const rejected = new Set<string>();
	const textureRequests = new AbortController();
	let lastUpdate = 0;
	let frame = 0;
	let activeUntil = 0;
	let fade = 0;
	// Tiles keep reading their live rect while the hover scale transition settles.
	const hoverUntil = new WeakMap<Element, number>();
	let destroyed = false;
	let textureWorker: Worker | undefined;
	const wake = () => {
		activeUntil = performance.now() + 1000;
	};

	onMount(() => {
		if (typeof Worker !== 'undefined') {
			try {
				textureWorker = new Worker(new URL('../utils/galleryGhost.worker.ts', import.meta.url), {
					type: 'module'
				});
				textureWorker.onmessage = (
					event: MessageEvent<{ key: string; bitmap?: ImageBitmap; error?: boolean }>
				) => {
					const { key, bitmap } = event.data;
					pendingTextures.delete(key);
					if (!bitmap) {
						rejected.add(key);
						wake();
						return;
					}
					storeTexture(key, bitmap);
				};
				textureWorker.onerror = () => {
					textureWorker?.terminate();
					textureWorker = undefined;
					pendingTextures.clear();
					wake();
				};
			} catch {
				textureWorker = undefined;
			}
		}
		const trackHover = (event: Event) => {
			const target = event.target as Element | null;
			const item = target?.closest?.('.grid-item');
			if (item) hoverUntil.set(item, performance.now() + 500);
			const element = item?.querySelector<HTMLImageElement | HTMLVideoElement>(
				'[data-gallery-ghost]'
			);
			if (!element) return;
			textureFor(element);
			wake();
		};
		const drag = (event: PointerEvent) => {
			if (event.buttons && (event.target as Element | null)?.closest?.('.grid-viewport')) {
				wake();
			}
		};
		const wheel = () => wake();
		const scroll = (event: Event) => {
			if ((event.target as Element | null)?.classList?.contains('thumbnails')) {
				wake();
			}
		};
		const events = [
			'pointerdown',
			'pointerup',
			'click',
			'keydown',
			'load',
			'loadeddata',
			'resize',
			'visibilitychange',
			'gallery-reveal'
		];
		for (const event of events) window.addEventListener(event, wake, true);
		for (const event of ['pointerover', 'pointerout', 'focusin', 'focusout'])
			window.addEventListener(event, trackHover, true);
		window.addEventListener('pointermove', drag, true);
		window.addEventListener('wheel', wheel, true);
		window.addEventListener('scroll', scroll, true);
		wake();
		return () => {
			for (const event of events) window.removeEventListener(event, wake, true);
			for (const event of ['pointerover', 'pointerout', 'focusin', 'focusout'])
				window.removeEventListener(event, trackHover, true);
			window.removeEventListener('pointermove', drag, true);
			window.removeEventListener('wheel', wheel, true);
			window.removeEventListener('scroll', scroll, true);
		};
	});

	function storeTexture(key: string, bitmap: ImageBitmap) {
		if (destroyed) {
			bitmap.close();
			return;
		}
		const texture = new Texture(bitmap);
		texture.colorSpace = SRGBColorSpace;
		texture.minFilter = LinearFilter;
		texture.magFilter = LinearFilter;
		texture.generateMipmaps = false;
		texture.needsUpdate = true;
		textures.set(key, { texture, bitmap, used: frame });
		wake();
	}

	function textureFor(element: HTMLImageElement | HTMLVideoElement) {
		if (
			element instanceof HTMLImageElement &&
			(!element.complete || element.currentSrc !== element.src)
		)
			return null;
		const url =
			element instanceof HTMLVideoElement
				? element.dataset.galleryGhostSrc
				: element.currentSrc || element.src;
		if (!url) return null;
		const key = `still:${url}`;
		const cached = textures.get(key);
		if (cached) {
			cached.used = frame;
			return cached.texture;
		}
		if (rejected.has(key)) return null;
		if (
			pendingTextures.has(key) ||
			pendingTextures.size >= 2 ||
			typeof createImageBitmap !== 'function'
		)
			return null;
		const sourceWidth =
			element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
		const sourceHeight =
			element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
		if (!sourceWidth || !sourceHeight) return null;
		if (
			element.crossOrigin !== 'anonymous' &&
			!url.startsWith('data:') &&
			new URL(url, location.href).origin !== location.origin
		) {
			rejected.add(key);
			return null;
		}
		const scale = Math.min(1, 192 / Math.max(sourceWidth, sourceHeight));
		const width = Math.max(1, Math.round(sourceWidth * scale));
		const height = Math.max(1, Math.round(sourceHeight * scale));
		pendingTextures.add(key);
		if (textureWorker) {
			textureWorker.postMessage({ key, url, width, height });
			return null;
		}
		void fetch(url, { signal: textureRequests.signal })
			.then((response) => {
				if (!response.ok) throw new Error('Unable to load gallery ghost source');
				return response.blob();
			})
			.then((blob) =>
				createImageBitmap(blob, {
					resizeWidth: width,
					resizeHeight: height,
					resizeQuality: 'medium',
					imageOrientation: 'flipY'
				})
			)
			.then((bitmap) => storeTexture(key, bitmap))
			.catch(() => {
				rejected.add(key);
			})
			.finally(() => pendingTextures.delete(key));
		return null;
	}

	function update() {
		if (!group) return;
		const now = performance.now();
		const awake = now <= activeUntil;
		if (!awake && fade < 0.02) {
			fade = 0;
			for (const mesh of meshes.values()) mesh.visible = false;
			return;
		}
		if (now - lastUpdate < 48) return;
		lastUpdate = now;
		fade += ((awake ? 1 : 0) - fade) * 0.3;
		galleryCamera.left = -$size.width / 2;
		galleryCamera.right = $size.width / 2;
		galleryCamera.top = $size.height / 2;
		galleryCamera.bottom = -$size.height / 2;
		galleryCamera.updateProjectionMatrix();
		frame++;
		const opened = !!document.querySelector('.viewer');
		const rail = opened ? document.querySelector<HTMLElement>('.thumbnails') : null;
		const railMoving = rail?.classList.contains('moving');
		const railBounds = rail?.getBoundingClientRect();
		const horizontal = !!rail?.classList.contains('horizontal');
		const lo = (r: { left: number; top: number }) => (horizontal ? r.left : r.top);
		const hi = (r: { right: number; bottom: number }) => (horizontal ? r.right : r.bottom);
		const elements: (HTMLImageElement | HTMLVideoElement)[] = [];
		if (opened) {
			const feature = document.querySelector<HTMLImageElement | HTMLVideoElement>(
				'.feature-media [data-gallery-ghost]'
			);
			if (feature) elements.push(feature);
		} else {
			for (const item of document.querySelectorAll<HTMLElement>('.grid-item')) {
				const left = parseFloat(item.style.left);
				const top = parseFloat(item.style.top);
				const width = parseFloat(item.style.width);
				const height = parseFloat(item.style.height);
				if (left + width <= 0 || top + height <= 0 || left >= $size.width || top >= $size.height)
					continue;
				const element = item.querySelector<HTMLImageElement | HTMLVideoElement>(
					'[data-gallery-ghost]'
				);
				if (element) elements.push(element);
			}
		}
		if (rail && railBounds && !railMoving) {
			const buttons = rail.children;
			let start = 0;
			let end = buttons.length;
			while (start < end) {
				const middle = Math.floor((start + end) / 2);
				if (hi(buttons[middle].getBoundingClientRect()) <= lo(railBounds)) start = middle + 1;
				else end = middle;
			}
			for (let index = start; index < buttons.length; index++) {
				const button = buttons[index];
				if (lo(button.getBoundingClientRect()) >= hi(railBounds)) break;
				const element = button.querySelector<HTMLImageElement | HTMLVideoElement>(
					'[data-gallery-ghost]'
				);
				if (element) elements.push(element);
			}
		}
		const visible = new Set<Element>();
		for (const element of elements) {
			if (element.closest('.grid-item.entering')) continue;
			if (element.closest('.grid-item.source-hidden')) continue;
			if (element.closest('[data-zoomed]')) continue;
			const inRail = rail?.contains(element);
			const item = element.closest<HTMLElement>('.grid-item');
			const boundsElement =
				element.closest<HTMLElement>('.feature-media') ??
				(inRail ? element.parentElement : element);
			let rect: {
				left: number;
				top: number;
				right: number;
				bottom: number;
				width: number;
				height: number;
			};
			if (item && !(hoverUntil.get(item)! > now) && !item.matches(':focus-visible')) {
				const left = parseFloat(item.style.left);
				const top = parseFloat(item.style.top);
				const width = parseFloat(item.style.width);
				const height = parseFloat(item.style.height);
				rect = { left, top, width, height, right: left + width, bottom: top + height };
			} else {
				rect = (boundsElement ?? element).getBoundingClientRect();
			}
			if (inRail && railBounds && !railMoving && lo(rect) >= hi(railBounds)) continue;
			if (
				rect.right <= 0 ||
				rect.bottom <= 0 ||
				rect.left >= $size.width ||
				rect.top >= $size.height
			)
				continue;
			if (inRail && railBounds && !railMoving) {
				if (lo(rect) < lo(railBounds) || hi(rect) > hi(railBounds)) continue;
			}
			visible.add(element);
			let mesh = meshes.get(element);
			const texture = textureFor(element);
			if (!texture) {
				if (mesh) mesh.visible = false;
				continue;
			}
			if (!mesh) {
				mesh = freeMeshes.pop();
				if (!mesh) {
					const material = new ShaderMaterial({
						uniforms: { map: { value: texture }, crop: { value: [1, 1] }, fade: { value: 1 } },
						vertexShader:
							'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
						fragmentShader:
							'uniform sampler2D map; uniform vec2 crop; uniform float fade; varying vec2 vUv; void main() { gl_FragColor = texture2D(map, (vUv - 0.5) * crop + 0.5); gl_FragColor = sRGBTransferOETF(gl_FragColor); gl_FragColor.a *= 0.4 * fade; }',
						transparent: true,
						depthTest: false,
						depthWrite: false
					});
					mesh = new Mesh(geometry, material);
					group.add(mesh);
				}
				meshes.set(element, mesh);
			}
			mesh.visible = true;
			const sourceWidth =
				element instanceof HTMLVideoElement ? element.videoWidth : element.naturalWidth;
			const sourceHeight =
				element instanceof HTMLVideoElement ? element.videoHeight : element.naturalHeight;
			const imageAspect = sourceWidth / sourceHeight;
			const boxAspect = rect.width / rect.height;
			mesh.material.uniforms.map.value = texture;
			mesh.material.uniforms.fade.value = fade;
			mesh.material.uniforms.crop.value =
				imageAspect > boxAspect ? [boxAspect / imageAspect, 1] : [1, imageAspect / boxAspect];
			mesh.position.set(
				rect.left + rect.width / 2 - $size.width / 2,
				$size.height / 2 - rect.top - rect.height / 2,
				0
			);
			mesh.scale.set(rect.width, rect.height, 1);
		}
		for (const [element, mesh] of meshes) {
			if (visible.has(element)) continue;
			mesh.visible = false;
			freeMeshes.push(mesh);
			meshes.delete(element);
		}
		if (textures.size > 24) {
			for (const [key, entry] of textures) {
				if (entry.used === frame) continue;
				entry.texture.dispose();
				entry.bitmap.close();
				textures.delete(key);
				if (textures.size <= 24) break;
			}
		}
	}

	onDestroy(() => {
		destroyed = true;
		textureRequests.abort();
		textureWorker?.terminate();
		for (const mesh of meshes.values()) mesh.material.dispose();
		for (const mesh of freeMeshes) mesh.material.dispose();
		for (const entry of textures.values()) {
			entry.texture.dispose();
			entry.bitmap.close();
		}
		geometry.dispose();
	});
</script>

<PostFXScene beforeRender={update} camera={galleryCamera}>
	<T.Group bind:ref={group} />
</PostFXScene>
