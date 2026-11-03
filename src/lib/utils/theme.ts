import { optionsStore } from '#lib/stores/options.svelte.js';
import { flushSync } from 'svelte';

export function theme(dark: boolean, setStorage: boolean = false, animate: boolean = true) {
	if (setStorage) localStorage.setItem('dark-theme', dark.toString());
	const update = () => {
		flushSync(() => {
			optionsStore.dark = dark;
			document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
		});
	};
	if (
		animate &&
		optionsStore.dark !== dark &&
		document.startViewTransition &&
		!window.matchMedia('(prefers-reduced-motion: reduce)').matches
	) {
		document.startViewTransition(update);
	} else {
		update();
	}
}

export function checkSavedTheme() {
	const colorScheme = window.matchMedia('(prefers-color-scheme:dark)');
	const localStorageTheme = localStorage.getItem('dark-theme');

	theme(
		localStorageTheme === null ? colorScheme.matches : localStorageTheme === 'true',
		false,
		false
	);

	colorScheme.addEventListener('change', (e) =>
		localStorageTheme === null ? theme(e.matches, false) : null
	);
}
