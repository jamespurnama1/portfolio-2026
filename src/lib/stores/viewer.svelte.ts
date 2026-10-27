export type ViewerMedia = {
	id: string;
	url: string;
	isVideo: boolean;
	alt: string;
	// Inline blur preview shown while the full image loads
	lqip?: string;
	// Width / height of the media, when known
	ratio?: number;
	// Current on-screen box of the media this viewer grows from / returns to
	rect: () => DOMRect;
	// Hide or show the source while the viewer shows its own copy
	hide: (hidden: boolean) => void;
	// Bring the source on screen before the viewer flies back to it
	ensureVisible?: () => void;
};

let active = $state<ViewerMedia | null>(null);
let siblingsFn: (() => ViewerMedia[]) | null = null;
let closeSignal = $state(0);
let closeImmediate = false;

export const viewerStore = {
	get active() {
		return active;
	},
	get closeSignal() {
		return closeSignal;
	},
	get closeImmediate() {
		return closeImmediate;
	},
	siblings() {
		return siblingsFn?.() ?? [];
	},
	open(media: ViewerMedia, siblings?: () => ViewerMedia[]) {
		siblingsFn = siblings ?? null;
		active = media;
	},
	setActive(media: ViewerMedia) {
		active = media;
	},
	clear() {
		active = null;
		siblingsFn = null;
	},
	requestClose(immediate = false) {
		closeImmediate = immediate;
		closeSignal += 1;
	}
};

// Registered by the landing page's reel card so other controls can open it in the viewer.
export const reelViewer: { open: (() => void) | null } = { open: null };
