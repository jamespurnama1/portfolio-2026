import { notificationStore } from '#lib/stores/index.svelte.js';

const HINT_DELAY_MS = 3500;
let shown = false;

// Shows a one-time "pinch to zoom" notification if the viewer is still open after a few seconds.
export function schedulePinchHint() {
	if (shown || typeof window === 'undefined' || !window.matchMedia('(hover: none)').matches) return;
	const timer = setTimeout(() => {
		if (notificationStore.opened) return;
		shown = true;
		notificationStore.message = 'PINCH TO ZOOM';
		notificationStore.sub = '';
		notificationStore.persistent = false;
		notificationStore.hint = true;
		notificationStore.opened = true;
	}, HINT_DELAY_MS);
	return () => clearTimeout(timer);
}
