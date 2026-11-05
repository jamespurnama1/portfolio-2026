const MAX_SCALE = 5;
const SPRING_MS = 320;

// Instagram-style zoom: the media floats unclipped while pinched, then springs back on release.
// Uses the independent `scale`/`translate` properties so GSAP's `transform` tweens are unaffected.
export function pinchZoom(node: HTMLElement, _selection?: unknown) {
	let scale = 1;
	let x = 0;
	let y = 0;
	let pinchDistance = 0;
	let moved = false;
	let suppressClick = false;
	let gestureStart = 1;
	let wheelTimer: ReturnType<typeof setTimeout> | undefined;
	let settleTimer: ReturnType<typeof setTimeout> | undefined;
	let springFrame = 0;
	let springing = false;
	const pointers = new Map<number, { x: number; y: number }>();

	const stage = () => node.querySelector<HTMLElement>('.feature-media');
	const media = () => stage()?.firstElementChild as HTMLElement | null | undefined;

	function clear() {
		const el = media();
		el?.style.removeProperty('transition');
		el?.style.removeProperty('scale');
		el?.style.removeProperty('translate');
		const stageEl = stage();
		if (stageEl) delete stageEl.dataset.zoomed;
	}

	function reset() {
		clearTimeout(wheelTimer);
		clearTimeout(settleTimer);
		cancelAnimationFrame(springFrame);
		springing = false;
		scale = 1;
		x = 0;
		y = 0;
		clear();
	}

	function apply() {
		const el = media();
		const stageEl = stage();
		if (!el || !stageEl) return;
		clearTimeout(settleTimer);
		cancelAnimationFrame(springFrame);
		springing = false;
		el.style.removeProperty('transition');
		el.style.setProperty('scale', String(scale));
		el.style.setProperty('translate', `${x}px ${y}px`);
		stageEl.dataset.zoomed = '';
	}

	function springBack() {
		clearTimeout(wheelTimer);
		// iOS fires pointer and gesture events for one pinch; a second call must not cut the spring short.
		if (springing) return;
		const el = media();
		if (!el || scale === 1) return reset();
		const from = { scale, x, y };
		scale = 1;
		x = 0;
		y = 0;
		springing = true;
		cancelAnimationFrame(springFrame);
		const start = performance.now();
		// Driven from JS: Safari doesn't reliably transition the independent scale/translate properties.
		const step = (now: number) => {
			if (!springing) return;
			const t = Math.min(1, (now - start) / SPRING_MS);
			const k = 1 - Math.pow(1 - t, 3);
			el.style.setProperty('scale', String(from.scale + (1 - from.scale) * k));
			el.style.setProperty('translate', `${from.x * (1 - k)}px ${from.y * (1 - k)}px`);
			if (t < 1) {
				springFrame = requestAnimationFrame(step);
			} else {
				springing = false;
				clear();
			}
		};
		springFrame = requestAnimationFrame(step);
	}

	function zoomAt(clientX: number, clientY: number, next: number) {
		const stageEl = stage();
		if (!stageEl) return;
		next = Math.min(MAX_SCALE, Math.max(1, next));
		const rect = stageEl.getBoundingClientRect();
		const px = clientX - (rect.left + rect.width / 2);
		const py = clientY - (rect.top + rect.height / 2);
		x = px - (px - x) * (next / scale);
		y = py - (py - y) * (next / scale);
		scale = next;
		apply();
	}

	function center() {
		const rect = stage()?.getBoundingClientRect();
		return rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 } : { x: 0, y: 0 };
	}

	function onWheel(event: WheelEvent) {
		if (!event.ctrlKey) return;
		event.preventDefault();
		event.stopImmediatePropagation();
		zoomAt(event.clientX, event.clientY, scale * Math.exp(-event.deltaY * 0.01));
		clearTimeout(wheelTimer);
		wheelTimer = setTimeout(springBack, 180);
	}

	function onPointerDown(event: PointerEvent) {
		if (event.pointerType === 'mouse' || !(event.target as Element).closest('.feature-media'))
			return;
		pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
		stage()?.setPointerCapture(event.pointerId);
		moved = false;
		if (pointers.size === 2) {
			const [a, b] = [...pointers.values()];
			pinchDistance = Math.hypot(a.x - b.x, a.y - b.y);
		}
	}

	function onPointerMove(event: PointerEvent) {
		const pointer = pointers.get(event.pointerId);
		if (!pointer) return;
		const dx = event.clientX - pointer.x;
		const dy = event.clientY - pointer.y;
		pointer.x = event.clientX;
		pointer.y = event.clientY;
		if (pointers.size >= 2) {
			const [a, b] = [...pointers.values()];
			const distance = Math.hypot(a.x - b.x, a.y - b.y);
			moved = true;
			x += dx / 2;
			y += dy / 2;
			if (pinchDistance > 0) {
				zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, (scale * distance) / pinchDistance);
			}
			pinchDistance = distance;
		} else if (scale > 1) {
			moved = true;
			x += dx;
			y += dy;
			apply();
		}
	}

	function onPointerEnd(event: PointerEvent) {
		if (!pointers.delete(event.pointerId)) return;
		pinchDistance = 0;
		if (pointers.size === 0) springBack();
		if (moved) {
			suppressClick = true;
			setTimeout(() => (suppressClick = false), 50);
		}
	}

	function onClick(event: MouseEvent) {
		if (!suppressClick || !(event.target as Element).closest('.feature-media')) return;
		event.stopImmediatePropagation();
		event.preventDefault();
	}

	// Safari reports trackpad pinch as gesture events instead of ctrl+wheel.
	type GestureEvent = Event & { scale: number; clientX?: number; clientY?: number };
	function onGestureStart(event: Event) {
		event.preventDefault();
		gestureStart = scale;
	}
	function onGestureChange(event: Event) {
		event.preventDefault();
		const gesture = event as GestureEvent;
		const fallback = center();
		zoomAt(
			gesture.clientX ?? fallback.x,
			gesture.clientY ?? fallback.y,
			gestureStart * gesture.scale
		);
	}
	function onGestureEnd(event: Event) {
		event.preventDefault();
		springBack();
	}

	node.addEventListener('wheel', onWheel, { passive: false, capture: true });
	node.addEventListener('pointerdown', onPointerDown);
	node.addEventListener('pointermove', onPointerMove);
	node.addEventListener('pointerup', onPointerEnd);
	node.addEventListener('pointercancel', onPointerEnd);
	node.addEventListener('click', onClick, true);
	node.addEventListener('gesturestart', onGestureStart);
	node.addEventListener('gesturechange', onGestureChange);
	node.addEventListener('gestureend', onGestureEnd);

	return {
		update: reset,
		destroy() {
			clearTimeout(wheelTimer);
			clearTimeout(settleTimer);
			cancelAnimationFrame(springFrame);
			node.removeEventListener('wheel', onWheel, true);
			node.removeEventListener('pointerdown', onPointerDown);
			node.removeEventListener('pointermove', onPointerMove);
			node.removeEventListener('pointerup', onPointerEnd);
			node.removeEventListener('pointercancel', onPointerEnd);
			node.removeEventListener('click', onClick, true);
			node.removeEventListener('gesturestart', onGestureStart);
			node.removeEventListener('gesturechange', onGestureChange);
			node.removeEventListener('gestureend', onGestureEnd);
		}
	};
}
