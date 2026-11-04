<script lang="ts">
	import { page } from '$app/state';
	import { onMount } from 'svelte';
	import ScrambleText from '#lib/components/ScrambleText.svelte';

	let scrambling = $state(false);

	onMount(() => {
		let off: ReturnType<typeof setTimeout>;
		let on: ReturnType<typeof setTimeout>;
		const loop = () => {
			on = setTimeout(
				() => {
					scrambling = true;
					off = setTimeout(() => {
						scrambling = false;
						loop();
					}, 400);
				},
				1500 + Math.random() * 2500
			);
		};
		loop();
		return () => {
			clearTimeout(on);
			clearTimeout(off);
		};
	});
</script>

<svelte:head>
	<title>{page.status} | James Henry</title>
</svelte:head>

<main class="flex min-h-svh flex-col items-center justify-center gap-4 px-6 text-center">
	<h1 class="text-[clamp(8rem,32vw,28rem)] leading-none font-bold">
		<ScrambleText text={String(page.status)} active={scrambling} durationMs={400} />
	</h1>
	<a href="/" class="text-xs tracking-widest uppercase hover:underline">Go back home</a>
</main>
