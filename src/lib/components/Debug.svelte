<script lang="ts">
	import { optionsStore } from '$lib/stores/options.svelte';
	import { loadStore, notificationStore, scrollStore } from '$lib/stores/index.svelte';
	import {
		Pane,
		Button,
		Slider,
		Folder,
		Checkbox,
		Monitor,
		Separator,
		ThemeUtils,
		type Theme
	} from 'svelte-tweakpane-ui';
	import { theme } from '$lib/utils/theme';
	import { perfStore } from '$lib/stores/perf.svelte';

	const { pushMessage }: { pushMessage: (speaker: string, message: string) => void } = $props();

	let expanded = $state(false);
	let visible = $state(false);

	function onKeydown(e: KeyboardEvent) {
		if (e.key !== '`' && e.key !== '~') return;
		const target = e.target as HTMLElement | null;
		if (
			target?.isContentEditable ||
			target?.tagName === 'INPUT' ||
			target?.tagName === 'TEXTAREA'
		) {
			return;
		}
		visible = !visible;
	}
	const debugTheme: Theme = {
		...ThemeUtils.presets.jetblack
	};
</script>

<svelte:window onkeydown={onKeydown} />

{#if visible}
	<Pane title="Debugging" position="fixed" theme={debugTheme} bind:expanded>
		<Folder title="WebGL">
			<Slider label="Noise Factor" bind:value={optionsStore.noiseFactor} min={0.1} max={50} />
			<Slider label="Noise Scale" bind:value={optionsStore.noiseScale} min={0.002} max={0.01} />
			<Slider
				label="RGB Persist Factor"
				bind:value={optionsStore.rgbPersistFactor}
				min={0.01}
				max={0.99}
			/>
			<Slider
				label="Alpha Persist Factor"
				bind:value={optionsStore.alphaPersistFactor}
				min={0.01}
				max={0.99}
			/>
			<Button
				title="Toggle Sources"
				on:click={() => {
					const canvas = document.querySelector('.riveCanvas') as HTMLCanvasElement;
					optionsStore.showSources = !optionsStore.showSources;
					if (canvas) canvas.style.opacity = optionsStore.showSources ? '1' : '0';
				}}
			/>
		</Folder>
		<Folder title="Perf">
			<Checkbox label="Enable Timing" bind:value={perfStore.enabled} />
			{#if perfStore.enabled}
				<Monitor label="FPS" value={perfStore.fps} />
				<Monitor label="Frame Budget (ms)" value={perfStore.frameBudget} />
				<Monitor label="Draw Calls" value={perfStore.drawCalls} />
				<Monitor label="Triangles" value={perfStore.triangles} />
				<Separator />
				<Checkbox
					label="GPU Sync (adds gl.finish — halves FPS, reveals true GPU cost)"
					bind:value={perfStore.gpuSync}
				/>
				<Separator />
				{#each Object.entries(perfStore.phases) as [id, phase]}
					<Folder title={id}>
						<Monitor label="avg ms" value={phase.avgMs} />
						<Monitor label="max ms" value={phase.maxMs} />
						<Checkbox label="Isolate (skip)" bind:value={perfStore.isolate[id]} />
					</Folder>
				{/each}
				<Button title="Reset Maxes" on:click={() => perfStore.resetMaxes()} />
				<Button
					title="Copy Stats"
					on:click={() => {
						const lines = [
							`FPS: ${perfStore.fps}`,
							`Frame Budget: ${perfStore.frameBudget}ms`,
							`Draw Calls: ${perfStore.drawCalls}`,
							`Triangles: ${perfStore.triangles}`,
							`GPU Sync enabled: ${perfStore.gpuSync}`,
							...Object.entries(perfStore.phases).map(
								([id, p]) => `${id}: avg ${p.avgMs.toFixed(2)}ms, max ${p.maxMs.toFixed(2)}ms`
							)
						];
						navigator.clipboard.writeText(lines.join('\n'));
					}}
				/>
			{/if}
			<Separator />
			<Checkbox label="Disable Intro Scene" bind:value={optionsStore.disableIntroScene} />
			<Checkbox label="Disable Card Bend" bind:value={optionsStore.disableCardBend} />
		</Folder>
		<Slider
			label="Force Scroll"
			bind:value={scrollStore.offset}
			min={0}
			max={document.documentElement.scrollHeight * 2}
		/>
		<Button
			title="Force Load"
			on:click={() => {
				loadStore.load = 100;
			}}
		/>
		<Button
			title="Invert"
			on:click={() => {
				theme(!optionsStore.dark);
			}}
		/>
		<Button
			title="Test Notification"
			on:click={() => {
				notificationStore.opened = true;
			}}
		/>
		<Button
			title="Add Message"
			on:click={() => {
				pushMessage(
					'James Henry',
					'Lorem ipsum dolor sit amet, consectetur adipiscing elit. Quisque porttitor laoreet ligula, quis laoreet arcu lobortis nec. Curabitur ut volutpat ex. Vestibulum fermentum finibus viverra. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Class aptent taciti sociosqu ad litora torquent per conubia nostra, per inceptos himenaeos. Vestibulum ante ipsum primis in faucibus orci luctus et ultrices posuere cubilia curae; Nam sit amet lacus vestibulum, lobortis sem quis, feugiat elit. Morbi congue bibendum nisi, vel feugiat nulla varius ornare. Suspendisse potenti. Donec sagittis arcu neque, vel rutrum odio mattis vel. Etiam sagittis accumsan facilisis. Donec faucibus gravida leo, non dignissim nunc convallis non. Vivamus convallis egestas neque, non mattis nibh pretium in. Suspendisse consequat, massa eget luctus convallis, turpis mauris ullamcorper enim, at laoreet sapien lorem non velit. Aliquam aliquet venenatis neque, vitae tempus risus sollicitudin sed. In porta neque nisi, in elementum nisi molestie ut.'
				);
			}}
		/>
	</Pane>
{/if}

<style>
	:global(.tp-dfwv) {
		position: fixed !important;
		z-index: 999;
	}
	:global(.tp-dfwv *) {
		cursor: auto !important;
	}
</style>
