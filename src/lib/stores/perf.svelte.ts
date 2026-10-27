/**
 * Lightweight per-frame performance profiler.
 *
 * Usage:
 *   perfStore.tick(delta)                    — call once per frame
 *   perfStore.measure('id', fn)              — CPU-side timing (JS queue time only)
 *   perfStore.measureSync('id', gl, fn)      — CPU+GPU timing: calls gl.finish() after fn
 *                                              to block until GPU completes. Expensive!
 *                                              Only runs when perfStore.gpuSync is true.
 *   perfStore.isolate['id'] = true           — skips fn entirely
 *   perfStore.resetMaxes()                   — clears maxMs on all phases
 *
 * Zero overhead when perfStore.enabled is false.
 * gpuSync adds gl.finish() stalls — enable only for diagnosis, not production.
 */

const ROLLING_WINDOW = 30;

type PhaseStats = { avgMs: number; maxMs: number; samples: number[] };

let enabled = $state(false);
let gpuSync = $state(false);
let fps = $state(0);
let frameBudget = $state(16.67);
let phases = $state<Record<string, PhaseStats>>({});
let isolate = $state<Record<string, boolean>>({});

// Written each frame by PostFXManager — exposes WebGLRenderer.info.render
// so Debug.svelte can display draw calls and triangle count without needing
// access to the renderer context.
let drawCalls = $state(0);
let triangles = $state(0);

const _fpsBuffer: number[] = [];

function measure(id: string, fn: () => void): void {
	if (!enabled) {
		fn();
		return;
	}
	// Isolate mode: skip the phase entirely so you can observe the FPS impact.
	if (isolate[id]) return;

	const t0 = performance.now();
	fn();
	const elapsed = performance.now() - t0;
	_record(id, elapsed);
}

/**
 * Like measure(), but calls gl.finish() after fn to flush the GPU command queue
 * and block until the GPU completes the work. This converts async GPU timing into
 * synchronous wall-clock time, revealing true GPU cost per sub-phase.
 *
 * ONLY runs the finish() when gpuSync is true — otherwise behaves like measure().
 * gl.finish() itself stalls the CPU thread and will reduce FPS while active.
 */
function measureSync(
	id: string,
	gl: WebGL2RenderingContext | WebGLRenderingContext,
	fn: () => void
): void {
	if (!enabled) {
		fn();
		return;
	}
	if (isolate[id]) return;

	const t0 = performance.now();
	fn();
	if (gpuSync) gl.finish();
	const elapsed = performance.now() - t0;
	_record(id, elapsed);
}

function _record(id: string, elapsed: number): void {
	if (!phases[id]) {
		phases[id] = { avgMs: 0, maxMs: 0, samples: [] };
	}
	const phase = phases[id];
	phase.samples.push(elapsed);
	if (phase.samples.length > ROLLING_WINDOW) phase.samples.shift();
	phase.avgMs = phase.samples.reduce((a, b) => a + b, 0) / phase.samples.length;
	if (elapsed > phase.maxMs) phase.maxMs = elapsed;
}

/** Call once per frame at the top of the PostFXManager useTask. delta is in seconds. */
function tick(delta: number): void {
	if (!enabled) return;
	const frameMs = delta * 1000;
	_fpsBuffer.push(frameMs);
	if (_fpsBuffer.length > 60) _fpsBuffer.shift();
	const avgFrameMs = _fpsBuffer.reduce((a, b) => a + b, 0) / _fpsBuffer.length;
	fps = Math.round(1000 / Math.max(avgFrameMs, 1));
	frameBudget = Math.round(avgFrameMs * 100) / 100;
}

function resetMaxes(): void {
	for (const id in phases) {
		phases[id].maxMs = 0;
	}
}

export const perfStore = {
	get enabled() {
		return enabled;
	},
	set enabled(v) {
		enabled = v;
	},
	get gpuSync() {
		return gpuSync;
	},
	set gpuSync(v) {
		gpuSync = v;
	},
	get fps() {
		return fps;
	},
	get frameBudget() {
		return frameBudget;
	},
	get phases() {
		return phases;
	},
	get isolate() {
		return isolate;
	},
	get drawCalls() {
		return drawCalls;
	},
	set drawCalls(v) {
		drawCalls = v;
	},
	get triangles() {
		return triangles;
	},
	set triangles(v) {
		triangles = v;
	},
	measure,
	measureSync,
	tick,
	resetMaxes
};
