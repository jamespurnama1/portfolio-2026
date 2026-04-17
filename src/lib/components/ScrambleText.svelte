<script lang="ts">
	import { onDestroy } from 'svelte';

	const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%&*';
	const SCRAMBLE_DURATION_MS = 150;

	let { text }: { text: string } = $props();
	let displayedText = $state(text);
	let scrambleTimer: ReturnType<typeof setInterval> | null = null;
	let stopTimer: ReturnType<typeof setTimeout> | null = null;

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
		}, SCRAMBLE_DURATION_MS);
	}

	$effect(() => {
		text;
		if (!scrambleTimer) {
			displayedText = text;
		}
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
	onmouseenter={startScramble}
	onmouseleave={stopScramble}
	onfocus={startScramble}
	onblur={stopScramble}
>
	{displayedText}
</span>
