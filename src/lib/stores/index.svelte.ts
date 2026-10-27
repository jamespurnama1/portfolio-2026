import { gsap } from 'gsap';

let load = $state(0);
const animatedLoad = $state({
	percent: 0
});
let loaded = $state(false);
let cardLoading = $state(false);
let galleryTransitioning = $state(false);
export const loadStore = {
	get load() {
		return animatedLoad.percent;
	},
	get realLoad() {
		return load;
	},
	set load(newValue) {
		load = Math.min(100, Math.abs(newValue));
		// Server renders always start at 0; the tween only runs in the browser.
		if (typeof window === 'undefined') return;
		// A timeline playhead keeps running, so re-adding tweens to it snapped the value; tween directly.
		gsap.killTweensOf(animatedLoad);
		gsap.to(animatedLoad, {
			percent: load,
			duration: Math.max(0, (load - animatedLoad.percent) / 15),
			ease: 'none'
		});
	},
	get cardLoading() {
		return cardLoading;
	},
	set cardLoading(val: boolean) {
		cardLoading = val;
	},
	get loaded() {
		return loaded;
	},
	set loaded(val: boolean) {
		loaded = val;
	},
	get galleryTransitioning() {
		return galleryTransitioning;
	},
	set galleryTransitioning(val: boolean) {
		galleryTransitioning = val;
	}
};

let projectsLength = $state(0);

// Home scroll position kept while visiting /branch so going back lands in the same place.
export const homeScrollStore = { y: 0, pending: false, until: 0 };

export const projectsStore = {
	get projectsLength(): number {
		return projectsLength;
	},
	set projectsLength(newVal: number) {
		projectsLength = newVal;
	}
};

let inertiaIndex = $state(0);
let isNewCat = $state(false);
let isTouchScrolling = $state(false);
// Rate of inertiaIndex change (index-units per second). Purposely NOT $state — it is
// read synchronously inside homePos() on every RAF (not via reactive subscription) and
// writing $state 60×/sec during ScrollTrigger scrub creates unnecessary reactive cascades
// that stutter on iOS during section-pin transitions.
let _inertiaVelocity = 0;
let _lastInertiaValue = 0;
let _lastInertiaTime = 0;

export const countStore = {
	set activeIndex(bool: boolean) {
		const y = bool ? 1 : -1;
		inertiaIndex = Math.abs(Math.max(Math.min(inertiaIndex + y, projectsLength - 1), 0));
	},
	get activeIndex(): number {
		return Math.round(Math.max(0, Math.min(inertiaIndex, projectsLength - 1)));
	},
	set inertiaIndex(num: number) {
		const clamped = Math.max(-1, Math.min(num, projectsLength));
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		const dt = now - _lastInertiaTime;
		if (dt > 0 && dt < 200) {
			_inertiaVelocity = Math.abs(clamped - _lastInertiaValue) / (dt / 1000);
		} else {
			_inertiaVelocity = 0;
		}
		_lastInertiaValue = clamped;
		_lastInertiaTime = now;
		inertiaIndex = clamped;
	},
	get inertiaIndex(): number {
		return inertiaIndex;
	},
	get inertiaVelocity(): number {
		// If the setter hasn't been called in 200 ms, the scroll has settled.
		// Return 0 so the velocity-dampen factor in homePos() clears and the active
		// card can reach its full baseScale. Without this, velocity stays at the last
		// non-zero value indefinitely after the snap tween ends.
		const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
		if (now - _lastInertiaTime > 200) return 0;
		return _inertiaVelocity;
	},
	set isNewCat(newVal: boolean) {
		isNewCat = newVal;
		if (newVal) {
			setTimeout(() => {
				isNewCat = false;
			}, 1000);
		}
	},
	get isNewCat(): boolean {
		return isNewCat;
	},
	get isTouchScrolling(): boolean {
		return isTouchScrolling;
	},
	set isTouchScrolling(val: boolean) {
		isTouchScrolling = val;
	}
};

let isAnimating = $state(false);
let isTransitioning = $state(false);
let currentCat = $state(['Highlights', 0]);
let homeNavigatingToWork = $state(false);

