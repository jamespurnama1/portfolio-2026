<script lang="ts">
	import type { Award, Post } from '$lib/types';
	import { fade, fly } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { sfx } from '$lib/utils/sfx';

	let currAward = $state('');
	let mounted = $state(false);
	let isTouch = $state(false);
	let awardsEl = $state([]) as HTMLDivElement[];
	let {
		item,
		class: className = '',
		stacked = false
	}: { item: Post; class?: string; stacked?: boolean } = $props();
	const awards = $derived([...(item.awards as Award[])].sort((a, b) => a.index - b.index));

	onMount(() => {
		isTouch = window.matchMedia('(hover: none)').matches;
		mounted = true;
	});
</script>

{#if mounted}
	<div
		bind:this={awardsEl[0]}
		in:fly={{ x: isTouch ? 0 : 200, duration: 500, easing: cubicInOut }}
		out:fade
		class:scale-[75%]={page.params.slug}
		class="pointer-events-auto relative z-10 flex w-full max-w-full flex-wrap items-start justify-start {page
			.params.slug
			? 'max-md:origin-left'
			: 'max-md:justify-center max-md:origin-center'} gap-4 origin-left scale-75 md:gap-5 md:scale-100 {stacked
			? 'md:grid md:grid-cols-[repeat(2,max-content)] md:justify-start md:gap-x-4'
			: ''} {className}"
	>
		{#each awards as award}
			<div class="flex w-min shrink-0 flex-col items-start gap-1">
				<img
					class="w-10 h-10 object-contain brightness-100"
					src={award.icon.asset.url}
					alt={award.issuer}
				/>
				<div class="grid grid-cols-[repeat(2,1.25rem)] gap-2 flex-wrap min-w-12">
					<!-- TODO: Make this into component & less reptitive -->
					{#if award.gold}
						{#each award.gold as gold}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-gold"
								aria-label={gold}
								onclick={() => (currAward = gold)}
								onmouseenter={() => {
									currAward = gold;
									sfx.tick();
								}}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.silver}
						{#each award.silver as silver}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-silver"
								aria-label={silver}
								onclick={() => (currAward = silver)}
								onmouseenter={() => {
									currAward = silver;
									sfx.tick();
								}}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.bronze}
						{#each award.bronze as bronze}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-bronze"
								aria-label={bronze}
								onclick={() => (currAward = bronze)}
								onmouseenter={() => {
									currAward = bronze;
									sfx.tick();
								}}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.crystal}
						{#each award.crystal as crystal}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-crystal"
								aria-label={crystal}
								onclick={() => (currAward = crystal)}
								onmouseenter={() => {
									currAward = crystal;
									sfx.tick();
								}}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<p
		bind:this={awardsEl[1]}
		class="w-full text-left {page.params.slug
			? ''
			: 'max-md:text-center'} text-[0.45em] max-md:text-xs md:text-xs md:h-6 md:my-2 font-mono font-light {className}"
		transition:fly={{ x: isTouch ? 0 : 200, duration: 500, easing: cubicInOut, delay: 100 }}
	>
		{currAward
			? currAward.toUpperCase()
			: isTouch
				? 'TAP TO SEE EACH AWARD'
				: 'HOVER TO SEE EACH AWARD'}
	</p>
{/if}
