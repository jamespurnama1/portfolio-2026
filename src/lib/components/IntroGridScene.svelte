<script lang="ts">
	import { T, useTask } from '@threlte/core';
	import {
		AdditiveBlending,
		BackSide,
		Color,
		Group,
		MathUtils,
		Mesh,
		MeshPhysicalMaterial,
		BoxGeometry
	} from 'three';
	import { introSectionStore } from '$lib/stores/introSection';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { perfStore } from '$lib/stores/perf.svelte';
	import { loadStore, homeTransitionStore, introGateStore } from '$lib/stores/index.svelte';
	import { page } from '$app/state';
	import { onMount, onDestroy } from 'svelte';
	import { isMobile } from '$lib/utils/device';
	import { sfx } from '$lib/utils/sfx';

	// Transmission forces an extra full-scene render pass; skip it on mobile.
	const lite = isMobile;

	let { mouse = { x: 0, y: 0 } }: { mouse?: { x: number; y: number } } = $props();

	const GRID_SIZE = 9;
	const SPACING = 132;
	const BOX_SIZE = 112;
	const INTRO_GROUP_START_Y = 210;
	const INTRO_GROUP_END_Y = -18;
	const ROTATION_OFFSET = Math.PI * 0.5;
	const CENTER_INDEX = (GRID_SIZE * GRID_SIZE - 1) / 2;
	const MAX_RADIUS = Math.hypot((GRID_SIZE - 1) / 2, (GRID_SIZE - 1) / 2);
	const boxGeometry = new BoxGeometry(BOX_SIZE, BOX_SIZE, 8);
	onDestroy(() => boxGeometry.dispose());
	const baseColor = new Color('#f5f5f5');
	const glassColor = new Color('#ffffff');
	const hoverGlowStartDark = new Color('#b4abd8');
	const hoverGlowEndDark = new Color('#78b3d4');
	const hoverGlowStartLight = new Color('#4b5427');
	const hoverGlowEndLight = new Color('#874c2b');
	const pointerTilt = { x: 0, y: 0 };
	const gyroTilt = { x: 0, y: 0 };
	const interactiveTilt = { x: 0, y: 0 };
	const loadInState = { progress: 0 };
	let preferGyro = false;
	let hasGyroInput = false;

	function getIntroGridOffsetX() {
		const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1440;
		return viewportWidth < 768 ? viewportWidth * 0.22 : Math.min(viewportWidth * 0.24, 340);
	}

	function getIntroGridOffsetY() {
		if (typeof window === 'undefined' || window.innerWidth >= 768) return 0;
		return window.innerHeight * 0.28;
	}

	const cells = Array.from({ length: GRID_SIZE * GRID_SIZE }, (_, index) => {
		const xIndex = index % GRID_SIZE;
		const yIndex = Math.floor(index / GRID_SIZE);
		const offsetX = xIndex - (GRID_SIZE - 1) / 2;
		const offsetY = yIndex - (GRID_SIZE - 1) / 2;
		return {
			index,
			x: offsetX * SPACING,
			y: offsetY * SPACING,
			radius: Math.hypot(offsetX, offsetY)
		};
	});

	let introGroup = $state<Group>();
	let introBoxes = $state<Array<Mesh>>([]);
	let hoveredIndex = $state(-1);

	function clampUnit(value: number, limit = 1) {
		return MathUtils.clamp(value, -limit, limit);
	}

	onMount(() => {
		if (typeof window === 'undefined') return;
		preferGyro = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

		const handleOrientation = (event: DeviceOrientationEvent) => {
			if (!preferGyro || event.beta == null || event.gamma == null) return;
			hasGyroInput = true;
			gyroTilt.x = clampUnit(event.beta / 45);
			gyroTilt.y = clampUnit(event.gamma / 35);
		};

		window.addEventListener('deviceorientation', handleOrientation);

		return () => {
			window.removeEventListener('deviceorientation', handleOrientation);
		};
	});

	function getReveal(progress: number, radius: number) {
		const waveCenter = Math.max(0, (progress - 0.45) / 0.55) * MAX_RADIUS;
		return MathUtils.clamp(1 - (radius - waveCenter) / 1.25, 0, 1);
	}

	function getBoxScale(progress: number, index: number) {
		const reveal =
			index === CENTER_INDEX
				? MathUtils.smoothstep(progress, 0.16, 0.34)
				: getReveal(progress, cells[index].radius);
		return index === CENTER_INDEX
			? MathUtils.lerp(0.001, 1, reveal) *
					MathUtils.lerp(1.25, 1, MathUtils.smoothstep(progress, 0, 0.3))
			: MathUtils.lerp(0.001, 1, reveal);
	}

	function getBoxPositionZ(progress: number, index: number) {
		const fadeProgress = MathUtils.smoothstep(progress, 0.84, 1);
		const reveal =
			index === CENTER_INDEX
				? MathUtils.smoothstep(progress, 0.16, 0.34)
				: getReveal(progress, cells[index].radius);
		return index === CENTER_INDEX
			? MathUtils.lerp(48, 24, fadeProgress)
			: MathUtils.lerp(reveal * 16, reveal * -8, fadeProgress);
	}

	function getHoverGlowStrength(progress: number, index: number) {
		const glassBlend = MathUtils.smoothstep(progress, 0.62, 0.86);
		return hoveredIndex === index ? MathUtils.lerp(0.45, 1, glassBlend) : 0;
	}

	function getHoverGlowColor(index: number, side: 'start' | 'end') {
		const startColor = optionsStore.dark ? hoverGlowStartDark : hoverGlowStartLight;
		const endColor = optionsStore.dark ? hoverGlowEndDark : hoverGlowEndLight;
		const t = (cells[index].x / ((GRID_SIZE - 1) * SPACING) + 0.5) * 0.85 + 0.075;
		return side === 'start'
			? startColor.clone().lerp(endColor, t * 0.35)
			: startColor.clone().lerp(endColor, 0.65 + t * 0.35);
	}

	let lastMaterialSignature = '';

	function updateMaterials(progress: number) {
		const signature = `${progress.toFixed(4)}|${loadInState.progress.toFixed(4)}|${hoveredIndex}|${optionsStore.dark}|${page.url.pathname}`;
		if (signature === lastMaterialSignature) return;
		lastMaterialSignature = signature;
		// The canvas is inverted in light mode, so rendering white here produces a black result visually.
		baseColor.set('#f5f5f5');
		glassColor.set(optionsStore.dark ? '#d8f3ff' : '#ffffff');
		const centerReveal = MathUtils.smoothstep(progress, 0.16, 0.34);
		const materialBlend = MathUtils.smoothstep(progress, 0.22, 0.6);
		const glassBlend = MathUtils.smoothstep(progress, 0.62, 0.86);
		const fadeProgress = MathUtils.smoothstep(progress, 0.84, 1);
		const loadReveal = MathUtils.smoothstep(loadInState.progress, 0, 1);
		const opacity = (1 - fadeProgress) * loadReveal;
		const transmission = lite
			? 0
			: Math.max(0.001, MathUtils.lerp(materialBlend * 0.7, 1, glassBlend));
		const roughness = MathUtils.lerp(0.92, 0.015, materialBlend + glassBlend * 0.25);
		const metalness = MathUtils.lerp(0.0, 0.04, materialBlend);
		const thickness = MathUtils.lerp(0.5, 6.5, materialBlend + glassBlend * 0.2);
		const envIntensity = MathUtils.lerp(0.35, 3.4, materialBlend + glassBlend * 0.2);
		const iridescence = lite
			? 0
			: Math.max(0.001, MathUtils.lerp(materialBlend * 0.3, 1, glassBlend));
		const clearcoat = MathUtils.lerp(0.05, 1, materialBlend + glassBlend * 0.2);

		introBoxes.forEach((mesh, index) => {
			if (!(mesh?.material instanceof MeshPhysicalMaterial)) return;
			const reveal =
				index === CENTER_INDEX ? centerReveal : getReveal(progress, cells[index].radius);
			const isHovered = hoveredIndex === index;
			const opacityMultiplier = index === CENTER_INDEX ? 1 : 0.38;
			const scale = getBoxScale(progress, index);
			mesh.scale.setScalar(scale);
			mesh.position.z = getBoxPositionZ(progress, index);
			mesh.material.color
				.copy(baseColor)
				.lerp(glassColor, Math.min(1, materialBlend * 0.2 + glassBlend * 0.8));
			mesh.material.transmission = transmission * (isHovered ? 0.92 : 1);
			mesh.material.roughness = roughness + (isHovered ? 0.04 : 0);
			mesh.material.metalness = metalness;
			mesh.material.thickness = thickness;
			mesh.material.envMapIntensity = envIntensity * (isHovered ? 0.82 : 1);
			mesh.material.ior = MathUtils.lerp(1.0, 1.6, materialBlend + glassBlend * 0.15);
			mesh.material.iridescence = iridescence;
			mesh.material.iridescenceIOR = MathUtils.lerp(1.3, 1.6, glassBlend);
			mesh.material.clearcoat = clearcoat;
			mesh.material.clearcoatRoughness = MathUtils.lerp(
				0.8,
				0.02,
				materialBlend + glassBlend * 0.25
			);
			mesh.material.reflectivity = MathUtils.lerp(0.15, 1, materialBlend + glassBlend * 0.2);
			if ('dispersion' in mesh.material) {
				(mesh.material as MeshPhysicalMaterial & { dispersion: number }).dispersion =
					MathUtils.lerp(lite ? 0 : 0.001, lite ? 0 : 1, glassBlend);
			}
			mesh.material.opacity =
				(index === CENTER_INDEX ? opacity : opacity * reveal * opacityMultiplier) *
				(isHovered ? 0.78 : 1);
			mesh.visible = page.url.pathname === '/' && opacity > 0.001 && reveal > 0.001;
		});
	}

	useTask(() => {
		if (optionsStore.disableIntroScene || homeTransitionStore.pending) {
			if (introGroup) introGroup.visible = false;
			return;
		}
		if (!introGroup || page.url.pathname !== '/') return;
		perfStore.measure('intro', () => {
			const progress = $introSectionStore.progress;
			const sectionActive = $introSectionStore.active;
			const loadTarget = loadStore.loaded && introGateStore.phase === 'done' ? 1 : 0;
			loadInState.progress += (loadTarget - loadInState.progress) * 0.085;
			const loadProgress = MathUtils.smoothstep(loadInState.progress, 0, 1);
			if (typeof window !== 'undefined') {
				pointerTilt.x = clampUnit(mouse.y / (window.innerHeight * 0.5));
				pointerTilt.y = clampUnit(mouse.x / (window.innerWidth * 0.5));
			}
			const tiltSource = preferGyro && hasGyroInput ? gyroTilt : pointerTilt;
			interactiveTilt.x += (tiltSource.x - interactiveTilt.x) * 0.08;
			interactiveTilt.y += (tiltSource.y - interactiveTilt.y) * 0.08;
			const introOffsetX = getIntroGridOffsetX();
			const tiltProgress = MathUtils.smoothstep(progress, 0.0, 0.45);
			const fadeProgress = MathUtils.smoothstep(progress, 0.84, 1);
			introGroup!.visible = sectionActive && fadeProgress < 0.999 && loadProgress > 0.002;
			introGroup!.rotation.x =
				MathUtils.lerp(-1.32, -Math.PI * 0.5, tiltProgress) +
				ROTATION_OFFSET +
				interactiveTilt.x * 0.22;
			introGroup!.rotation.y = MathUtils.lerp(0.22, 0, tiltProgress) + interactiveTilt.y * 0.28;
			introGroup!.rotation.z = 0;
			introGroup!.position.x = introOffsetX + interactiveTilt.y * 26;
			introGroup!.position.y =
				MathUtils.lerp(
					INTRO_GROUP_START_Y,
					INTRO_GROUP_END_Y,
					MathUtils.smoothstep(progress, 0.0, 0.35)
				) +
				interactiveTilt.x * -20 +
				getIntroGridOffsetY();
			introGroup!.position.z =
				MathUtils.lerp(160, -24, MathUtils.smoothstep(progress, 0.0, 0.4)) +
				MathUtils.lerp(320, 0, loadProgress);
			introGroup!.scale.setScalar(
				MathUtils.lerp(1.6, 0.94, MathUtils.smoothstep(progress, 0.0, 0.35))
			);
			introGroup!.scale.multiplyScalar(MathUtils.lerp(1, 0.92, fadeProgress));
			introGroup!.scale.multiplyScalar(MathUtils.lerp(0.001, 1, loadProgress));
			updateMaterials(progress);
		});
	});

	function isBoxMostlyVisible(index: number) {
		const mesh = introBoxes[index];
		if (!mesh || !mesh.visible || !introGroup?.visible) return false;
		if (!(mesh.material instanceof MeshPhysicalMaterial)) return false;
		const maxOpacity = index === CENTER_INDEX ? 1 : 0.38;
		return mesh.scale.x >= 0.3 && mesh.material.opacity / maxOpacity >= 0.3;
	}

	function handlePointerOver(index: number) {
		if (hoveredIndex !== index && isBoxMostlyVisible(index)) sfx.tick();
		hoveredIndex = index;
	}

	function handlePointerLeave() {
		hoveredIndex = -1;
	}
