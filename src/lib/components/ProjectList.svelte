<script lang="ts">
	import type { PageData } from '../../routes/$types';
	import { type Post, type SanityReference } from '$lib/types';
	import { page } from '$app/stores';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { onMount, untrack } from 'svelte';
	import ListItem from './ListItem.svelte';
	import { countStore, gptStore } from '$lib/stores/index.svelte';
	import { gsap } from 'gsap';

	const { data }: { data: Required<PageData> } = $props();
	let projectList = $state() as HTMLUListElement;
	let list = $state([]) as Array<{ content: string; catIndex: number } | Post>;
	const posts = $state([]) as Array<Post>;
	const categoryItems = $derived(data.catItems ?? []);
	const projectsLength = $derived(data.projectsLength ?? data.projects?.length ?? 0);
	const activeIndex = $derived(
		posts[countStore.activeIndex]
			? (posts[countStore.activeIndex].catIndex as number)
			: countStore.activeIndex
	);
	let sel = $state() as HTMLLIElement;
	let selHeight = $state(44);
	// let selHeight = $derived(sel ? sel.getBoundingClientRect().height : 44);

	onMount(() => {
		gsap.to(projectList, {
			duration: 1,
			x: 0,
			opacity: 1,
			ease: 'power3.out',
			delay: projectsLength * 0.25
		});
		if (!categoryItems.length) return;
		categoryItems.forEach((category, catIndex) => {
			list.push({ content: `> ${category.title} >`, catIndex: catIndex });
			category.items.forEach((item: Post | SanityReference<Post>, postIndex: number): void => {
				(item as Post).index = catIndex
					? (data.categoriesLength?.[catIndex - 1] ?? 0) + postIndex
					: postIndex;
				(item as Post).catIndex = catIndex;
				list.push(item as Post);
				posts.push(item as Post);
			});
		});

		list.forEach((item, index) => {
			item.catIndex = index;
			if (typeof item.content !== 'string') {
				const post = posts.find((x) => x.slug.current === (item as Post).slug.current);
				post!.catIndex = index;
			}
		});
	});

	$effect(() => {
		sel;
		countStore.activeIndex;
		untrack(() => {
			sel = document.querySelector('.selected') as HTMLLIElement;
			if (!sel) return;
			setTimeout(() => {
				selHeight = sel ? sel.getBoundingClientRect().height : 44;
			}, 200);
		});
	});

	$effect(() => {
		gptStore.opened;
		optionsStore.fullscreen;
		untrack(() => {
			if (gptStore.opened || optionsStore.fullscreen) {
				gsap.to(projectList, {
					duration: 0.3,
					opacity: 0,
					ease: 'power3.in'
				});
			} else {
				gsap.to(projectList, {
					duration: 0.3,
					opacity: 1,
					ease: 'power3.out'
				});
			}
		});
	});

	// {animationStore.isTransitioning ? 'translate-x-1/2': ''}
</script>

<ul
	bind:this={projectList}
	class="absolute md:h-full h-[40vh] w-full md:w-[45%] max-md:top-0 md:right-0 text-white font-mono ml-auto mix-blend-difference flex items-center justify-center flex-col opacity-0 -translate-x-10"
>
	{#if list.length}
		{#each list as item, index}
			<ListItem
				{index}
				extraDelay={0}
				{item}
				{selHeight}
				{activeIndex}
				active={typeof item.content !== 'string' && (item as Post).index === countStore.activeIndex}
			></ListItem>
		{/each}
	{/if}
</ul>

<style scoped>
	ul {
		mask-image: linear-gradient(
			0deg,
			rgba(0, 0, 0, 0) 5%,
			rgba(0, 0, 0, 1) 25%,
			rgba(0, 0, 0, 1) 75%,
			rgba(0, 0, 0, 0) 95%
		);
	}
</style>
