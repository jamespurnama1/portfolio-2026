import { writable } from 'svelte/store';

type ProjectSectionState = {
	pinned: boolean;
	progress: number;
	viewportTop: number;
};

function clampProgress(value: number) {
	if (!Number.isFinite(value)) return 0;
	return Math.min(1, Math.max(0, value));
}

function createProjectSectionStore() {
	const { subscribe, set, update } = writable<ProjectSectionState>({
		pinned: false,
		progress: 0,
		viewportTop: 0
	});

	return {
		subscribe,
		setPinned: (pinned: boolean) => update((state) => ({ ...state, pinned })),
		setProgress: (progress: number) =>
			update((state) => ({ ...state, progress: clampProgress(progress) })),
		setViewportTop: (viewportTop: number) =>
			update((state) => ({
				...state,
				viewportTop: Number.isFinite(viewportTop) ? viewportTop : 0
			})),
		reset: () => set({ pinned: false, progress: 0, viewportTop: 0 })
	};
}

export const projectSectionStore = createProjectSectionStore();
