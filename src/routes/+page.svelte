<script lang="ts">
	import { animationStore, countStore, scrollStore } from '$lib/stores/index.svelte';
	import { scale } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import { gsap } from 'gsap';
	import { ScrollTrigger } from 'gsap/ScrollTrigger';
	import { onMount, untrack } from 'svelte';
	import { page } from '$app/state';
	import { projectListHost } from '$lib/stores/projectListHost';
	import { projectSectionStore } from '$lib/stores/projectSection';
	import type { PageData } from './$types';

	const { data }: { data: Required<PageData> } = $props();
	const projectsLength = data.projectsLength ?? data.projects?.length ?? 0;
	const projectsPinPercent = Math.max(0, projectsLength * 10);
	let introSection: HTMLElement | null = null;
	let categorySection: HTMLElement | null = null;
	let projectListHostEl: HTMLElement | null = null;

	gsap.registerPlugin(ScrollTrigger);

	function syncCategorySectionViewportTop() {
		if (page.url.pathname !== '/' || !categorySection) {
			projectSectionStore.setViewportTop(0);
			return;
		}
		projectSectionStore.setViewportTop(categorySection.getBoundingClientRect().top);
	}

	$effect(() => {
		page.url.pathname;
		untrack(() => {
			if (page.url.pathname === '/') return;
			projectListHost.set(null);
			projectSectionStore.reset();
			ScrollTrigger.getAll().forEach((trigger) => trigger.kill(true));
		});
	});

	$effect(() => {
		scrollStore.scroll;
		categorySection;
		untrack(() => syncCategorySectionViewportTop());
	});

	onMount(() => {
		if (page.url.pathname !== '/') {
			projectListHost.set(null);
			projectSectionStore.reset();
			return;
		}

		if (projectListHostEl) {
			projectListHost.set(projectListHostEl);
		}
		syncCategorySectionViewportTop();

		const triggers: ScrollTrigger[] = [];
		if (introSection) {
			triggers.push(
				ScrollTrigger.create({
					trigger: introSection,
					start: 'top top',
					end: '+=200%',
					pin: true,
					pinSpacing: true
				})
			);
		}
		if (categorySection) {
			triggers.push(
				ScrollTrigger.create({
					trigger: categorySection,
					start: 'top top',
					end: `+=${projectsPinPercent}%`,
					pin: true,
					pinSpacing: true,
					scrub: true,
					onEnter: () => {
						projectSectionStore.setPinned(true);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onEnterBack: () => {
						projectSectionStore.setPinned(true);
						syncCategorySectionViewportTop();
					},
					onLeave: () => {
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(1);
						syncCategorySectionViewportTop();
					},
					onLeaveBack: () => {
						projectSectionStore.setPinned(false);
						projectSectionStore.setProgress(0);
						syncCategorySectionViewportTop();
					},
					onUpdate: (self) => {
						projectSectionStore.setProgress(self.progress);
						syncCategorySectionViewportTop();
						if (self.isActive) {
							const maxIndex = Math.max(0, projectsLength - 1);
							countStore.inertiaIndex = maxIndex === 0 ? 0 : self.progress * maxIndex;
							scrollStore.scroll = typeof window !== 'undefined' ? window.scrollY : 0;
						}
					}
				})
			);
		}
		return () => {
			triggers.forEach((trigger) => trigger.kill(true));
			projectListHost.set(null);
			projectSectionStore.reset();
		};
	});
</script>

<svelte:head>
	<title>James Henry</title>
	<meta name="description" content="Portfolio" />
</svelte:head>

<section bind:this={introSection} class="bg-red-500">
	<h1>Hi</h1>
</section>
<section class="landing-section" bind:this={categorySection}>
	<div
		class="project-list-host"
		class:project-list-host--active={page.url.pathname === '/'}
		bind:this={projectListHostEl}
	></div>
	{#if countStore.isNewCat}
		<div
			class="md:w-[30vw] top-1/2 md:top-[20%] max-md:-translate-y-1/2 md:left-0 md:translate-x-1/3 pointer-events-none absolute"
			transition:scale={{ duration: 500, start: 0.5, easing: quintOut }}
		>
			<h2 class="text-white uppercase text-center font-mono text-3xl md:text-6xl m-0 2xl:top-1/4">
				{animationStore.currentCat[0]}
			</h2>
		</div>
	{/if}
</section>
<section class="bg-blue">
	<h3>Let's make your project happen</h3>
</section>

<style lang="scss" scoped>
	section {
		width: 100%;
		height: 100vh;
		overflow: hidden;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 6rem;
		position: relative;
	}

	.project-list-host {
		position: absolute;
		top: 0;
		right: 0;
		bottom: 0;
		left: 0;
		pointer-events: none;
	}

	.project-list-host--active {
		pointer-events: auto;
	}

	/* :global(body:not(.loaded)) .category-label {
		top: 50%;
	} */
</style>
