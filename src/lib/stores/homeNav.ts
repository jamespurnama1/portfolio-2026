// Registered by the landing page so the root layout can drive its pinned section from the keyboard.
export const homeNav: {
	step: ((dir: 1 | -1) => void) | null;
	// Returns true when it scrolled to pin the section at the item; false when already pinned.
	goTo: ((index: number) => boolean) | null;
	top: (() => void) | null;
} = {
	step: null,
	goTo: null,
	top: null
};
