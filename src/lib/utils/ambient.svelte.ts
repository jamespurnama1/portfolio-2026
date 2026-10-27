import { getAudioContext } from '#lib/utils/sfx.js';
import { soundPrefs } from '#lib/utils/soundPrefs.svelte.js';
import { introGateStore } from '#lib/stores/index.svelte.js';

type Graph = {
	master: GainNode;
	oscillators: OscillatorNode[];
	timer: ReturnType<typeof setInterval>;
};

let playing = $state(false);
let graph: Graph | null = null;
let resumeAfterMedia = false;
let armed = false;

// A–minor pentatonic, struck notes echo left/right and fade out like the ghosting on screen.
const NOTES = [220, 261.63, 329.63, 392, 440, 523.25, 659.25];

function build(ctx: AudioContext): Graph {
	const master = ctx.createGain();
	master.gain.value = 0;
	master.connect(ctx.destination);

	const delayL = ctx.createDelay(2);
	const delayR = ctx.createDelay(2);
	delayL.delayTime.value = 0.46;
	delayR.delayTime.value = 0.69;
	const feedL = ctx.createGain();
	const feedR = ctx.createGain();
	feedL.gain.value = 0.58;
	feedR.gain.value = 0.58;
	const panL = ctx.createStereoPanner();
	const panR = ctx.createStereoPanner();
	panL.pan.value = -1;
	panR.pan.value = 1;
	delayL.connect(feedL).connect(delayR);
	delayR.connect(feedR).connect(delayL);
	delayL.connect(panL).connect(master);
	delayR.connect(panR).connect(master);

	// Slowly breathing pad
	const padFilter = ctx.createBiquadFilter();
	padFilter.type = 'lowpass';
	padFilter.frequency.value = 700;
	const padGain = ctx.createGain();
	padGain.gain.value = 0.05;
	padFilter.connect(padGain).connect(master);
	padGain.connect(delayL);

	const lfo = ctx.createOscillator();
	lfo.frequency.value = 0.08;
	const lfoDepth = ctx.createGain();
	lfoDepth.gain.value = 380;
	lfo.connect(lfoDepth).connect(padFilter.frequency);
	lfo.start();

	const oscillators: OscillatorNode[] = [lfo];
	[110, 164.81, 220.5, 329.2].forEach((freq, i) => {
		const osc = ctx.createOscillator();
		osc.type = i % 2 ? 'triangle' : 'sine';
		osc.frequency.value = freq;
		osc.detune.value = (i - 1.5) * 4;
		osc.connect(padFilter);
		osc.start();
		oscillators.push(osc);
	});

	const pluck = () => {
		const now = ctx.currentTime;
		const osc = ctx.createOscillator();
		const amp = ctx.createGain();
		osc.type = 'sine';
		osc.frequency.value = NOTES[Math.floor(Math.random() * NOTES.length)];
		amp.gain.setValueAtTime(0.0001, now);
		amp.gain.exponentialRampToValueAtTime(0.09, now + 0.03);
		amp.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
		osc.connect(amp);
		amp.connect(delayL);
		amp.connect(master);
		osc.start(now);
		osc.stop(now + 1.7);
	};
	const timer = setInterval(pluck, 2600);
	pluck();

	return { master, oscillators, timer };
}

async function start() {
	const ctx = getAudioContext();
	if (!ctx || !soundPrefs.enabled) return;
	try {
		await ctx.resume();
	} catch {
		return;
	}
	if (graph || !soundPrefs.enabled) return;
	graph = build(ctx);
	// Kept low so the sound effects stay audible over it.
	graph.master.gain.setTargetAtTime(0.28, ctx.currentTime, 1.2);
	playing = true;
}

function stop() {
	const ctx = getAudioContext();
	const current = graph;
	playing = false;
	graph = null;
	if (!ctx || !current) return;
	clearInterval(current.timer);
	current.master.gain.setTargetAtTime(0, ctx.currentTime, 0.4);
	setTimeout(() => {
		current.oscillators.forEach((osc) => osc.stop());
		current.master.disconnect();
	}, 1800);
}

export const ambient = {
	// The visitor's setting; defaults to on and is remembered once toggled.
	get on() {
		return soundPrefs.enabled;
	},
	get playing() {
		return playing;
	},
	toggle() {
		const next = !soundPrefs.enabled;
		soundPrefs.set(next, true);
		resumeAfterMedia = false;
		if (next) void start();
		else stop();
	},
	startIfEnabled() {
		void start();
	},
	// Browsers only allow audio after a gesture; start on the first one once the intro is over.
	armOnFirstGesture() {
		if (armed || typeof window === 'undefined') return;
		armed = true;
		const handler = () => {
			if (introGateStore.phase !== 'done') return;
			window.removeEventListener('pointerdown', handler);
			window.removeEventListener('keydown', handler);
			void start();
		};
		window.addEventListener('pointerdown', handler);
		window.addEventListener('keydown', handler);
	},
	// Video playback in the media viewer pauses the music; it comes back only if it was playing.
	pauseForMedia() {
		if (!graph) return;
		resumeAfterMedia = true;
		stop();
	},
	resumeFromMedia() {
		if (!resumeAfterMedia) return;
		resumeAfterMedia = false;
		if (soundPrefs.enabled) void start();
	}
};
