<span class="bar" role="status" aria-label="Waiting for response"
	><i style="--i:0"></i><i style="--i:1"></i><i style="--i:2"></i><i style="--i:3"></i></span
>

<style>
	.bar {
		display: flex;
		width: 3.6rem;
		height: 0.6rem;
	}
	i {
		display: block;
		flex: none;
		width: 0.3rem;
		height: 0.6rem;
		background: currentColor;
		animation: spread 1.8s cubic-bezier(0.65, 0, 0.35, 1) infinite;
	}
	@keyframes spread {
		0%,
		15% {
			width: 0.3rem;
			translate: 0 0;
		}
		45%,
		65% {
			width: 0.6rem;
			translate: calc(var(--i) * 0.7rem) 0;
		}
		95%,
		100% {
			width: 0.3rem;
			translate: 0 0;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		i {
			animation: none;
		}
	}
</style>