export const animationStore = {
	get isAnimating(): boolean {
		return isAnimating;
	},
	set isAnimating(val: boolean) {
		isAnimating = val;
	},
	get isTransitioning(): boolean {
		return isTransitioning;
	},
	set isTransitioning(val: boolean) {
		isTransitioning = val;
	},
	get homeNavigatingToWork(): boolean {
		return homeNavigatingToWork;
	},
	set homeNavigatingToWork(val: boolean) {
		homeNavigatingToWork = val;
	},
	set currentCat(val: (string | number)[]) {
		if (val[0]) currentCat = val;
	},
	get currentCat(): (string | number)[] {
		return currentCat;
	}
};

let workRouteReadySlug = $state('');
let workRouteReadyExpected = $state(0);
let workRouteReadyKeys = $state<string[]>([]);

export const workRouteReadyStore = {
	begin(slug: string, expected: number) {
		workRouteReadySlug = slug;
		workRouteReadyExpected = Math.max(0, expected);
		workRouteReadyKeys = [];
	},
	markReady(slug: string, key: string) {
		if (workRouteReadySlug !== slug) return;
		if (workRouteReadyKeys.includes(key)) return;
		workRouteReadyKeys = [...workRouteReadyKeys, key];
	},
	reset() {
		workRouteReadySlug = '';
		workRouteReadyExpected = 0;
		workRouteReadyKeys = [];
	},
	get slug(): string {
		return workRouteReadySlug;
	},
	get expected(): number {
		return workRouteReadyExpected;
	},
	get readyCount(): number {
		return workRouteReadyKeys.length;
	},
	hasKey(slug: string, key: string): boolean {
		return workRouteReadySlug === slug && workRouteReadyKeys.includes(key);
	},
	get isReady(): boolean {
		return workRouteReadyExpected === 0 || workRouteReadyKeys.length >= workRouteReadyExpected;
	}
};

let cursor = $state('');

export const cursorStore = {
	get cursorState(): string {
		return cursor;
	},
	set cursorState(newVal: '' | 'link' | 'scroll') {
		cursor = newVal;
	}
};

let cursorSnapActive = $state(false);
let cursorSnapX = $state(0);
let cursorSnapY = $state(0);
let cursorSnapId = $state('');

export const cursorSnapStore = {
	get active(): boolean {
		return cursorSnapActive;
	},
	get x(): number {
		return cursorSnapX;
	},
	get y(): number {
		return cursorSnapY;
	},
	get id(): string {
		return cursorSnapId;
	},
	setTarget(newTarget: { x: number; y: number; id: string }) {
		cursorSnapActive = true;
		cursorSnapX = newTarget.x;
		cursorSnapY = newTarget.y;
		cursorSnapId = newTarget.id;
	},
	clear() {
		cursorSnapActive = false;
		cursorSnapId = '';
	}
};

// Keyboard focus pulls the Rive cursor onto the focused element until the mouse moves again.
let focusCursorActive = $state(false);
let focusCursorEl: HTMLElement | null = null;

export const focusCursor = {
	get active(): boolean {
		return focusCursorActive;
	},
	get x(): number {
		const r = focusCursorEl?.getBoundingClientRect();
		return r ? r.left + r.width / 2 : 0;
	},
	get y(): number {
		const r = focusCursorEl?.getBoundingClientRect();
		return r ? r.top + r.height / 2 : 0;
	},
	set(el: HTMLElement) {
		focusCursorEl = el;
		focusCursorActive = true;
	},
	clear() {
		focusCursorEl = null;
		focusCursorActive = false;
	}
};

let scroll = $state(0);
let offset = $state(0);
let velocity = $state(0);
let lastScroll = $state(0);
let lastTime = $state(Date.now());
let velocityDecayFrame: number | null = null;
let velocityLastUpdateTime = $state(Date.now());
// let overScroll = $state(0);

export const scrollStore = {
	get scroll(): number {
		return scroll + offset;
	},
	set scroll(newVal: number) {
		const now = Date.now();
		const deltaTime = (now - lastTime) / 1000; // Convert to seconds
		const deltaScroll = newVal - lastScroll;

		if (deltaTime > 0) {
			velocity = deltaScroll / deltaTime;
		}

		scroll = newVal;
		lastScroll = newVal;
		lastTime = now;
		velocityLastUpdateTime = now;

		if (velocityDecayFrame !== null || typeof window === 'undefined') return;

		const decayVelocity = () => {
			const idleFor = Date.now() - velocityLastUpdateTime;
			if (idleFor > 48) {
				velocity *= 0.9;
				if (Math.abs(velocity) < 0.1) {
					velocity = 0;
					velocityDecayFrame = null;
					return;
				}
			}

			velocityDecayFrame = window.requestAnimationFrame(decayVelocity);
		};

		velocityDecayFrame = window.requestAnimationFrame(decayVelocity);
	},
	get offset(): number {
		return offset;
	},
	set offset(newVal: number) {
		offset = newVal;
	},
	get velocity(): number {
		return velocity;
	}
	// get overScroll(): number {
	// 	return overScroll;
	// },
	// set overScroll(newVal: number) {
	// 	overScroll = newVal;
	// 	// gsap.to(scrollStore, {
	// 	// 	overScroll: 0,
	// 	// 	delay: 1,
	// 	// 	duration: 0.5,
	// 	// 	ease: 'power4.out'
	// 	// });
	// }
};

