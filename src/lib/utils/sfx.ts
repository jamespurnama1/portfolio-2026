import tinkUrl from '#lib/sound/tink.mp3';
import tink2Url from '#lib/sound/tink2.mp3';
import welcomeUrl from '#lib/sound/welcome.mp3';
import notifyUrl from '#lib/sound/notify.mp3';
import chatUrl from '#lib/sound/chat.mp3';
import closeUrl from '#lib/sound/close.mp3';

const SAMPLE_URLS = {
	tink: tinkUrl,
	tink2: tink2Url,
	welcome: welcomeUrl,
	notify: notifyUrl,
	chat: chatUrl,
	close: closeUrl
} as const;

type SampleName = keyof typeof SAMPLE_URLS;

let ctx: AudioContext | null = null;
let lastTickAt = 0;
let loading: Promise<void> | null = null;
const buffers: Partial<Record<SampleName, AudioBuffer>> = {};

function getContext() {
	if (typeof window === 'undefined') return null;
	if (!ctx) {
		const AudioCtor =
			window.AudioContext ||
			(window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
		if (!AudioCtor) return null;
		ctx = new AudioCtor();
	}
	return ctx;
}

// Shared with the ambient track so both use one AudioContext.
export function getAudioContext() {
	return getContext();
}

function loadBuffers(audio: AudioContext) {
	loading ??= Promise.all(
		(Object.keys(SAMPLE_URLS) as SampleName[]).map(async (name) => {
			try {
				const response = await fetch(SAMPLE_URLS[name]);
				buffers[name] = await audio.decodeAudioData(await response.arrayBuffer());
			} catch {
				/* a missing sample just stays silent */
			}
		})
	).then(() => undefined);
	return loading;
}

// Runs once the context is running; a suspended context only starts after a user gesture.
function whenRunning(play: (audio: AudioContext) => void) {
	const audio = getContext();
	if (!audio) return;
	if (audio.state === 'running') play(audio);
	else if (audio.state === 'suspended') {
		void audio
			.resume()
			.then(() => audio.state === 'running' && play(audio))
			.catch(() => {});
	}
}

function sample(name: SampleName, gain = 0.9) {
	whenRunning((audio) => {
		void loadBuffers(audio).then(() => {
			const buffer = buffers[name];
			if (!buffer) return;
			const source = audio.createBufferSource();
			const amp = audio.createGain();
			source.buffer = buffer;
			amp.gain.value = gain;
			source.connect(amp).connect(audio.destination);
			source.start();
		});
	});
}

type BlipOptions = {
	duration?: number;
	gain?: number;
	glideTo?: number;
	delay?: number;
	type?: OscillatorType;
};

function blip(
	freq: number,
	{ duration = 0.09, gain = 0.04, glideTo, delay = 0, type = 'sine' }: BlipOptions = {}
) {
	whenRunning((audio) => {
		const start = audio.currentTime + delay;
		const osc = audio.createOscillator();
		const amp = audio.createGain();
		osc.type = type;
		osc.frequency.setValueAtTime(freq, start);
		if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + duration);
		amp.gain.setValueAtTime(0.0001, start);
		amp.gain.exponentialRampToValueAtTime(gain, start + 0.008);
		amp.gain.exponentialRampToValueAtTime(0.0001, start + duration);
		osc.connect(amp).connect(audio.destination);
		osc.start(start);
		osc.stop(start + duration + 0.02);
	});
}

function throttled(name: SampleName) {
	const now = performance.now();
	if (now - lastTickAt < 45) return;
	lastTickAt = now;
	sample(name);
}

export const sfx = {
	// Intro square grid
	tick() {
		throttled('tink2');
	},
	// Project list: moving through it and hovering it
	step() {
		throttled('tink');
	},
	hover() {
		throttled('tink');
	},
	welcome() {
		sample('welcome');
	},
	notify() {
		sample('notify');
	},
	open() {
		sample('chat');
	},
	close() {
		sample('close');
	},
	send() {
		blip(660, { duration: 0.12, gain: 0.04, glideTo: 1320, type: 'triangle' });
		blip(1320, { duration: 0.1, gain: 0.022, delay: 0.07 });
	},
	project() {
		blip(330, { duration: 0.3, gain: 0.04, glideTo: 990, type: 'triangle' });
		blip(660, { duration: 0.3, gain: 0.02, glideTo: 1480, delay: 0.06 });
	},
	enter() {
		blip(392, { duration: 0.18, gain: 0.04, glideTo: 784 });
		blip(784, { duration: 0.22, gain: 0.025, glideTo: 1175, delay: 0.1 });
	},
	exit() {
		blip(1175, { duration: 0.18, gain: 0.035, glideTo: 587 });
		blip(587, { duration: 0.2, gain: 0.025, glideTo: 392, delay: 0.1 });
	},
	back() {
		blip(523, { duration: 0.16, gain: 0.035, glideTo: 392, type: 'triangle', delay: 0.14 });
	}
};
