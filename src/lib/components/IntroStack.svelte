<script lang="ts">
	import { gsap } from 'gsap';
	import { onMount, untrack } from 'svelte';
	import { introGateStore } from '#lib/stores/index.svelte.js';
	import { sfx } from '#lib/utils/sfx.js';
	import { ambient } from '#lib/utils/ambient.svelte.js';
	import { gatePointer } from '#lib/utils/introGate.js';

	let groupEl = $state<HTMLElement>();
	let hintEl = $state<HTMLElement>();
	let isTouch = $state(false);
	let down: { x: number; y: number; t: number } | null = null;

	function enter() {
		if (groupEl) {
			gsap.fromTo(
				groupEl,
				{ opacity: 0, filter: 'blur(18px)' },
				{ opacity: 1, filter: 'blur(0px)', duration: 1.2, ease: 'power2.out' }
			);
		}
		if (hintEl) {
			gsap.fromTo(
				hintEl,
				{ opacity: 0 },
				{ opacity: 0.6, duration: 1, delay: 0.8, ease: 'power2.out' }
			);
		}
	}

	function leave() {
		if (introGateStore.phase !== 'waiting') return;
		sfx.welcome();
		// The ambient track joins once the welcome sound has played.
		window.setTimeout(() => ambient.startIfEnabled(), 900);
		gsap.to(groupEl, { opacity: 0, filter: 'blur(18px)', duration: 0.6, ease: 'power2.in' });
		introGateStore.phase = 'revealing';
	}

	function onPointerMove(event: PointerEvent) {
		gatePointer.x = event.clientX;
		gatePointer.y = event.clientY;
	}

	function onPointerDown(event: PointerEvent) {
		down = { x: event.clientX, y: event.clientY, t: performance.now() };
		onPointerMove(event);
	}

	function onPointerUp(event: PointerEvent) {
		if ((event.target as HTMLElement | null)?.closest('a, button')) return;
		if (event.pointerType === 'touch') {
			// A drag or a long hold is the surprise; only a quick tap continues.
			const tap =
				down &&
				performance.now() - down.t < 350 &&
				Math.hypot(event.clientX - down.x, event.clientY - down.y) < 12;
			down = null;
			gatePointer.x = -9999;
			if (!tap) return;
		}
		leave();
	}

	$effect(() => {
		if (introGateStore.phase === 'waiting') untrack(enter);
	});

	// Nothing may scroll until the visitor has clicked through.
	$effect(() => {
		if (introGateStore.phase === 'done') return;
		const html = document.documentElement;
		const prevent = (e: Event) => e.preventDefault();
		html.style.overflow = 'hidden';
		// Keeps pointer events flowing while a finger drags.
		html.style.touchAction = 'none';
		document.addEventListener('touchmove', prevent, { passive: false });
		return () => {
			html.style.overflow = '';
			html.style.touchAction = '';
			document.removeEventListener('touchmove', prevent);
		};
	});

	onMount(() => {
		isTouch = window.matchMedia('(hover: none)').matches;
		window.addEventListener('pointerdown', onPointerDown);
		window.addEventListener('pointermove', onPointerMove);
		window.addEventListener('pointerup', onPointerUp);
		return () => {
			window.removeEventListener('pointerdown', onPointerDown);
			window.removeEventListener('pointermove', onPointerMove);
			window.removeEventListener('pointerup', onPointerUp);
		};
	});
</script>

{#if introGateStore.phase !== 'done'}
	<div
		class="pointer-events-none fixed inset-0 z-35 flex items-center justify-center overflow-hidden"
	>
		<div bind:this={groupEl} class="flex w-[92vw] flex-col items-center gap-4 opacity-0">
			<h1
				class="text-center font-sans font-bold leading-[0.95] text-black dark:text-white md:whitespace-nowrap"
				style="font-size: clamp(1.6rem, 3.3vw, 3.5rem);"
			>
				Where ideas &amp; design are elevated <span class="font-mono font-normal">digitally.</span>
			</h1>
			<p
				bind:this={hintEl}
				class="text-center font-mono text-xs text-black opacity-0 dark:text-white md:text-sm"
			>
				{isTouch ? 'Drag & hold for a surprise. Tap to continue.' : 'Click anywhere to continue'}
			</p>
		</div>
	</div>
{/if}