</script>

<T.Group
	bind:ref={introGroup}
	visible={page.url.pathname === '/' && $introSectionStore.active && !homeTransitionStore.pending}
>
	<T.AmbientLight intensity={0.85} />
	<T.DirectionalLight position={[420, 520, 380]} intensity={2.8} color={'#ffffff'} />
	<T.DirectionalLight position={[-340, -180, 240]} intensity={1.15} color={'#9ddcff'} />
	<T.PointLight
		position={[0, 0, 460]}
		intensity={65}
		color={optionsStore.dark ? '#ffffff' : '#dbeafe'}
	/>
	{#each cells as cell, index}
		{@const isHovered = hoveredIndex === index}
		<T.Mesh
			bind:ref={introBoxes[index]}
			position={[cell.x, cell.y, index === CENTER_INDEX ? 24 : 0]}
			renderOrder={index === CENTER_INDEX ? 40 : 30}
			onpointerover={() => handlePointerOver(index)}
			onpointerleave={handlePointerLeave}
		>
			<T is={boxGeometry} attach="geometry" dispose={false} />
			<T.MeshPhysicalMaterial
				color={'#f5f5f5'}
				transparent={true}
				opacity={1}
				transmission={lite ? 0 : 0.001}
				iridescence={lite ? 0 : 0.001}
				dispersion={lite ? 0 : 0.001}
				clearcoat={0.05}
				depthWrite={true}
				depthTest={true}
			/>
		</T.Mesh>
		{#if isHovered}
			{@const currentProgress = $introSectionStore.progress}
			{@const boxScale = getBoxScale(currentProgress, index)}
			{@const boxPositionZ = getBoxPositionZ(currentProgress, index)}
			{@const hoverGlowStrength = getHoverGlowStrength(currentProgress, index)}
			<T.Mesh
				position={[cell.x - 4 * boxScale, cell.y, boxPositionZ]}
				scale={[boxScale * 1.12, boxScale * 1.12, boxScale * 1.24]}
				renderOrder={index === CENTER_INDEX ? 25 : 20}
				raycast={() => null}
			>
				<T is={boxGeometry} attach="geometry" dispose={false} />
				<T.MeshBasicMaterial
					color={getHoverGlowColor(index, 'start')}
					transparent={true}
					opacity={0.22 * hoverGlowStrength}
					blending={AdditiveBlending}
					depthWrite={false}
					depthTest={false}
					side={BackSide}
				/>
			</T.Mesh>
			<T.Mesh
				position={[cell.x + 4 * boxScale, cell.y, boxPositionZ]}
				scale={[boxScale * 1.12, boxScale * 1.12, boxScale * 1.24]}
				renderOrder={index === CENTER_INDEX ? 26 : 21}
				raycast={() => null}
			>
				<T is={boxGeometry} attach="geometry" dispose={false} />
				<T.MeshBasicMaterial
					color={getHoverGlowColor(index, 'end')}
					transparent={true}
					opacity={0.22 * hoverGlowStrength}
					blending={AdditiveBlending}
					depthWrite={false}
					depthTest={false}
					side={BackSide}
				/>
			</T.Mesh>
		{/if}
	{/each}
</T.Group>
