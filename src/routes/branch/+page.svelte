<script lang="ts">
	import ScrambleText from '$lib/components/ScrambleText.svelte';

	const branches = [
		{ label: 'v1.0.0', href: 'https://example.com/v1' },
		{ label: 'v2.0.0', href: 'https://example.com/v2' },
		{ label: 'v3.0.0', href: 'https://example.com/v3' }
	];
</script>

<svelte:head>
	<title>Branch</title>
	<meta name="description" content="Portfolio version selector" />
</svelte:head>

<section class="branch-page">
	<div class="branch-list" aria-label="Portfolio versions">
		{#each branches as branch}
			<a class="branch-link branch-glow" href={branch.href} target="_blank" rel="noreferrer">
				<ScrambleText text={branch.label} />
			</a>
		{/each}
	</div>
</section>

<style lang="scss" scoped>
	.branch-page {
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
