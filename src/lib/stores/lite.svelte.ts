import { browser } from '$app/env';

let active = $state(false);
let slow = $state(false);
let observer: MutationObserver | undefined;

function stripStyles() {
	const strip = () => {
		document.querySelectorAll('style, link[rel="stylesheet"]').forEach((node) => node.remove());
		document.documentElement.removeAttribute('style');
		document.body.removeAttribute('style');
	};
	strip();
	observer ??= new MutationObserver(strip);
	observer.observe(document.head, { childList: true });
}

// Slow-connection mode: plain HTML and images only, with every stylesheet removed. Lasts until reload.
export const liteStore = {
	get active() {
		return active;
	},
	// The connection looks slow: skip video thumbnails and use still images only.
	get slow() {
		return slow;
	},
	set slow(value: boolean) {
		slow = value;
	},
	enable() {
		if (!browser) return;
		active = true;
		stripStyles();
		window.scrollTo(0, 0);
	},
	disable() {
		location.reload();
	}
};
