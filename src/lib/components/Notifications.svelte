<script lang="ts">
	import NotificationsEl from './NotificationsEl.svelte';
	import { fly } from 'svelte/transition';
	import { cubicInOut } from 'svelte/easing';
	import { untrack } from 'svelte';
	import { gptStore, notificationStore } from '$lib/stores/index.svelte';
	import { sfx } from '$lib/utils/sfx';

	let wasNotifying = false;
	let lastMessage = '';
	$effect(() => {
		const opened = notificationStore.opened;
		const message = notificationStore.message;
		untrack(() => {
			// Also covers a new message replacing one that is already showing.
			if (opened && (!wasNotifying || message !== lastMessage)) sfx.notify();
			wasNotifying = opened;
			lastMessage = message;
		});
	});

	$effect(() => {
		notificationStore.opened;
		notificationStore.persistent;
		untrack(() => {
			if (!notificationStore.opened || notificationStore.persistent) return;
			setTimeout(() => {
				notificationStore.opened = false;
			}, 5000);
		});
	});

	// TODO: console easter egg
	// $effect(() => {
	// 	if (!window.console) return;
	// 	untrack(() => {
	// 		notificationStore.opened = true;
	// 		notificationStore.message = "Don't hack my website!";
	// 		notificationStore.sub = '';
	// 	});
	// });
</script>

{#if notificationStore.opened}
	<div
		onclick={() => {
			gptStore.opened = true;
			notificationStore.opened = false;
		}}
		onkeydown={() => {}}
		tabindex="0"
		role="button"
		transition:fly={{ y: 200, duration: 500, easing: cubicInOut }}
		class="notification fixed w-[75vw] md:w-[70vw] lg:w-[60vw] top-full -translate-y-14 hover:-translate-y-20 transition-transform md:left-1/2 max-md:w-[50vw] max-md:top-auto max-md:bottom-0 max-md:h-auto max-md:min-h-14 max-md:translate-y-0 max-md:hover:translate-y-0 max-md:right-0 max-md:left-auto max-md:translate-x-0 md:-translate-x-1/2 z-50 glow md:h-1/2 show flex justify-start duration-500"
	>
		<NotificationsEl message={notificationStore.message} sub={notificationStore.sub} />
	</div>
{/if}
