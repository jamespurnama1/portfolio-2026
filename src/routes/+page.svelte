<script lang="ts">
	import {
		animationStore,
		countStore,
		gptStore,
		homeScrollStore,
		homeTransitionStore,
		introGateStore,
		scrollStore
	} from '#lib/stores/index.svelte.js';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { gsap } from 'gsap';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { beforeNavigate } from '$app/navigation';
	import { browser } from '$app/env';
	import { projectListHost } from '#lib/stores/projectListHost.js';
	import { homeNav } from '#lib/stores/homeNav.js';
	import { projectSectionStore } from '#lib/stores/projectSection.js';
	import { introSectionStore } from '#lib/stores/introSection.js';
	import type { PageData } from './$types';
	import type { ScrollTrigger as ScrollTriggerInstance } from 'gsap/ScrollTrigger';

	const { data }: { data: Required<PageData> } = $props();
	const introBodyText =
		'<h1>Get to know James Henry.</h1> A tech creative who loves to build things that look and feel&nbsp;great.<br><mono>Creative Direction・Motion・Design・Web</mono><br>Browse his projects below or simply start chatting with his&nbsp;clone.';
	const finalHeadlineText = "Let's make your project happen";
	const finalBodyText =
		'Creative direction, motion systems, interactive builds, and production-ready frontend implementation for teams that need both a point of view and the technical depth to ship it.';
	const introBodyReserve = buildStaticFormattedText(introBodyText);
	const projectsLength = $derived(data.projectsLength ?? data.projects?.length ?? 0);
	const projectsPinPercent = $derived(Math.max(0, projectsLength * 10));
	let introSection: HTMLElement | null = null;
	let categorySection: HTMLElement | null = null;
	let projectListHostEl: HTMLElement | null = null;
	let categoryTriggerRef: ScrollTriggerInstance | null = null;
	let introTriggerRef: ScrollTriggerInstance | null = null;
	let ScrollTrigger: typeof import('gsap/ScrollTrigger').ScrollTrigger | null = null;

	type MarkedToken =
		| { kind: 'text'; text: string }
		| { kind: 'mono'; text: string }
		| { kind: 'h1'; text: string }
		| { kind: 'br' };

	function escapeHtml(value: string) {
		return value
			.replaceAll('&', '&amp;')
			.replaceAll('<', '&lt;')
			.replaceAll('>', '&gt;')
			.replaceAll('\u00A0', '&nbsp;');
	}

	function normalizeEntities(value: string) {
		return value.replaceAll('&nbsp;', '\u00A0');
	}

	function parseMarkedText(input: string) {
		const tokens: MarkedToken[] = [];
		const pattern = /<br>|<mono>(.*?)<\/mono>|<h1>(.*?)<\/h1>/g;
		let cursor = 0;
		let match: RegExpExecArray | null;

		while ((match = pattern.exec(input))) {
			if (match.index > cursor) {
				tokens.push({ kind: 'text', text: normalizeEntities(input.slice(cursor, match.index)) });
			}

			if (match[0] === '<br>') {
				tokens.push({ kind: 'br' });
			} else if (match[0].startsWith('<h1>')) {
				tokens.push({ kind: 'h1', text: normalizeEntities(match[2] ?? '') });
			} else {
				tokens.push({ kind: 'mono', text: normalizeEntities(match[1] ?? '') });
			}

			cursor = match.index + match[0].length;
		}

		if (cursor < input.length) {
			tokens.push({ kind: 'text', text: normalizeEntities(input.slice(cursor)) });
		}

		return tokens;
	}

	function getVisibleText(tokens: MarkedToken[]) {
		return tokens.map((token) => (token.kind === 'br' ? '\n' : token.text)).join('');
	}

	function buildStaticFormattedText(text: string) {
		return parseMarkedText(text)
			.map((token) => {
				if (token.kind === 'br') return '<br>';
				const html = escapeHtml(token.text);
				if (token.kind === 'h1') {
					return `<h1 class="font-sans font-bold text-4xl md:text-5xl lg:text-6xl leading-[0.92] mb-6">${html}</h1>`;
				}
				return token.kind === 'mono' ? `<span class="font-mono font-normal">${html}</span>` : html;
			})
			.join('');
	}

	function unwrapPinnedSection(section: HTMLElement | null) {
		if (!section) return;
		section.removeAttribute('style');
		const parent = section.parentElement;
		if (!parent || !parent.classList.contains('pin-spacer')) return;
		parent.before(section);
		parent.remove();
	}

	function cleanupHomeScrollState() {
		projectListHost.set(null);
		projectSectionStore.reset();
		introSectionStore.reset();
		introTriggerRef = null;
		ScrollTrigger?.getAll().forEach((trigger) => trigger.kill(true));
		unwrapPinnedSection(introSection);
		unwrapPinnedSection(categorySection);
		document.querySelectorAll('.pin-spacer').forEach((spacer) => {
			if (spacer.querySelector('.intro-section') || spacer.querySelector('.landing-section')) {
				spacer.replaceWith(...Array.from(spacer.childNodes));
			}
		});
	}

	// Setting overflow stops iOS momentum scrolling, which otherwise rubber-bands against scripted scrolls.
	let releaseTimer: ReturnType<typeof setTimeout> | undefined;
	function holdNativeScroll(hold: boolean, releaseAfter = 0) {
		if (typeof window === 'undefined' || !window.matchMedia('(hover: none)').matches) return;
		clearTimeout(releaseTimer);
		const html = document.documentElement;
		if (hold) {
			html.style.overflow = 'hidden';
		} else if (releaseAfter > 0) {
			releaseTimer = setTimeout(() => (html.style.overflow = ''), releaseAfter);
		} else {
			html.style.overflow = '';
		}
	}

	let lastViewportTop = NaN;

	function syncCategorySectionViewportTop() {
		if (page.url.pathname !== '/' || !categorySection) {
			lastViewportTop = 0;
			projectSectionStore.setViewportTop(0);
			return;
		}
		let top: number;
		if (categoryTriggerRef) {
			// Derived from the trigger range to avoid a forced layout on every scroll tick.
			const y = window.scrollY;
			const { start, end } = categoryTriggerRef;
			top = y < start ? start - y : y <= end ? 0 : end - y;
		} else {
			top = categorySection.getBoundingClientRect().top;
		}
		if (top === lastViewportTop) return;
		lastViewportTop = top;
		projectSectionStore.setViewportTop(top);
	}

	// ScrollTrigger callbacks do not fire for a jump straight to a restored position,
	// so the section stores are derived from the scroll position directly.
	function syncSectionStores() {
		const y = window.scrollY;
		const frac = (t: ScrollTriggerInstance) =>
			Math.min(1, Math.max(0, (y - t.start) / (t.end - t.start || 1)));
		if (introTriggerRef) {
			introSectionStore.setActive(y >= introTriggerRef.start && y <= introTriggerRef.end);
			introSectionStore.setProgress(frac(introTriggerRef));
		}
		if (categoryTriggerRef) {
			const p = frac(categoryTriggerRef);
			projectSectionStore.setPinned(y >= categoryTriggerRef.start && y <= categoryTriggerRef.end);
			projectSectionStore.setProgress(p);
			countStore.inertiaIndex = p * Math.max(0, projectsLength - 1);
		}
		lastViewportTop = NaN;
		syncCategorySectionViewportTop();
	}

	// Keeps the second section pinned until the first/last item is reached: input inside
	// the pin range steps one item at a time instead of scrolling through it.
	function setupCategoryGate(maxIndex: number) {
		const initialTrigger = categoryTriggerRef;
		if (!initialTrigger || maxIndex <= 0) return () => {};
		const trigger: ScrollTriggerInstance = initialTrigger;
		const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
		const posOf = (i: number) => trigger.start + ((trigger.end - trigger.start) * i) / maxIndex;
		const stepOf = () =>
			Math.round(
				clamp((window.scrollY - trigger.start) / (trigger.end - trigger.start || 1), 0, 1) *
					maxIndex
			);
		const inRange = (pad: number) =>
			window.scrollY >= trigger.start - pad && window.scrollY <= trigger.end + pad;
		const tweenState = { y: 0 };
		let busy = false;
		let targetStep = 0;
		let baseStep = 0;
		let lastWheelAt = 0;
		let wheelAcc = 0;
		let lastY = window.scrollY;
		let touchStartY = 0;
		let touchLastY = 0;
		let touchLastY0 = 0;
		let touchLastT = 0;
		let touchVelocity = 0;
		let touchDir = 0;
		let touchPrevent = false;
		let touchBaseStep = 0;

		const currentStep = () => (busy ? targetStep : stepOf());
		// 40px starts a move, then one more item per 100px (wheel) / 80px (touch).
		const stepsFor = (distance: number, perStep: number) =>
			distance >= 40 ? 1 + Math.floor((distance - 40) / perStep) : 0;

		function tweenToY(target: number, duration: number) {
			busy = true;
			holdNativeScroll(true);
			gsap.killTweensOf(tweenState);
			tweenState.y = window.scrollY;
			gsap.to(tweenState, {
				y: target,
				duration,
				ease: 'power2.out',
				onUpdate: () => window.scrollTo(0, tweenState.y),
				onComplete: () => {
					window.scrollTo(0, target);
					busy = false;
					holdNativeScroll(false);
				}
			});
		}

		// Slow enough to read each card as it passes; longer travel takes longer.
		function goToStep(i: number) {
			const clamped = clamp(i, 0, maxIndex);
			if (busy && clamped === targetStep) return;
			const target = posOf(clamped);
			targetStep = clamped;
			const stepPx = (trigger.end - trigger.start) / maxIndex || 1;
			const steps = Math.abs(target - window.scrollY) / stepPx;
			tweenToY(target, clamp(0.8 + (steps - 1) * 0.18, 0.8, 2.2));
		}

		// Arrow keys: move to the section first when it is at least 30% visible, then step items.
		function keyStep(dir: 1 | -1) {
			const y = window.scrollY;
			const vh = window.innerHeight;
			if (inRange(1)) {
				const next = currentStep() + dir;
				if (next < 0) tweenToY(Math.max(0, trigger.start - vh), 0.9);
				else if (next > maxIndex) tweenToY(trigger.end + vh, 0.9);
				else goToStep(next);
				return;
			}
			if (dir > 0 && y < trigger.start && trigger.start - y <= vh * 0.7) return goToStep(0);
			if (dir < 0 && y > trigger.end && y - trigger.end <= vh * 0.7) return goToStep(maxIndex);
			let target = y + dir * vh * 0.9;
			if (dir > 0 && y < trigger.start) target = Math.min(target, trigger.start);
			if (dir < 0 && y > trigger.end) target = Math.max(target, trigger.end);
			tweenToY(Math.max(0, target), 0.8);
		}

		const exitsNatively = (step: number, dir: number) =>
			!busy && ((step === 0 && dir < 0) || (step === maxIndex && dir > 0));

		// Index to glide to when scrolling toward the section from just outside it, else -1.
		const entryStep = (dir: number) => {
			const y = window.scrollY;
			const pad = window.innerHeight * 0.2;
			if (dir > 0 && y < trigger.start && trigger.start - y <= pad) return 0;
			if (dir < 0 && y > trigger.end && y - trigger.end <= pad) return maxIndex;
			return -1;
		};

		function onWheel(event: WheelEvent) {
			if (gptStore.opened || page.url.pathname !== '/') return;
			let delta = event.deltaY;
			if (event.deltaMode === WheelEvent.DOM_DELTA_LINE) delta *= 17;
			else if (event.deltaMode === WheelEvent.DOM_DELTA_PAGE) delta *= 53;
			const dir = Math.sign(delta);
			if (!dir) return;
			if (!inRange(1)) {
				// Just outside the section: glide to its first/last item instead of overshooting into it.
				const entry = entryStep(dir);
				if (entry < 0) return;
				event.preventDefault();
				if (!busy) goToStep(entry);
				return;
			}
			if (exitsNatively(currentStep(), dir)) return;
			event.preventDefault();
			const now = performance.now();
			// A pause ends the gesture; a continuous swipe keeps accumulating into more items.
			if (now - lastWheelAt > 150) {
				wheelAcc = 0;
				baseStep = currentStep();
			}
			lastWheelAt = now;
			wheelAcc += delta;
			const steps = stepsFor(Math.abs(wheelAcc), 100);
			if (steps > 0) goToStep(baseStep + Math.sign(wheelAcc) * steps);
		}

		function onTouchStart(event: TouchEvent) {
			touchStartY = touchLastY = event.touches[0]?.clientY ?? 0;
			touchLastY0 = touchStartY;
			touchLastT = performance.now();
			touchVelocity = 0;
			touchDir = 0;
			touchPrevent = false;
			touchBaseStep = currentStep();
		}

		function onTouchMove(event: TouchEvent) {
			if (gptStore.opened || page.url.pathname !== '/') return;
			const currentY = event.touches[0]?.clientY ?? 0;
			const now = performance.now();
			if (!inRange(1)) {
				touchStartY = touchLastY = currentY;
				touchLastT = now;
				touchDir = 0;
				touchPrevent = false;
				touchBaseStep = currentStep();
				const entry = entryStep(Math.sign(touchLastY0 - currentY));
				touchLastY0 = currentY;
				if (entry >= 0 && event.cancelable) {
					event.preventDefault();
					if (!busy) goToStep(entry);
				}
				return;
			}
			touchLastY0 = currentY;
			const dt = Math.max(now - touchLastT, 1);
			touchVelocity = (touchLastY - currentY) / dt;
			touchLastY = currentY;
			touchLastT = now;
			const dy = touchStartY - currentY;
			// Decided on the first pixels: once iOS starts a native scroll, preventDefault is ignored.
			if (!touchDir && Math.abs(dy) > 1) {
				touchDir = Math.sign(dy);
				touchBaseStep = currentStep();
				touchPrevent = !exitsNatively(touchBaseStep, touchDir);
			}
			if (!touchPrevent) return;
			if (event.cancelable) event.preventDefault();
			const steps = stepsFor(Math.abs(dy), 80);
			if (steps > 0) goToStep(touchBaseStep + Math.sign(dy) * steps);
		}

		// A fast flick carries on for extra items after release.
		function onTouchEnd() {
			if (!touchPrevent || !touchDir) return;
			const extra = Math.round(clamp(Math.abs(touchVelocity) - 0.6, 0, 4) * 3);
			if (extra > 0 && Math.sign(touchVelocity) === touchDir) {
				goToStep(currentStep() + touchDir * extra);
			}
			touchPrevent = false;
			touchDir = 0;
		}

		// Momentum or keyboard scrolling must stop at the first/last item instead of passing through.
		function onScroll() {
			const y = window.scrollY;
			const previous = lastY;
			lastY = y;
			if (busy || page.url.pathname !== '/') return;
			if (performance.now() < homeScrollStore.until) return;
			if (y <= trigger.start + 2 || y >= trigger.end - 2) return;
			const target =
				previous <= trigger.start + 2
					? posOf(0)
					: previous >= trigger.end - 2
						? posOf(maxIndex)
						: posOf(stepOf());
			if (Math.abs(target - y) > 1) {
				lastY = target;
				// Momentum that carried into the pin range is stopped, not fought.
				holdNativeScroll(true);
				window.scrollTo(0, target);
				holdNativeScroll(false, 160);
			}
		}

		window.addEventListener('wheel', onWheel, { passive: false });
		window.addEventListener('touchstart', onTouchStart, { passive: true });
		window.addEventListener('touchmove', onTouchMove, { passive: false });
		window.addEventListener('touchend', onTouchEnd, { passive: true });
		window.addEventListener('scroll', onScroll, { passive: true });
		homeNav.step = keyStep;
		return () => {
			homeNav.step = null;
			gsap.killTweensOf(tweenState);
			holdNativeScroll(false);
			window.removeEventListener('wheel', onWheel);
			window.removeEventListener('touchstart', onTouchStart);
			window.removeEventListener('touchmove', onTouchMove);
			window.removeEventListener('touchend', onTouchEnd);
			window.removeEventListener('scroll', onScroll);
		};
	}

	function wait(ms: number) {
		return new Promise((resolve) => setTimeout(resolve, ms));
	}

	function prepareHomeReturnScroll() {
		if (!homeTransitionStore.pending || typeof window === 'undefined') return null;
		const maxIndex = Math.max(0, projectsLength - 1);
		const targetIndex = Math.max(0, Math.min(homeTransitionStore.index, maxIndex));
		const progress = maxIndex === 0 ? 0 : targetIndex / maxIndex;

		countStore.inertiaIndex = targetIndex;
		introSectionStore.setActive(false);
		introSectionStore.setProgress(1);
		projectSectionStore.setPinned(true);
		projectSectionStore.setProgress(progress);
		projectSectionStore.setViewportTop(0);

		return { progress, targetIndex };
	}

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname === '/') return;
			cleanupHomeScrollState();
		});
	});

	beforeNavigate(({ to }) => {
		if (page.url.pathname === '/' && to?.url.pathname === '/branch') {
			homeScrollStore.y = window.scrollY;
			homeScrollStore.pending = true;
		}
		if (page.url.pathname !== '/' || !to || to.url.pathname === '/') return;
		cleanupHomeScrollState();
	});

	$effect(() => {
		scrollStore.scroll;
		categorySection;
		untrack(() => {
			// During a pending home return the section is not yet pinned and
			// scroll has not been restored — getBoundingClientRect().top would
			// return the natural-flow value (~700 px), overwriting the 0 that
			// prepareHomeReturnScroll() already set.  The rAF in onMount will
			// call syncCategorySectionViewportTop() once layout is stable.
			if (homeTransitionStore.pending) return;
			syncCategorySectionViewportTop();
		});
	});

	$effect(() => {
		gptStore.opened;
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname !== '/' || gptStore.opened) return;
			if (!ScrollTrigger) return;
			requestAnimationFrame(() => {
				ScrollTrigger?.refresh();
				syncCategorySectionViewportTop();
			});
		});
	});

	onMount(() => {
		let cleanup: (() => void) | undefined;
		let removeCategoryGate: (() => void) | undefined;

		void (async () => {
			if (!browser) return;
			const scrollTriggerModule = await import('gsap/ScrollTrigger');
			ScrollTrigger = scrollTriggerModule.ScrollTrigger;
			gsap.registerPlugin(ScrollTrigger);
			// The iOS toolbar growing or shrinking must not re-measure the pins mid-swipe.
			ScrollTrigger.config({ ignoreMobileResize: true });

			const restoringHomeReturn = homeTransitionStore.pending;
			const restoringScroll = homeScrollStore.pending && !restoringHomeReturn;
			const pendingHomeReturn = restoringHomeReturn ? prepareHomeReturnScroll() : null;
			if (restoringScroll) animationStore.isTransitioning = false;
			// Pins must be measured from the top, not from wherever the browser left the scroll.
			if (restoringScroll) window.scrollTo(0, 0);
			if (!restoringHomeReturn) animationStore.isTransitioning = false;
			if (page.url.pathname !== '/') {
				cleanupHomeScrollState();
				return;
			}

			if (restoringHomeReturn) {
				introSectionStore.setActive(false);
				introSectionStore.setProgress(1);
			} else {
				introSectionStore.setActive(true);
				introSectionStore.setProgress(0);
			}

			if (projectListHostEl) {
				projectListHost.set(projectListHostEl);
			}
			// Only sync from DOM when layout is already stable (normal load).
			// During a home return, prepareHomeReturnScroll() already set
			// viewportTop = 0; reading the DOM here would overwrite it with the
			// natural-flow offset before ScrollTrigger has pinned the section.
			if (!restoringHomeReturn) {
				syncCategorySectionViewportTop();
			}

			const triggers: ScrollTriggerInstance[] = [];
			if (introSection && ScrollTrigger) {
				triggers.push(
					(introTriggerRef = ScrollTrigger.create({
						trigger: introSection,
						start: 'top top',
						end: '+=200%',
						pin: true,
						pinSpacing: true,
						scrub: true,
						anticipatePin: 1,
						onEnter: () => {
							if (gptStore.opened) return;
							introSectionStore.setActive(true);
						},
						onEnterBack: () => {
							if (gptStore.opened) return;
							introSectionStore.setActive(true);
						},
						onLeave: () => {
							if (gptStore.opened) return;
							introSectionStore.setActive(false);
							introSectionStore.setProgress(1);
						},
						onLeaveBack: () => {
							if (gptStore.opened) return;
							introSectionStore.setActive(false);
							introSectionStore.setProgress(0);
						},
						onUpdate: (self) => {
							if (gptStore.opened) return;
							introSectionStore.setProgress(self.progress);
						}
					}))
				);
			}
			if (categorySection && ScrollTrigger) {
				const maxIndex = Math.max(0, projectsLength - 1);
				categoryTriggerRef = ScrollTrigger.create({
					trigger: categorySection,
					start: 'top top',
					end: `+=${projectsPinPercent}%`,
					pin: true,
					pinSpacing: true,
					scrub: true,
					anticipatePin: 1,
					// The gate snaps touch scrolling itself; ScrollTrigger's snap would fight iOS momentum.
					...(maxIndex > 0 && !window.matchMedia('(hover: none)').matches
						? {
								snap: {
									snapTo: (
										value: number
										// No snapping while a restored position is still settling.
									) =>
										performance.now() < homeScrollStore.until
											? value
											: Math.round(value * maxIndex) / maxIndex,
									duration: { min: 0.06, max: 0.12 },
									delay: 0,
									ease: 'power2.out'
								}
							}
						: {}),
					onEnter: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(true);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onEnterBack: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(true);
						syncCategorySectionViewportTop();
					},
					onLeave: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(1);
						syncCategorySectionViewportTop();
					},
					onLeaveBack: () => {
						if (gptStore.opened) return;
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onUpdate: (self) => {
						if (gptStore.opened) return;
						projectSectionStore.setProgress(self.progress);
						// syncCategorySectionViewportTop() is intentionally NOT called here.
						// Calling getBoundingClientRect() inside onUpdate (which fires on every
						// scroll tick) forces a synchronous layout on every frame — extremely
						// expensive on Safari/iOS. The viewport-top is synced in the enter/leave
						// callbacks where layout is already stable.
						if (self.isActive) {
							countStore.inertiaIndex = maxIndex === 0 ? 0 : self.progress * maxIndex;
							scrollStore.scroll = typeof window !== 'undefined' ? window.scrollY : 0;
						}
					}
				});
				triggers.push(categoryTriggerRef);
				removeCategoryGate = setupCategoryGate(maxIndex);
			}
			if (restoringScroll && ScrollTrigger) {
				const savedY = homeScrollStore.y;
				homeScrollStore.until = performance.now() + 6000;
				const restore = () => {
					window.scrollTo(0, savedY);
					scrollStore.scroll = savedY;
					ScrollTrigger?.update();
					lastViewportTop = NaN;
					syncSectionStores();
				};

				const layoutKey = () =>
					[introTriggerRef, categoryTriggerRef]
						.map((t) => (t ? `${Math.round(t.start)}:${Math.round(t.end)}` : ''))
						.join('|') + `|${document.documentElement.scrollHeight}`;

				void (async () => {
					// Pin spacers are measured only once fonts and layout have settled.
					try {
						await document.fonts?.ready;
					} catch {
						/* ignore */
					}
					// The branch page's outro keeps it in the layout for a moment; pins measured then end up a screen off.
					for (let i = 0; i < 60 && document.querySelector('.branch-page'); i++) await wait(50);
					await new Promise((resolve) =>
						requestAnimationFrame(() => requestAnimationFrame(resolve))
					);
					// Re-measure from the top until the pin ranges stop changing.
					let last = '';
					let stable = 0;
					for (let i = 0; i < 20 && stable < 3; i++) {
						if (page.url.pathname !== '/') return;
						window.scrollTo(0, 0);
						ScrollTrigger?.refresh();
						const key = layoutKey();
						stable = key === last ? stable + 1 : 0;
						last = key;
						await wait(150);
					}
					if (page.url.pathname !== '/') return;
					restore();
					homeScrollStore.pending = false;
					homeScrollStore.until = performance.now() + 1500;
					window.setTimeout(restore, 300);
				})();
			}
			if (pendingHomeReturn && ScrollTrigger) {
				// The scroll gate must not snap the restored position back to the first item.
				homeScrollStore.until = performance.now() + 2000;
				requestAnimationFrame(() => {
					ScrollTrigger?.refresh();
					if (categoryTriggerRef) {
						const targetScroll =
							categoryTriggerRef.start +
							(categoryTriggerRef.end - categoryTriggerRef.start) * pendingHomeReturn.progress;
						window.scrollTo({ top: targetScroll, left: 0, behavior: 'auto' });
						scrollStore.scroll = targetScroll;
						countStore.inertiaIndex = pendingHomeReturn.targetIndex;
					}
					ScrollTrigger?.update();
					projectSectionStore.setViewportTop(0);
					syncCategorySectionViewportTop();
					animationStore.isTransitioning = false;
					homeTransitionStore.clear();
				});
			}

			// Pin lengths depend on the viewport, so a resize keeps the visitor at the same place
			// within the same section instead of the same pixel offset.
			type Anchor = { i: number; f: number };
			const breakpoints = () => {
				if (!introTriggerRef || !categoryTriggerRef) return null;
				const max = document.documentElement.scrollHeight - window.innerHeight;
				return [
					introTriggerRef.start,
					introTriggerRef.end,
					categoryTriggerRef.start,
					categoryTriggerRef.end,
					Math.max(categoryTriggerRef.end, max)
				];
			};
			const captureAnchor = (): Anchor | null => {
				const b = breakpoints();
				if (!b) return null;
				const y = window.scrollY;
				let i = 0;
				while (i < b.length - 2 && y > b[i + 1]) i++;
				return { i, f: Math.min(1, Math.max(0, (y - b[i]) / (b[i + 1] - b[i] || 1))) };
			};
			const applyAnchor = (a: Anchor) => {
				const b = breakpoints();
				if (!b) return;
				homeScrollStore.until = performance.now() + 1500;
				const y = b[a.i] + a.f * (b[a.i + 1] - b[a.i]);
				window.scrollTo(0, y);
				scrollStore.scroll = y;
			};
			let anchor: Anchor | null = null;
			let refreshing = false;
			const refreshKeepingPosition = () => {
				if (!ScrollTrigger) return;
				const a = anchor ?? captureAnchor();
				anchor = null;
				refreshing = true;
				ScrollTrigger.refresh();
				refreshing = false;
				if (a) applyAnchor(a);
				ScrollTrigger.update();
				syncSectionStores();
			};
			let anchorTimer: ReturnType<typeof setTimeout> | undefined;
			const isTouchViewport = window.matchMedia('(hover: none)').matches;
			let lastResizeWidth = window.innerWidth;
			const onWindowResize = () => {
				// Height-only changes are the mobile toolbar, not a real resize.
				const widthChanged = window.innerWidth !== lastResizeWidth;
				lastResizeWidth = window.innerWidth;
				if (!widthChanged && isTouchViewport) return;
				if (page.url.pathname !== '/') return;
				if (!anchor) anchor = captureAnchor();
				// A stale anchor must never be applied to a later, unrelated refresh.
				clearTimeout(anchorTimer);
				anchorTimer = setTimeout(() => (anchor = null), 1200);
			};
			// ScrollTrigger refreshes itself on resize; restore the position right after it.
			const onTriggerRefresh = () => {
				if (refreshing || !anchor) return;
				const a = anchor;
				anchor = null;
				applyAnchor(a);
				ScrollTrigger?.update();
				syncSectionStores();
			};
			window.addEventListener('resize', onWindowResize);
			ScrollTrigger?.addEventListener('refresh', onTriggerRefresh);

			// Any later layout shift (a leaving page, late fonts or media) must re-measure the pins.
			let remeasureTimer: ReturnType<typeof setTimeout> | undefined;
			let resizeObserver: ResizeObserver | undefined;
			const mainEl = document.querySelector('main');
			if (mainEl && ScrollTrigger) {
				resizeObserver = new ResizeObserver(() => {
					clearTimeout(remeasureTimer);
					remeasureTimer = setTimeout(() => {
						if (page.url.pathname !== '/') return;
						refreshKeepingPosition();
					}, 150);
				});
				resizeObserver.observe(mainEl);
			}

			cleanup = () => {
				clearTimeout(remeasureTimer);
				clearTimeout(anchorTimer);
				window.removeEventListener('resize', onWindowResize);
				ScrollTrigger?.removeEventListener('refresh', onTriggerRefresh);
				removeCategoryGate?.();
				triggers.forEach((trigger) => trigger.kill(true));
				cleanupHomeScrollState();
			};
		})();

		return () => cleanup?.();
	});
