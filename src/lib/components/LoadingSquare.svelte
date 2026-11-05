<span class="square" role="status" aria-label="Loading"><i></i><i></i><i></i><i></i></span>

<style>
	.square {
		display: grid;
		grid-template-columns: repeat(2, 0.6rem);
		grid-template-rows: repeat(2, 0.6rem);
		width: 1.2rem;
		height: 1.2rem;
	}
	i {
		display: block;
		background: currentColor;
		animation: split 1.8s ease-in-out infinite;
	}
	i:nth-child(1) {
		--dx: -1;
		--dy: -1;
	}
	i:nth-child(2) {
		--dx: 1;
		--dy: -1;
	}
	i:nth-child(3) {
		--dx: -1;
		--dy: 1;
	}
	i:nth-child(4) {
		--dx: 1;
		--dy: 1;
	}
	@keyframes split {
		0%,
		10% {
			translate: 0 0;
			scale: 1;
		}
		30% {
			translate: calc(var(--dx) * 0.4rem) calc(var(--dy) * 0.4rem);
			scale: 1;
		}
		50% {
			translate: calc(var(--dx) * 0.4rem) calc(var(--dy) * 0.4rem);
			scale: 0;
		}
		70% {
			translate: calc(var(--dx) * 0.4rem) calc(var(--dy) * 0.4rem);
			scale: 1;
		}
		90%,
		100% {
			translate: 0 0;
			scale: 1;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		i {
			animation: none;
		}
	}
</style>
