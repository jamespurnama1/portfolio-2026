import type { PlaneGeometry } from 'three';
import { countStore, gptStore, projectsStore, scrollStore } from '$lib/stores/index.svelte';

type size = {
	width: number;
	height: number;
};

export const centerPos = (index: number) => {
	// console.log('[POS] Center pos', index);
	return {
		x: 0,
		y: 0,
		z: 0.6 * (index - 1),
		scale: 2,
		opacity: 1
	};
};

// Add easing function for smoother transitions
const easeOutQuart = (x: number): number => {
	return 1 - Math.pow(1 - x, 4);
};

const easeOutCubic = (x: number): number => {
	return 1 - Math.pow(1 - x, 3);
};

// Add easing function for smoother opacity transitions
const easeOutQuad = (x: number): number => {
	return 1 - (1 - x) * (1 - x);
};

// Add smooth interpolation for position changes
const smoothStep = (x: number): number => {
	return x * x * (3 - 2 * x);
};

// Apply smooth inertia to the difference value
const applyInertia = (diff: number): number => {
	const fractional = Math.abs(diff % 1);
	const integer = diff - fractional * Math.sign(diff);

	// Blend between smoothStep and easeOutCubic for balanced interpolation
	const smoothed = smoothStep(fractional);
	const eased = easeOutCubic(fractional);
	const blended = smoothed * 0.6 + eased * 0.4;

	return integer + blended * Math.sign(diff);
};

export const homePos = (index: number, imageGeo: PlaneGeometry, size: size) => {
	// console.log('[POS] home pos', index);
	const indexDiff = countStore.inertiaIndex - index - 1;
	const activeDiff = index + 1 - countStore.activeIndex;

	// Apply smooth inertia interpolation to the position difference
	const smoothedIndexDiff = applyInertia(indexDiff);
	const rawOpacity = Math.min(Math.max(0, activeDiff), 1);

	return {
		// center minus 10% of width
		x: imageGeo.parameters.width * (smoothedIndexDiff * 0.1) - size.width * 0.1,
		// 0.1 modifer + card height 0.05 modifier
		y: imageGeo.parameters.height * (smoothedIndexDiff * 0.1) + imageGeo.parameters.height * 0.05,
		z: 0.6 * smoothedIndexDiff - 10,
		scale: (1 + smoothedIndexDiff / projectsStore.projectsLength) * 0.5,
		opacity: gptStore.opened ? 0 : easeOutQuad(rawOpacity)
	};
};

export const enlarged = (
	index: number,
	delay = (Math.max(index / projectsStore.projectsLength) - 0.1, 0)
) => {
	return {
		x: 0,
		y: 0,
		z: -0.6 * (index - 1),
		delay,
		scale: 0.8,
		opacity: gptStore.opened ? 0 : 1
	};
};

export const fullscreen = (index: number) => {
	// console.log('[POS] fullscreen', index);
	return {
		x: 0,
		y: 0,
		z: -0.6 * (index - 1),
		scale: 1,
		opacity: gptStore.opened ? 0 : 1
	};
};

export const projectPage = (
	index: number,
	size: size,
	works: boolean,
	imageGeo?: PlaneGeometry
) => {
	const scale = imageGeo ? 0.6 : 0;
	const scroll = Math.round(scrollStore.scroll);
	const countIndex = countStore.inertiaIndex;
	const over = (Math.log10(scrollStore.overScroll / 100) + 1.5) * 100;
	const overcompute = scrollStore.overScroll < 10 ? 0 : over;
	let x = 0;
	const y = works ? scroll - ((index + 1) * size.height - overcompute) : scroll;
	const opacity = works ? 1 : countIndex === index ? 1 : 0;
	if (works && index % 2 === 0 && imageGeo) {
		x = size.width / 2 - (imageGeo.parameters.width * scale) / 2 - 16;
	} else if (imageGeo) {
		x = -size.width / 2 + (imageGeo.parameters.width * scale) / 2 + 16;
	}
	// console.log('[POS] Project Page', index);
	return {
		// move left + offset image width origin + margin
		x,
		// if works child images, offset by viewport height. Starts at index = 2
		y,
		z: -0.6,
		scale,
		opacity: gptStore.opened ? 0 : opacity
	};
};