</script>

<svelte:head>
	<title>James Henry</title>
	<meta name="description" content="Portfolio" />
</svelte:head>

<section
	bind:this={introSection}
	class="intro-section"
	class:opacity-0={animationStore.isTransitioning || page.url.pathname !== '/'}
	class:invisible={animationStore.isTransitioning || page.url.pathname !== '/'}
>
	<div
		class="intro-copy max-w-4xl text-white mix-blend-difference"
		class:intro-copy--shown={introGateStore.phase === 'revealing' ||
			introGateStore.phase === 'done'}
	>
		<div class="font-sans text-xs md:text-sm leading-relaxed text-left intro-body">
			{@html introBodyReserve}
		</div>
	</div>
</section>
<section
	class="landing-section"
	bind:this={categorySection}
	class:opacity-0={animationStore.isTransitioning || page.url.pathname !== '/'}
	class:invisible={animationStore.isTransitioning || page.url.pathname !== '/'}
>
	<div class="project-list-host" bind:this={projectListHostEl}></div>
	{#if countStore.isNewCat}
		<div
			class="md:w-[30vw] top-1/2 md:top-[20%] max-md:-translate-y-1/2 md:left-0 md:translate-x-1/3 pointer-events-none absolute"
			transition:scale={{ duration: 500, start: 0.5, easing: quintOut }}
		>
			<h2 class="text-white uppercase text-center font-mono text-3xl md:text-6xl m-0 2xl:top-1/4">
				{animationStore.currentCat[0]}
			</h2>
		</div>
	{/if}
</section>
<section
	class="final-section"
	class:opacity-0={animationStore.isTransitioning || page.url.pathname !== '/'}
	class:invisible={animationStore.isTransitioning || page.url.pathname !== '/'}
>
	<div class="final-copy text-white mix-blend-difference">
		<h3 class="font-sans text-4xl md:text-5xl lg:text-6xl leading-[0.92] font-bold mb-6 text-left">
			{finalHeadlineText}
		</h3>
		<p class="font-sans text-xs md:text-sm leading-relaxed opacity-80 text-left">
			{finalBodyText}
		</p>
	</div>
</section>

<style scoped>
	section {
		width: 100%;
		height: 100vh;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6rem;
		position: relative;
	}

	.project-list-host {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		pointer-events: none;
	}

	.intro-copy {
		width: min(100%, 84rem);
		margin-right: auto;
		padding: 0 min(30vw, 30rem) 0 clamp(2rem, 5vw, 4rem);
		opacity: 0;
		filter: blur(16px);
		transition:
			opacity 1.2s ease,
			filter 1.2s ease;
	}

	.intro-copy--shown {
		opacity: 1;
		filter: blur(0);
	}

	.intro-body {
		min-height: 1lh;
		opacity: 0.8;
	}

	.final-section {
		justify-content: flex-start;
	}

	.final-copy {
		width: min(100%, 84rem);
		margin-right: auto;
		padding: 0 min(30vw, 30rem) 0 clamp(2rem, 5vw, 4rem);
	}

	@media (max-width: 767px) {
		.intro-section,
		.final-section {
			align-items: flex-end;
			justify-content: flex-start;
			padding: 6rem 1rem 7.5rem;
		}

		.intro-copy,
		.final-copy {
			padding: 0;
			max-width: 80%;
			width: 18em;
		}
	}

	/* :global(body:not(.loaded)) .category-label {
		top: 50%;
	} */
</style>
