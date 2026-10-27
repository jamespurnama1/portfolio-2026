<script lang="ts">
	import { cursorSnapStore } from '$lib/stores/index.svelte';
	import ScrambleText from '$lib/components/ScrambleText.svelte';
	import { cubicOut } from 'svelte/easing';
	import { onDestroy } from 'svelte';
	import { sfx } from '$lib/utils/sfx';

	// Blur + rise; global so it also plays when the whole route is swapped.
	function rise(node: Element, { delay = 0, duration = 600, y = 28 } = {}) {
		return {
			delay,
			duration,
			easing: cubicOut,
			css: (t: number) =>
				`opacity: ${t}; transform: translateY(${(1 - t) * y}px) scale(${0.94 + 0.06 * t}); filter: blur(${(1 - t) * 10}px);`
		};
	}

	const branches = [
		{ label: 'v1.0.0', href: 'https://example.com/v1' },
		{ label: 'v2.0.0', href: 'https://example.com/v2' },
		{ label: 'v3.0.0', href: 'https://example.com/v3' }
	];
	const SNAP_RADIUS = 140;
	let activeSnapId = $state('');
	let branchButtons = $state([]) as HTMLAnchorElement[];

	function clearSnap() {
		activeSnapId = '';
		cursorSnapStore.clear();
	}

	function updateSnapTarget(event: PointerEvent) {
		if (event.pointerType === 'touch' || branchButtons.length === 0) {
			clearSnap();
			return;
		}

		let bestMatch:
			| {
					id: string;
					x: number;
					y: number;
					distance: number;
			  }
			| undefined;

		for (const button of branchButtons) {
			if (!button) continue;
			const rect = button.getBoundingClientRect();
			const centerX = rect.left + rect.width / 2;
			const centerY = rect.top + rect.height / 2;
			const distance = Math.hypot(event.clientX - centerX, event.clientY - centerY);
			const radius = Math.max(SNAP_RADIUS, rect.width * 0.7);
			if (distance > radius) continue;
			if (!bestMatch || distance < bestMatch.distance) {
				bestMatch = {
					id: button.dataset.branchId ?? '',
					x: centerX,
					y: centerY,
					distance
				};
			}
		}

		if (!bestMatch) {
			clearSnap();
			return;
		}

		if (activeSnapId !== bestMatch.id) sfx.tick();
		activeSnapId = bestMatch.id;
		cursorSnapStore.setTarget({
			id: bestMatch.id,
			x: bestMatch.x,
			y: bestMatch.y
		});
	}

	function snapToFocusedButton(button: HTMLAnchorElement | null) {
		if (!button) {
			clearSnap();
			return;
		}
		const rect = button.getBoundingClientRect();
		const id = button.dataset.branchId ?? '';
		if (activeSnapId !== id) sfx.tick();
		activeSnapId = id;
		cursorSnapStore.setTarget({
			id,
			x: rect.left + rect.width / 2,
			y: rect.top + rect.height / 2
		});
	}

	function handleSectionPointerUp(event: PointerEvent) {
		const target = event.target as HTMLElement | null;
		if (target?.closest('a')) return;
		if (!activeSnapId) return;
		const snappedButton = branchButtons.find((button) => button?.dataset.branchId === activeSnapId);
		if (!snappedButton) return;
		snappedButton.click();
	}

	onDestroy(() => {
		clearSnap();
	});
</script>

<svelte:head>
	<title>Branch</title>
	<meta name="description" content="Portfolio version selector" />
</svelte:head>

<section
	class="branch-page"
	onpointermove={updateSnapTarget}
	onpointerleave={clearSnap}
	onpointerup={handleSectionPointerUp}
>
	<div class="branch-list" aria-label="Portfolio versions">
		{#each branches as branch, index}
			<a
				bind:this={branchButtons[index]}
				in:rise|global={{ delay: 150 + index * 110 }}
				out:rise|global={{ delay: (branches.length - 1 - index) * 60, duration: 350, y: -16 }}
				class="branch-link branch-glow"
				class:branch-link--snapped={activeSnapId === branch.label}
				data-branch-id={branch.label}
				href={branch.href}
				target="_blank"
				rel="noreferrer"
				onfocus={(event) => snapToFocusedButton(event.currentTarget as HTMLAnchorElement)}
				onblur={clearSnap}
			>
				<ScrambleText text={branch.label} active={activeSnapId === branch.label} />
			</a>
		{/each}
	</div>
</section>

<style scoped>
	.branch-page {
		/* Out of flow so it never offsets the landing page's pins while it animates out. */
		position: absolute;
		top: 0;
		left: 0;
		min-height: 100vh;
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6rem 2rem;
	}

	.branch-list {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: clamp(0.75rem, 2vw, 1.5rem);
		flex-wrap: wrap;
	}

	.branch-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.9rem 1.35rem;
		background-color: #fff;
		color: #000;
		font-family: var(--font-mono, monospace);
		font-size: clamp(0.95rem, 1.5vw, 1.15rem);
		line-height: 1;
		text-transform: uppercase;
		text-decoration: none;
		box-shadow:
			0 0 10px rgb(255, 255, 255, 0.3),
			-10px 0 40px rgb(255, 0, 255, 0.3),
			10px 0 40px rgb(0, 255, 255, 0.3);
		transition:
			transform 0.3s ease,
			opacity 0.3s ease;
	}

	.branch-link:hover {
		transform: translateY(-2px);
	}

	.branch-link--snapped {
		transform: translateY(-4px) scale(1.04);
		box-shadow:
			0 0 18px rgb(255, 255, 255, 0.42),
			-16px 0 56px rgb(255, 0, 255, 0.4),
			16px 0 56px rgb(0, 255, 255, 0.4);
	}

	:global(html[data-theme='dark']) .branch-link {
		background-color: #000;
		color: #fff;
	}

	.branch-glow::after {
		content: '';
		position: absolute;
		inset: 0;
		z-index: -1;
		opacity: 0;
		transition: opacity 0.3s ease-in-out;
		animation: glowing 5s infinite;
	}

	.branch-glow:hover::after,
	.branch-link--snapped::after,
	.branch-glow:focus-visible::after {
		opacity: 1;
	}

	.branch-link:focus-visible {
		outline: none;
		transform: translateY(-2px);
	}

	@media (max-width: 767px) {
		.branch-page {
			padding: 5rem 1.5rem;
		}

		.branch-list {
			gap: 0.75rem;
		}

		.branch-link {
			width: min(100%, 16rem);
		}
	}
</style>
