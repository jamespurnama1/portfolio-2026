import type { PlaneGeometry } from 'three';
import { get } from 'svelte/store';
import {
	countStore,
	gptStore,
	loadStore,
	projectsStore,
	scrollStore
} from '$lib/stores/index.svelte';
import { projectSectionStore } from '$lib/stores/projectSection';

type size = {
	width: number;
	height: number;
};

const topLeft = (cardSize: number) => cardSize / 2;

const shouldDebugWorkScroll = () => {
	if (typeof window === 'undefined') return false;
	const debugWindow = window as Window & {
		__DEBUG_WORK_SCROLL__?: boolean;
		DEBUG_WORK_SCROLL?: boolean;
	};
	return Boolean(debugWindow.__DEBUG_WORK_SCROLL__ || debugWindow.DEBUG_WORK_SCROLL);
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

export const initialPos = (index: number) => {
	// Initial loading position - all cards start from center at scale 0
	return {
		x: 0,
		y: 0,
		z: -index,
		scale: 1,
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

	// Blend between smoothStep and easeOutCubic for slower ramp-up
	const smoothed = smoothStep(fractional);
	const eased = easeOutCubic(fractional);
	const blended = smoothed * 0.9 + eased * 0.1;

	return integer + blended * Math.sign(diff);
};

export const homePos = (index: number, imageGeo: PlaneGeometry, size: size) => {
	const indexDiff = countStore.inertiaIndex - index;
	const activeDiff = index + 1 - countStore.activeIndex;
	const sectionViewportTop = get(projectSectionStore).viewportTop;
	const mobile = size.width <= 768;
	// Apply smooth inertia interpolation to the position difference
	const smoothedIndexDiff = applyInertia(indexDiff);
	const rawOpacity = Math.min(Math.max(0, activeDiff * 1.8), 1);
	const smallSize = mobile ? 0.5 : 0.3;
	let baseScale = mobile ? 1.5 : 1;

	let scale =
		Math.abs(smoothedIndexDiff) < 1
			? Math.max(smallSize, baseScale - Math.abs(smoothedIndexDiff))
			: smallSize;

	const cardWidth = imageGeo.parameters.width * scale;
	const cardHeight = imageGeo.parameters.height * scale;

	let spacing = size.height / 50;
	let x = mobile ? 0 : topLeft(cardWidth) - size.width * 0.5;
	// add y offset spacing except for active card
	let y =
		// offset depending on top or bottom of active card
		Math.sign(smoothedIndexDiff) * topLeft(cardHeight) +
		// active card
		Math.sign(smoothedIndexDiff) * ((imageGeo.parameters.height * baseScale) / 2) +
		//spacing on top (none for active card)
		smoothedIndexDiff * spacing +
		// card on top
		(smoothedIndexDiff - Math.sign(smoothedIndexDiff)) * cardHeight;

	y -= sectionViewportTop;

	// console.log(
	// 	smoothedIndexDiff,
	// 	'size: ',
	// 	cardHeight,
	// 	'offset: ',
	// 	Math.sign(smoothedIndexDiff) * topLeft(cardHeight),
	// 	'active: ',
	// 	Math.sign(smoothedIndexDiff) * (imageGeo.parameters.height / 2),
	// 	'spacing: ',
	// 	smoothedIndexDiff * spacing,
	// 	'card top: ',
	// 	(smoothedIndexDiff - Math.sign(smoothedIndexDiff)) * cardHeight,
	// 	'y: ',
	// 	y
	// );
	// if (size.width < 768) {
	// 	return {
	// 		// center card on small screens
	// 		x: 0,
	// 		y: spacing * -(index - countStore.activeIndex),
	// 		z: 0.6 * smoothedIndexDiff - 10,
	// 		scale: (1 + (smoothedIndexDiff * 3) / projectsStore.projectsLength) * 0.75,
	// 		opacity: gptStore.opened || loadStore.galleryTransitioning ? 0 : rawOpacity
	// 	};
	// }
	// console.log('[POS] home pos', x, y, Math.abs(smoothedIndexDiff));
	return {
		x,
		y,
		z: 0.6 * smoothedIndexDiff - 10,
		scale,
		opacity: gptStore.opened || loadStore.galleryTransitioning ? 0 : rawOpacity
	};
};

export const enlarged = (
	index: number,
	delay = (Math.max(index / projectsStore.projectsLength) - 0.1, 0),
	maxSize?: number
) => {
	// Center horizontally if maxSize provided
	const x = maxSize ? maxSize / 2 : 0;
	return {
		x,
		y: 0,
		z: -0.6 * (index - 1),
		delay,
		scale: 0.8,
		opacity: gptStore.opened ? 0 : 1
	};
};

export const fullscreen = (index: number, imageGeo: PlaneGeometry, size: size) => {
	// Fit within 85% of both viewport dimensions, preserving aspect ratio
	const scaleByWidth = (size.width * 0.85) / imageGeo.parameters.width;
	const scaleByHeight = (size.height * 0.85) / imageGeo.parameters.height;
	const scale = Math.min(scaleByWidth, scaleByHeight);
	return {
		x: 0,
		y: 0,
		z: -0.6 * (index - 1),
		scale,
		opacity: gptStore.opened ? 0 : 1
	};
};

export const projectPage = (
	index: number,
	size: size,
	works: boolean,
	imageGeo: PlaneGeometry,
	maxSize?: number
) => {
	let scale = 1;
	const countIndex = countStore.inertiaIndex;
	let x = 0;
	let y = 0;
	let opacity = 1;
	const cardWidth = imageGeo.parameters.width * scale;
	const mobile = size.width <= 768;
	// Get actual media element position and convert to Three.js coordinates
	const mediaEl = document.getElementById(`media-${index}`) as HTMLImageElement | HTMLVideoElement;
	if (works && index === 0) {
		const aspect = imageGeo.parameters.width / imageGeo.parameters.height || 16 / 9;
		const desktopMaxWidth = size.width * 0.48;
		const desktopHeight = size.height * 0.46;
		const mobileWidth = size.width * 0.9;
		const desiredWidth = mobile ? mobileWidth : Math.min(desktopHeight * aspect, desktopMaxWidth);
		const desiredHeight = desiredWidth / aspect;
		if (!mediaEl) {
			return {
				x: 0,
				y: 0,
				z: -0.6,
				scale: desiredWidth / Math.max(imageGeo.parameters.width, 1),
				opacity
			};
		}
		const rect = mediaEl.getBoundingClientRect();
		const fallbackHeroPos = {
			x: rect.left + rect.width / 2 - size.width / 2,
			y: -(rect.top + rect.height / 2) + size.height / 2,
			z: -0.6,
			scale: desiredWidth / Math.max(imageGeo.parameters.width, 1),
			opacity
		};
		const widthDelta = Math.abs(rect.width - desiredWidth);
		const heightDelta = Math.abs(rect.height - desiredHeight);
		const widthTolerance = Math.max(24, desiredWidth * 0.12);
		const heightTolerance = Math.max(24, desiredHeight * 0.12);
		const rectLooksUnstable =
			rect.width < 32 ||
			rect.height < 32 ||
			widthDelta > widthTolerance ||
			heightDelta > heightTolerance;
		if (rectLooksUnstable) {
			if (shouldDebugWorkScroll()) {
				console.log('[work-scroll/hero:fallback]', {
					index,
					rect: {
						left: rect.left,
						top: rect.top,
						width: rect.width,
						height: rect.height
					},
					desiredWidth,
					desiredHeight,
					fallback: fallbackHeroPos,
					scrollY: typeof window !== 'undefined' ? window.scrollY : 0
				});
			}
			return {
				...fallbackHeroPos
			};
		}
	}
	if (works && mediaEl) {
		const rect = mediaEl.getBoundingClientRect();
		// match scale to element size
		scale = rect.width / cardWidth;
		// Convert from screen coordinates (top-left origin) to Three.js coordinates (center origin)
		x = rect.left + topLeft(rect.width) - size.width / 2;
		y = -rect.top + size.height / 2 - topLeft(rect.height);
		opacity = works ? 1 : countIndex === index ? 1 : 0;
	} else {
		x = mobile ? 0 : topLeft(cardWidth) - size.width * 0.5;
		y = -index * size.height;
	}

	// if (index === 1) console.log('[POS] projectPage', x, y, scale, works);

	return {
		x,
		y,
		z: -0.6,
		scale,
		opacity
	};
};
