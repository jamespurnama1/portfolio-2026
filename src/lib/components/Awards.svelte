<script lang="ts">
	import type { Award, Post } from '#lib/types/index.js';
	import { fade, fly } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { sfx } from '#lib/utils/sfx.js';

	let currAward = $state('');
	let mounted = $state(false);
	let isTouch = $state(false);
	let awardsEl = $state([]) as HTMLDivElement[];
	let {
		item,
		awards: suppliedAwards,
		class: className = '',
		stacked = false,
		horizontal = false,
		landingLayout = false,
		compact = false
	}: {
		item?: Post;
		awards?: Award[];
		class?: string;
		stacked?: boolean;
		horizontal?: boolean;
		landingLayout?: boolean;
		compact?: boolean;
	} = $props();
	const awards = $derived(
		[...(suppliedAwards ?? item?.awards ?? [])].sort((a, b) => (a.index ?? 999) - (b.index ?? 999))
	);
	const alignAsLanding = $derived(!compact && (landingLayout || !page.params.slug));

	onMount(() => {
		isTouch = window.matchMedia('(hover: none)').matches;
		mounted = true;
	});

	function clearAward(event: FocusEvent | MouseEvent) {
		const button = event.currentTarget as HTMLButtonElement;
		if (event.type === 'mouseleave') {
			const focused = document.activeElement;
			if (focused instanceof HTMLButtonElement && awardsEl[0]?.contains(focused)) {
				currAward = focused.getAttribute('aria-label') ?? '';
				return;
			}
		}
		if (event.type === 'blur' && button.matches(':hover')) return;
		currAward = '';
	}
</script>

{#if mounted}
	<div
		bind:this={awardsEl[0]}
		in:fly={{ x: isTouch ? 0 : 200, duration: 500, easing: cubicInOut }}
		out:fade
		class="awards-list pointer-events-auto relative z-10 flex w-full max-w-full flex-wrap items-start justify-start {alignAsLanding
			? 'max-md:justify-center max-md:origin-left'
			: 'max-md:origin-left'} gap-4 origin-left {horizontal ? '' : 'scale-100'} md:gap-5 {stacked
			? 'md:grid md:grid-cols-[repeat(2,max-content)] md:justify-start md:gap-x-4'
			: ''} {className}"
		class:compact
	>
		{#each awards as award}
			<div
				class="flex w-min shrink-0 {horizontal
					? 'flex-row items-center'
					: 'flex-col items-start'} gap-1"
			>
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
								class="{compact
									? ''
									: 'invert dark:invert-0'} w-5 h-5 transition-transform hover:scale-150 focus-visible:scale-150 bg-gold"
								aria-label={gold}
								onclick={() => (currAward = gold)}
								onfocus={() => (currAward = gold)}
								onblur={clearAward}
								onmouseenter={() => {
									currAward = gold;
									sfx.tick();
								}}
								onmouseleave={clearAward}
							></button>
						{/each}
					{/if}
					{#if award.silver}
						{#each award.silver as silver}
							<button
								class="{compact
									? ''
									: 'invert dark:invert-0'} w-5 h-5 transition-transform hover:scale-150 focus-visible:scale-150 bg-silver"
								aria-label={silver}
								onclick={() => (currAward = silver)}
								onfocus={() => (currAward = silver)}
								onblur={clearAward}
								onmouseenter={() => {
									currAward = silver;
									sfx.tick();
								}}
								onmouseleave={clearAward}
							></button>
						{/each}
					{/if}
					{#if award.bronze}
						{#each award.bronze as bronze}
							<button
								class="{compact
									? ''
									: 'invert dark:invert-0'} w-5 h-5 transition-transform hover:scale-150 focus-visible:scale-150 bg-bronze"
								aria-label={bronze}
								onclick={() => (currAward = bronze)}
								onfocus={() => (currAward = bronze)}
								onblur={clearAward}
								onmouseenter={() => {
									currAward = bronze;
									sfx.tick();
								}}
								onmouseleave={clearAward}
							></button>
						{/each}
					{/if}
					{#if award.crystal}
						{#each award.crystal as crystal}
							<button
								class="{compact
									? ''
									: 'invert dark:invert-0'} w-5 h-5 transition-transform hover:scale-150 focus-visible:scale-150 bg-crystal"
								aria-label={crystal}
								onclick={() => (currAward = crystal)}
								onfocus={() => (currAward = crystal)}
								onblur={clearAward}
								onmouseenter={() => {
									currAward = crystal;
									sfx.tick();
								}}
								onmouseleave={clearAward}
							></button>
						{/each}
					{/if}
				</div>
			</div>
		{/each}
	</div>
	<p
		bind:this={awardsEl[1]}
		class="award-label w-full text-left {alignAsLanding
			? 'max-md:text-center'
			: ''} text-[0.45em] max-md:text-xs md:text-xs md:h-6 md:my-2 font-mono font-light {className}"
		transition:fly={{ x: isTouch ? 0 : 200, duration: 500, easing: cubicInOut, delay: 100 }}
		class:compact
	>
		{currAward
			? currAward.toUpperCase()
			: isTouch
				? 'TAP TO SEE EACH AWARD'
				: 'HOVER TO SEE EACH AWARD'}
	</p>
{/if}

<style>
	.awards-list.compact {
		gap: 0.75rem;
	}

	.compact > div {
		width: auto;
		flex-direction: column-reverse;
		gap: 0.35rem;
	}

	.compact img {
		width: 2.5rem;
		height: 2.5rem;
	}

	.compact > div > div {
		min-width: 2.5rem;
		gap: 0.25rem;
	}

	.compact button {
		width: 1.25rem;
		height: 1.25rem;
	}

	.award-label.compact {
		min-height: 1.5rem;
		margin: 0;
		font-size: 0.625rem;
	}
</style>
