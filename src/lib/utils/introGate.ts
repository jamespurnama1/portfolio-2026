import { arrowScreen, introGateStore } from '#lib/stores/index.svelte.js';

export const GATE_MAX_CARDS = 8;

const TRAIL_LIFETIME_MS = 1100;
const TRAIL_INTERVAL_MS = 170;
const POINTER_INTERVAL_MS = 90;
const POINTER_MIN_DISTANCE = 56;
const TRAIL_MAX_PX = 294;

type GateTransform = {
	x: number;
	y: number;
	z: number;
	scale: number;
	ry: number;
	opacity: number;
};

const HIDDEN: GateTransform = { x: 0, y: 0, z: 0, scale: 0, ry: 0, opacity: 0 };

const spawns: ({ t0: number; x: number; y: number } | undefined)[] = [];
let nextSpawn = 0;
let lastSpawnMedia: string | undefined;
let lastSpawnAt = 0;
let lastAdvance = -1;
let lastPointerSpawn = { x: -9999, y: -9999 };

// Latest pointer position, fed by the intro prompt while it waits for a click.
export const gatePointer = { x: -9999, y: -9999 };

// Shared per-frame step; every card calls this, only the first call in a frame does work.
function spawn(media: string[], now: number, x: number, y: number) {
	for (let offset = 0; offset < media.length; offset += 1) {
		const index = (nextSpawn + offset) % media.length;
		if (media[index] === lastSpawnMedia) continue;
		spawns[index] = { t0: now, x, y };
		lastSpawnMedia = media[index];
		nextSpawn = index + 1;
		lastSpawnAt = now;
		return true;
	}
	return false;
}

function advance(now: number, media: string[], width: number, height: number) {
	if (!media.length) return;
	if (now - lastAdvance < 4) return;
	lastAdvance = now;
	const phase = introGateStore.phase;

	if (phase === 'waiting') {
		if (now - lastSpawnAt < POINTER_INTERVAL_MS) return;
		const moved = Math.hypot(
			gatePointer.x - lastPointerSpawn.x,
			gatePointer.y - lastPointerSpawn.y
		);
		if (gatePointer.x < 0 || moved < POINTER_MIN_DISTANCE) return;
		if (spawn(media, now, gatePointer.x, gatePointer.y)) {
			lastPointerSpawn = { x: gatePointer.x, y: gatePointer.y };
		}
		return;
	}

	if (phase !== 'loading' && phase !== 'finishing') return;
	const onScreen =
		arrowScreen.x > -width * 0.15 &&
		arrowScreen.x < width * 1.15 &&
		arrowScreen.y > -height * 0.15 &&
		arrowScreen.y < height * 1.15;
	if (!onScreen || now - lastSpawnAt < TRAIL_INTERVAL_MS) return;
	spawn(media, now, arrowScreen.x, arrowScreen.y);
}

export function gateTransform(
	index: number,
	media: string[],
	cardWidth: number,
	width: number,
	height: number,
	now: number
): GateTransform {
	advance(now, media, width, height);
	const spawn = spawns[index];
	if (!spawn) return HIDDEN;
	const u = (now - spawn.t0) / TRAIL_LIFETIME_MS;
	if (u < 0 || u >= 1) return HIDDEN;
	const peak = Math.min(width * 0.45, TRAIL_MAX_PX) / cardWidth;
	// 0 -> bigger -> 0
	return {
		x: spawn.x - width / 2,
		y: height / 2 - spawn.y,
		z: -30,
		scale: peak * Math.sin(Math.PI * u),
		ry: 0,
		opacity: 1
	};
}