let inactive = $state(false);

export const activityStore = {
	get inactive(): boolean {
		return inactive;
	},
	set inactive(newVal: boolean) {
		inactive = newVal;
	}
};

let notifOpened = $state(false);
let message = $state('');
let sub = $state('');
let notifPersistent = $state(false);
export const notificationStore = {
	get opened(): boolean {
		return notifOpened;
	},
	set opened(newVal: boolean) {
		notifOpened = newVal;
	},
	get message(): string {
		return message;
	},
	set message(newVal: string) {
		message = newVal;
	},
	get sub(): string {
		return sub;
	},
	set sub(newVal: string) {
		sub = newVal;
	},
	get persistent(): boolean {
		return notifPersistent;
	},
	set persistent(newVal: boolean) {
		notifPersistent = newVal;
	}
};

let introPhase = $state<'loading' | 'finishing' | 'waiting' | 'revealing' | 'done'>('loading');
let introSettled = $state(false);

// First-visit intro: loading -> finishing (last arrow sweep) -> waiting (click the stack) -> revealing -> done
export const introGateStore = {
	get phase() {
		return introPhase;
	},
	set phase(value: 'loading' | 'finishing' | 'waiting' | 'revealing' | 'done') {
		introPhase = value;
	},
	get settled() {
		return introSettled;
	},
	set settled(value: boolean) {
		introSettled = value;
	}
};

// Arrow position in screen pixels, written every frame by the cursor scene (not reactive on purpose).
export const arrowScreen = { x: -9999, y: -9999 };

let pendingHomeReturn = $state(false);
let pendingHomeReturnIndex = $state(0);

export const homeTransitionStore = {
	get pending(): boolean {
		return pendingHomeReturn;
	},
	get index(): number {
		return pendingHomeReturnIndex;
	},
	requestHomeReturn(index: number) {
		pendingHomeReturn = true;
		pendingHomeReturnIndex = Math.max(0, index);
	},
	clear() {
		pendingHomeReturn = false;
		pendingHomeReturnIndex = 0;
	}
};

type SharedCardTransitionState = {
	direction: 'to-work' | 'to-home';
	index: number;
	slug: string;
	geometry: {
		width: number;
		height: number;
	};
	transform: {
		x: number;
		y: number;
		z: number;
		scale: number;
		opacity: number;
	};
};

type HomeCardSnapshotState = {
	index: number;
	slug: string;
	geometry: {
		width: number;
		height: number;
	};
	transform: {
		x: number;
		y: number;
		z: number;
		scale: number;
		opacity: number;
	};
};

let sharedCardTransition = $state<SharedCardTransitionState | null>(null);
let currentHomeCardSnapshot = $state<HomeCardSnapshotState | null>(null);

export const sharedCardTransitionStore = {
	get value(): SharedCardTransitionState | null {
		return sharedCardTransition;
	},
	set(next: SharedCardTransitionState) {
		sharedCardTransition = next;
	},
	clear() {
		sharedCardTransition = null;
	}
};

export const currentHomeCardSnapshotStore = {
	get value(): HomeCardSnapshotState | null {
		return currentHomeCardSnapshot;
	},
	set(next: HomeCardSnapshotState) {
		currentHomeCardSnapshot = next;
	},
	clear() {
		currentHomeCardSnapshot = null;
	}
};

let count = $state(0);
let total = $state(5);
export const easterEggStore = {
	get count(): number {
		return count;
	},
	set count(newVal: number) {
		count = newVal;
	},
	get total(): number {
		return total;
	},
	set total(newVal: number) {
		total = newVal;
	}
};

let gptOpened = $state(false);
export const gptStore = {
	get opened(): boolean {
		return gptOpened;
	},
	set opened(newVal: boolean) {
		gptOpened = newVal;
	}
};
