<script lang="ts">
	import { cursorSnapStore } from '#lib/stores/index.svelte.js';
	import ScrambleText from '#lib/components/ScrambleText.svelte';
	import { cubicOut } from 'svelte/easing';
	import { onDestroy } from 'svelte';
	import { sfx } from '#lib/utils/sfx.js';

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
		{ label: 'v1.0.12', href: 'https://portfolio-brown-seven.vercel.app/' },
		// { label: 'v2.0.7', href: 'https://example.com/v2' },
		{ label: 'v2.2.11', href: 'https://new-portfolio-ruby.vercel.app/' },
		{ label: 'v3.0.6', href: '/', current: true }
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
					x: rect.left - 20,
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
			x: rect.left - 20,
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
	aria-label="Portfolio versions"
	onpointermove={updateSnapTarget}
	onpointerleave={clearSnap}
	onpointerup={handleSectionPointerUp}
>
	<div class="branch-list">
		{#each branches as branch, index (branch.label)}
			<a
				bind:this={branchButtons[index]}
				in:rise|global={{ delay: 150 + index * 110 }}
				out:rise|global={{ delay: (branches.length - 1 - index) * 60, duration: 350, y: -16 }}
				class="branch-link branch-glow"
				class:branch-link--snapped={activeSnapId === branch.label}
				data-branch-id={branch.label}
				href={branch.href}
				target={branch.current ? undefined : '_blank'}
				rel={branch.current ? undefined : 'noreferrer'}
				onfocus={(event) => snapToFocusedButton(event.currentTarget as HTMLAnchorElement)}
				onblur={clearSnap}
			>
				{#if branch.current}<span class="branch-current">Current</span>{/if}
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
		display: grid;
		grid-template-columns: repeat(4, max-content);
		align-items: center;
		justify-content: space-between;
		width: min(100%, 74rem);
		gap: 3rem;
	}

	.branch-link {
		position: relative;
		display: inline-flex;
		align-items: center;
		color: #000;
		font-family: var(--font-mono, monospace);
		font-size: 3rem;
		line-height: 1;
		text-transform: uppercase;
		text-decoration: none;
		transition: text-shadow 0.3s ease;
	}

	:global([data-theme='dark']) .branch-link {
		color: #fff;
	}

	.branch-current {
		position: absolute;
		bottom: calc(100% + 0.4rem);
		left: 0;
		font-size: 0.75rem;
	}

	.branch-link--snapped,
	.branch-link:focus-visible {
		text-shadow:
			0 0 12px currentColor,
			0 0 30px currentColor;
	}

	:global(html[data-theme='light']) .branch-link--snapped,
	:global(html[data-theme='light']) .branch-link:focus-visible {
		text-shadow:
			0 0 10px rgba(255, 255, 255, 0.75),
			-10px 0 80px rgba(255, 0, 255, 0.5),
			10px 0 80px rgba(0, 255, 255, 0.5);
		animation: branch-glowing 5s infinite;
	}

	@keyframes branch-glowing {
		0%,
		100% {
			text-shadow:
				0 0 10px rgba(255, 255, 255, 0.75),
				-10px 0 80px rgba(255, 0, 255, 0.5),
				10px 0 80px rgba(0, 255, 255, 0.5);
		}
		25% {
			text-shadow:
				0 0 10px rgba(255, 255, 255, 0.75),
				0 0 20px rgba(255, 0, 255, 0.3),
				0 0 50px rgba(0, 255, 255, 0.5);
		}
		50% {
			text-shadow:
				0 0 10px rgba(255, 255, 255, 0.75),
				10px 0 50px rgba(255, 0, 255, 0.5),
				-10px 0 20px rgba(0, 255, 255, 0.3);
		}
		75% {
			text-shadow:
				0 0 10px rgba(255, 255, 255, 0.75),
				0 0 80px rgba(255, 0, 255, 0.5),
				0 0 80px rgba(0, 255, 255, 0.5);
		}
	}

	@media (prefers-reduced-motion: reduce) {
		:global(html[data-theme='light']) .branch-link--snapped,
		:global(html[data-theme='light']) .branch-link:focus-visible {
			animation: none;
		}
	}

	.branch-link:focus-visible {
		outline: 1px solid currentColor;
		outline-offset: 0.4rem;
	}

	@media (max-width: 1023px) {
		.branch-list {
			grid-template-columns: repeat(2, max-content);
			justify-content: space-evenly;
		}
	}

	@media (max-width: 767px) {
		.branch-page {
			padding: 5rem 1.5rem;
		}

		.branch-list {
			justify-content: center;
			gap: 2.5rem 3rem;
		}

		.branch-link {
			font-size: 2rem;
		}
	}
</style>
