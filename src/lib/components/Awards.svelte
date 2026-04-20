<script lang="ts">
	import type { Award, Post } from '$lib/types';
	import { fade, fly } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import { page } from '$app/state';

	let currAward = $state('');
	let mounted = $state(false);
	let awardsEl = $state([]) as HTMLDivElement[];
	let { item, class: className = '' }: { item: Post; class?: string } = $props();
	const awards = [...(item.awards as Award[])]!.sort((a, b) => a.index - b.index);

	onMount(() => {
		mounted = true;
	});
</script>

{#if mounted}
	<div
		bind:this={awardsEl[0]}
		in:fly={{ x: 200, duration: 500, easing: cubicInOut }}
		out:fade
		class:scale-[75%]={page.params.slug}
		class="relative z-10 flex w-full max-w-full flex-wrap items-start justify-start gap-4 origin-left scale-75 md:gap-5 md:scale-100 {className}"
	>
		{#each awards as award}
			<div class="flex w-min shrink-0 flex-col items-start gap-1">
				<img
					class="w-10 h-10 object-contain brightness-100"
					src={award.icon.asset.url}
					alt={award.issuer}
				/>
				<div class="grid grid-cols-2 gap-2 flex-wrap min-w-12">
					<!-- TODO: Make this into component & less reptitive -->
					{#if award.gold}
						{#each award.gold as gold}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-gold"
								aria-label={gold}
								onmouseenter={() => (currAward = gold)}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.silver}
						{#each award.silver as silver}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-silver"
								aria-label={silver}
								onmouseenter={() => (currAward = silver)}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.bronze}
						{#each award.bronze as bronze}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-bronze"
								aria-label={bronze}
								onmouseenter={() => (currAward = bronze)}
								onmouseleave={() => (currAward = '')}
							></button>
						{/each}
					{/if}
					{#if award.crystal}
						{#each award.crystal as crystal}
							<button
								class="invert dark:invert-0 w-5 h-5 transition-transform hover:scale-150 bg-crystal"
								aria-label={crystal}
								onmouseenter={() => (currAward = crystal)}
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
		class="no-touch w-full text-left text-[0.45em] md:text-xs md:h-6 md:my-2 font-mono font-light {className}"
		transition:fly={{ x: 200, duration: 500, easing: cubicInOut, delay: 100 }}
	>
		{currAward ? currAward : 'Hover to see each awards'}
	</p>
{/if}

<style lang="scss" scoped>
	:global {
		@media (hover: none) and (pointer: coarse) {
			.no-touch {
				@apply hidden;
			}
		}
	}
</style>
