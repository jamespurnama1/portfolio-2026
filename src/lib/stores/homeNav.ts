// Registered by the landing page so the root layout can drive its pinned section from the keyboard.
export const homeNav: { step: ((dir: 1 | -1) => void) | null; top: (() => void) | null } = {
	step: null,
	top: null
};
