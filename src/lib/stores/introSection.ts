import { writable } from 'svelte/store';

type IntroSectionState = {
	active: boolean;
	progress: number;
};

function clamp(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function createIntroSectionStore() {
	const { subscribe, set, update } = writable<IntroSectionState>({ active: false, progress: 0 });

	return {
		subscribe,
		setActive: (active: boolean) => update((state) => ({ ...state, active })),
		setProgress: (progress: number) => update((state) => ({ ...state, progress: clamp(progress) })),
		reset: () => set({ active: false, progress: 0 })
	};
}

export const introSectionStore = createIntroSectionStore();
