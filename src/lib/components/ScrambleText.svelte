<script lang="ts">
	import { onDestroy, untrack } from 'svelte';

	const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
	const SCRAMBLE_DURATION_MS = 150;

	let {
		text,
		active = false,
		reserveText = text,
		durationMs = SCRAMBLE_DURATION_MS
	}: { text: string; active?: boolean; reserveText?: string; durationMs?: number } = $props();
	let displayedText = $state(text);
	let scrambleTimer: ReturnType<typeof setInterval> | null = null;
	let stopTimer: ReturnType<typeof setTimeout> | null = null;
	let wasActive = $state(false);

	function scramble(source: string) {
		return source
			.split('')
			.map((char) => {
				if (char === ' ' || char === '\u00A0') return char;
				return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
			})
			.join('');
	}

	function stopScramble() {
		if (scrambleTimer) {
			clearInterval(scrambleTimer);
			scrambleTimer = null;
		}
		if (stopTimer) {
			clearTimeout(stopTimer);
			stopTimer = null;
		}
		displayedText = text;
	}

	function startScramble() {
		stopScramble();
		displayedText = scramble(text);
		scrambleTimer = setInterval(() => {
			displayedText = scramble(text);
		}, 48);
		stopTimer = setTimeout(() => {
			stopScramble();
		}, durationMs);
	}

	$effect(() => {
		text;
		if (!scrambleTimer) {
			displayedText = text;
		}
	});

	$effect(() => {
		active;
		untrack(() => {
			if (active && !wasActive) {
				startScramble();
			} else if (!active && wasActive) {
				stopScramble();
			}
			wasActive = active;
		});
	});

	onDestroy(() => {
		if (scrambleTimer) {
			clearInterval(scrambleTimer);
		}
		if (stopTimer) {
			clearTimeout(stopTimer);
		}
	});
</script>

<span
	role="presentation"
	class="scramble-text"
	onmouseenter={startScramble}
	onmouseleave={stopScramble}
	onfocus={startScramble}
	onblur={stopScramble}
>
	<span class="scramble-text__reserve" aria-hidden="true">{reserveText}</span>
	<span class="scramble-text__display">{displayedText}</span>
</span>

<style>
	.scramble-text {
		display: inline-grid;
		grid-template-columns: minmax(0, max-content);
		grid-template-rows: auto;
		align-items: baseline;
		white-space: pre-wrap;
	}

	.scramble-text__reserve,
	.scramble-text__display {
		grid-area: 1 / 1;
		white-space: inherit;
	}

	.scramble-text__reserve {
		visibility: hidden;
		pointer-events: none;
	}

	.scramble-text__display {
		min-width: 100%;
	}
</style>
