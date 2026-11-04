<script lang="ts">
	let { active = false }: { active?: boolean } = $props();
</script>

<span class="wave" class:active aria-hidden="true"><i></i><i></i><i></i><i></i><i></i></span>

<style>
	.wave {
		display: inline-flex;
		align-items: center;
		gap: 2px;
		height: 0.9rem;
	}
	.wave i {
		display: block;
		width: 2px;
		height: 100%;
		background: currentColor;
		transform: scaleY(0.1);
		transition: transform 0.4s ease;
	}
	.active i {
		animation: wave 1.6s ease-in-out infinite;
	}
	.active i:nth-child(2) {
		animation-delay: -0.3s;
	}
	.active i:nth-child(3) {
		animation-delay: -0.6s;
	}
	.active i:nth-child(4) {
		animation-delay: -0.9s;
	}
	.active i:nth-child(5) {
		animation-delay: -1.2s;
	}
	@keyframes wave {
		0%,
		100% {
			transform: scaleY(0.2);
		}
		50% {
			transform: scaleY(1);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.active i {
			animation: none;
			transform: scaleY(0.6);
		}
	}
</style>
