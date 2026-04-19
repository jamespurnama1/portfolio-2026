import { gsap } from 'gsap';

let load = $state(0);
const animatedLoad = $state({
	percent: 0
});
let loaded = $state(false);
let cardLoading = $state(false);
let galleryTransitioning = $state(false);
const tl = gsap.timeline({ paused: false });
export const loadStore = {
	get load() {
		return animatedLoad.percent;
	},
	get realLoad() {
		return load;
	},
	set load(newValue) {
		load = Math.abs(newValue);
		tl.clear();
		tl.to(animatedLoad, {
			percent: load,
			duration: (load - animatedLoad.percent) / 15
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

export const countStore = {
	set activeIndex(bool: boolean) {
		const y = bool ? 1 : -1;
		inertiaIndex = Math.abs(Math.max(Math.min(inertiaIndex + y, projectsLength - 1), 0));
	},
	get activeIndex(): number {
		return Math.round(Math.max(0, Math.min(inertiaIndex, projectsLength - 1)));
	},
	set inertiaIndex(num: number) {
		inertiaIndex = Math.max(-1, Math.min(num, projectsLength));
	},
	get inertiaIndex(): number {
		return inertiaIndex;
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
	}
};

let isAnimating = $state(false);
let isTransitioning = $state(false);
let currentCat = $state(['Highlights', 0]);

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
	set currentCat(val: (string | number)[]) {
		if (val[0]) currentCat = val;
	},
	get currentCat(): (string | number)[] {
		return currentCat;
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

let scroll = $state(0);
let offset = $state(0);
let velocity = $state(0);
let lastScroll = $state(0);
let lastTime = $state(Date.now());
let velocityDecayFrame: number | null = null;
let velocityLastUpdateTime = $state(Date.now());
// let overScroll = $state(0);

const shouldDebugWorkScroll = () => {
	if (typeof window === 'undefined') return false;
	const debugWindow = window as Window & {
		__DEBUG_WORK_SCROLL__?: boolean;
		DEBUG_WORK_SCROLL?: boolean;
	};
	return Boolean(debugWindow.__DEBUG_WORK_SCROLL__ || debugWindow.DEBUG_WORK_SCROLL);
};

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

		if (shouldDebugWorkScroll()) {
			console.log('[work-scroll/store]', {
				newVal,
				deltaScroll,
				deltaTime,
				velocity,
				lastScroll,
				offset
			});
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
					if (shouldDebugWorkScroll()) {
						console.log('[work-scroll/store:decay-stop]', {
							scroll,
							velocity
						});
					}
					velocityDecayFrame = null;
					return;
				}
			}

			velocityDecayFrame = window.requestAnimationFrame(decayVelocity);
		};

		if (shouldDebugWorkScroll()) {
			console.log('[work-scroll/store:decay-start]', {
				scroll,
				velocity
			});
		}

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
