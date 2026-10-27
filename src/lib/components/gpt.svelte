<script lang="ts">
	import { fly } from 'svelte/transition';
	import { quintOut } from 'svelte/easing';
	import {
		gptStore,
		introGateStore,
		loadStore,
		notificationStore,
		projectsStore
	} from '$lib/stores/index.svelte';
	import { optionsStore } from '$lib/stores/options.svelte';
	import { onMount, tick, untrack } from 'svelte';
	import { gsap } from 'gsap';
	import caret from '$lib/images/caret.svg';
	import x_img from '$lib/images/x.svg';
	import { error } from '@sveltejs/kit';
	import { goto } from '$app/navigation';
	import type { LayoutData } from '../../routes/$types';
	import { marked } from 'marked';
	import { sfx } from '$lib/utils/sfx';
	import { track } from '$lib/utils/analytics';

	let userMessageCount = 0;
	let highIntentSent = false;

	function markHighIntent(trigger: string) {
		if (highIntentSent) return;
		highIntentSent = true;
		track('high_intent_ai_conversation', { trigger, messages: userMessageCount });
	}

	const sampleQuestions = [
		'What do you do?',
		'Where are you based?',
		'Can I download your resume?',
		'Show me a project.',
		'I want to send you a message.',
		'Where did you study?',
		'Why do you do what you do?',
		'Where do you work?',
		'Tell me about yourself.',
		'What awards do you have?'
	];
	const {
		categoryAnim,
		data
	}: { data: LayoutData; categoryAnim: ((direction: 'up' | 'down') => void) | null } = $props();
	const CONVERSATION_STORAGE_KEY = 'gptConversationId';
	let fetching = $state(false);
	let scroller = $state() as HTMLSpanElement;
	let input = $state() as HTMLDivElement;
	let prompt = $state('');
	const logs = $state([]) as Array<{ speaker: string; message: string }>;
	let prevRandom = $state() as number;
	let conversationId = $state('');
	let historyLoadedFor = $state('');

	function getSample() {
		let random = Math.floor(Math.random() * 10);
		while (random === prevRandom) {
			// re-roll if same random as prev
			random = Math.floor(Math.random() * 10);
		}
		prevRandom = random;

		const text = sampleQuestions[random];
		return text.split('');
	}

	let placeholder = $state(getSample());

	function notification() {
		gptStore.opened = false;
		setTimeout(() => {
			notificationStore.message = logs[logs.length - 1].message;
			notificationStore.opened = true;
		}, 1000);
	}

	function changePlaceholder() {
		let length = {
			value: placeholder.length
		};

		gsap.to(length, {
			value: 0,
			duration: placeholder.length * 0.05,
			delay: 3,
			onUpdate: () => {
				placeholder.length = length.value;
			},
			onComplete: () => {
				const text: Array<string | (() => void)> = getSample();
				text.push(changePlaceholder);
				text.forEach((x, i) => {
					setTimeout(
						() => {
							if (typeof x === 'string') {
								placeholder.push(x);
							} else {
								x();
							}
						},
						100 * (i + 1)
					);
				});
			}
		});
	}

	function persistConversation(id: string) {
		// console.log('[Client] Persisting conversation ID:', id);
		conversationId = id;
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.setItem(CONVERSATION_STORAGE_KEY, id);
				// console.log(
				// 	'[Client] Stored in localStorage:',
				// 	localStorage.getItem(CONVERSATION_STORAGE_KEY)
				// );
			}
		} catch (err) {
			console.warn('Unable to persist conversation ID in localStorage', err);
		}
	}

	function clearConversation() {
		// console.log('[Client] Clearing conversation ID');
		conversationId = '';
		historyLoadedFor = '';
		try {
			if (typeof localStorage !== 'undefined') {
				localStorage.removeItem(CONVERSATION_STORAGE_KEY);
			}
		} catch (err) {
			console.warn('Unable to clear conversation ID in localStorage', err);
		}
	}

	function hydrateConversationId() {
		if (typeof window === 'undefined') return '';
		let stored = '';
		try {
			stored = localStorage.getItem(CONVERSATION_STORAGE_KEY) ?? '';
		} catch (err) {
			console.warn('Unable to read conversation ID from localStorage', err);
		}
		if (stored) {
			// console.log('[Client] Hydrated conversation ID from localStorage:', stored);
			conversationId = stored;
			return stored;
		}
		// console.log('[Client] No stored conversation ID found');
		return '';
	}

	async function loadConversationHistory(id: string) {
		if (!id || historyLoadedFor === id) return;
		try {
			const res = await fetch(`/api/chat?conversationId=${encodeURIComponent(id)}`);
			if (!res.ok) {
				const errorText = await res.text();
				console.warn('[Client] Failed to fetch conversation history:', res.status, errorText);
				return;
			}
			const payload = await res.json();
			const history = Array.isArray(payload?.messages) ? payload.messages : [];
			if (!history.length) {
				historyLoadedFor = id;
				return;
			}
			logs.length = 0;
			const orderedHistory = history.slice().reverse();
			for (const entry of orderedHistory) {
				if (entry?.speaker && entry?.message) {
					await pushMessage(entry.speaker, entry.message);
				}
			}
			historyLoadedFor = id;
		} catch (err) {
			console.error('[Client] Unable to load conversation history:', err);
		}
	}

	// TODO: args Type Safety
	function handleRun(funcName: string, args: any) {
		switch (funcName) {
			case 'download_resume':
				track('resume_download', { source: 'ai' });
				markHighIntent('resume_request');
				const link = document.createElement('a');
				link.download = 'Resume_James Henry.pdf';
				link.href = '/Resume_James Henry.pdf';
				// iOS Safari ignores `download` for PDFs, so keep the site open in this tab.
				link.target = '_blank';
				link.rel = 'noopener noreferrer';
				document.body.appendChild(link);
				link.click();
				document.body.removeChild(link);
				// window.open('/Resume_James Henry.pdf', '_blank');
				break;
			case 'go_to_about':
				goto('/about');
				notification();
				break;
			case 'random_project':
				const random = Math.floor(Math.random() * projectsStore.projectsLength) + 1;
				goto(`/work/${data.projects![random].slug.current}`);
				notification();
				break;
			case 'to_project':
				goto(`/work/${args.slug}`);
				notification();
				break;
			case 'send_a_message':
				markHighIntent('contact_request');
				// console.log('message', args.contact_info, args.user_message);
				break;
		}
	}

	export async function pushMessage(speaker: string, message: string, add?: boolean) {
		if (add) {
			logs[logs.length - 1].message += message;
		} else if (add === false) {
			logs[logs.length - 1].message = message;
		} else {
			logs.push({ speaker, message });
		}
		await tick();
		if (scroller) scroller.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
	}

	async function onkeydown(e?: KeyboardEvent) {
		if (prompt === '' || prompt.charCodeAt(0) === 10) return;
		if (!e || (e.key.toLowerCase() === 'enter' && !e.shiftKey)) {
			if (e) e?.preventDefault();
			if (categoryAnim) categoryAnim('up');
			sfx.send();
			userMessageCount += 1;
			if (userMessageCount === 1) track('ai_conversation_started');
			if (userMessageCount >= 3) markHighIntent('message_count');
			const x = prompt;
			pushMessage('You', x);
			pushMessage('James Henry', '...');
			fetching = true;
			prompt = '';
			try {
				const res = await fetch('/api/chat', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ input: x, conversationId })
				});

				if (!res.ok) {
					const errorText = await res.text();
					console.error('API Error:', res.status, errorText);
					throw new Error(
						`API returned ${res.status}: ${errorText || 'Unexpected error occurred'}`
					);
				}

				let isFunc = false;
				const data = res;
				if (!data.body) {
					console.error('No response body from API');
					throw new Error('No response from server');
				}
				const reader = data.body.getReader();
				pushMessage('James Henry', '', false);

				let func = '';
				let capturingFunc = false;
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;
					let textChunk = new TextDecoder().decode(value);
					const convRegex = /conv_run\s+(\S+)\s+end_conv/g;
					let match;
					while ((match = convRegex.exec(textChunk)) !== null) {
						const convId = match[1];
						// console.log('[Client] Received conversation signal:', convId);
						if (convId === 'clear') {
							clearConversation();
						} else if (convId) {
							persistConversation(convId);
						}
					}
					textChunk = textChunk.replace(convRegex, '');
					if (!textChunk) {
						continue;
					}
					if (textChunk.includes('func_run') || capturingFunc) {
						func += textChunk;
						capturingFunc = !textChunk.includes('end_run');
						isFunc = true;
						continue;
					}
					pushMessage('James Henry', textChunk, true);
				}
				if (func !== '') {
					const funcPattern = /func_run\s+(\w+)\s+({[\s\S]*?})\s+end_run/g;
					let match;
					while ((match = funcPattern.exec(func)) !== null) {
						const [, fnName, jsonChunk] = match;
						try {
							handleRun(fnName, JSON.parse(jsonChunk));
						} catch (err) {
							console.error('[Client] Failed to parse tool output:', err, jsonChunk);
						}
					}
					func = '';
					capturingFunc = false;
					isFunc = false;
				}
				// no-op: follow-up responses stream after tool runs will push new deltas
				fetching = false;
				input.focus();
			} catch (err) {
				if (err instanceof Error) {
					notificationStore.message = err.message;
					notificationStore.sub = (err as any)?.status || '';
				} else {
					notificationStore.message = 'Something went wrong. Please try again later.';
					notificationStore.sub = '';
				}
				pushMessage('James Henry', "Sorry! Something didn't work. Please try again later.", false);
				notificationStore.opened = true;
				console.error(err);
			}
		}
	}

	let inputIsOverflowing = $derived(
		prompt.length && input && input.scrollWidth > input.clientWidth
	);
	let inputScrolledRight = $state(false);
	let inputScrolledLeft = $state(false);

	function onInputScroll() {
		inputScrolledRight = Math.abs(input.scrollLeft + input.clientWidth - input.scrollWidth) <= 2;
		inputScrolledLeft = input.scrollLeft === 0;
	}

	let chatClientHeight = $state(0);
	let chatIsOverflowing = $derived(
		logs.length && scroller && scroller.scrollHeight > chatClientHeight
	);

	let chatScrolledBottom = $state(false);
	let chatScrolledTop = $state(false);

	function onChatScroll() {
		if (scroller.clientHeight === scroller.scrollHeight) {
			chatScrolledBottom = false;
			chatScrolledTop = false;
		} else {
			chatScrolledBottom =
				Math.abs(scroller.scrollTop + scroller.clientHeight - scroller.scrollHeight) < 1;
			chatScrolledTop = scroller.scrollTop === 0;
		}
	}

	$effect(() => {
		if (!gptStore.opened) return;
		untrack(() => {
			setTimeout(() => {
				input.focus();
				if (input.hasChildNodes()) {
					const selection = window.getSelection();
					const range = document.createRange();
					const lastChild = input.lastChild;
					if (!lastChild || !lastChild.textContent || !selection) return;
					// Set the range to the end of the last child node's content
					range.setStart(lastChild, lastChild.textContent.length);
					range.setEnd(lastChild, lastChild.textContent.length);

					selection.removeAllRanges();
					selection.addRange(range);
				}
			}, 500);
		});
	});

	$effect(() => {
		gptStore.opened;
		if (typeof document === 'undefined') return;
		if (!gptStore.opened) return;
		const html = document.documentElement;
		const body = document.body;
		const app = document.querySelector('.app') as HTMLDivElement | null;
		const lockScrollY = window.scrollY;

		html.style.overflow = 'hidden';
		body.style.overflow = 'hidden';
		body.style.touchAction = 'none';
		if (app) {
			app.style.overflow = 'hidden';
			app.style.touchAction = 'none';
		}

		// Cleared rather than restored: an earlier snapshot can be a stale lock from the intro.
		return () => {
			html.style.overflow = '';
			body.style.overflow = '';
			body.style.touchAction = '';
			if (app) {
				app.style.overflow = '';
				app.style.touchAction = '';
			}
			window.scrollTo(0, lockScrollY);
		};
	});

	let wasOpened = false;
	$effect(() => {
		const opened = gptStore.opened;
		untrack(() => {
			if (opened && !wasOpened) sfx.open();
			else if (!opened && wasOpened) sfx.close();
			wasOpened = opened;
		});
	});

	onMount(() => {
		const restoredId = hydrateConversationId();
		if (restoredId) {
			loadConversationHistory(restoredId);
		}
		changePlaceholder();
	});
</script>

<!-- {#key gptStore.opened} -->
<div
	role={gptStore.opened ? 'modal' : 'button'}
	onclick={() => {
		gptStore.opened = true;
	}}
	aria-modal="true"
	transition:fly={{ y: '46vh', duration: 500, easing: quintOut }}
	id="gpt"
	class:opacity-0={!loadStore.loaded ||
		introGateStore.phase !== 'done' ||
		(notificationStore.opened && !gptStore.opened)}
	class:pointer-events-none={introGateStore.phase !== 'done'}
	class="{gptStore.opened
		? '-translate-y-1/2! md:-translate-x-1/2! max-md:-translate-x-1/2! max-md:w-[90vw] max-md:left-1/2'
		: optionsStore.fullscreen
			? 'max-md:translate-x-0 md:-translate-x-1/2 translate-y-[150svh] max-md:w-[50vw] max-md:left-auto max-md:right-0 pointer-events-none'
			: 'max-md:translate-x-0 md:-translate-x-1/2 translate-y-[calc(50svh-3.5rem)] max-md:w-[50vw] max-md:left-auto max-md:right-0'} fixed min-h-24 max-md:min-h-0 top-1/2 flex flex-col p-3 pt-0 {gptStore.opened
		? ''
		: 'max-md:pb-0'} md:left-1/2 hover:translate-y-[calc(50svh-5rem)] focus-within:translate-y-[calc(50svh-5rem)] md:w-[70vw] lg:w-[60vw] duration-500 z-30 transition-[translate,transform,opacity] gpt-glow"
>
	<div class="flex flex-col w-full justify-center items-center">
		<div
			class="w-full p-5 max-md:text-xs flex justify-between items-center {gptStore.opened
				? ''
				: 'max-md:flex-row-reverse'}"
		>
			<p class="font-mono gpt-text">Ask me anything</p>
			<button
				class="relative z-30"
				onclick={(e) => {
					e.stopPropagation();
					gptStore.opened = false;
				}}
				><img
					src={gptStore.opened ? x_img : caret}
					alt={gptStore.opened ? 'Close Modal' : 'Open Modal'}
					class="w-4 h-auto pointer-events-none rotate-180 {optionsStore.dark
						? 'invert-0'
						: 'invert'}"
				/></button
			>
		</div>
		<span
			bind:this={scroller}
			bind:clientHeight={chatClientHeight}
			class:mask={chatIsOverflowing}
			class:mask-top={chatScrolledBottom}
			class:mask-bottom={chatScrolledTop}
			onscroll={onChatScroll}
			class="mask flex flex-col items-start max-h-[65vh] w-full overflow-y-scroll px-3 sm:px-6 md:px-12"
		>
			{#each logs as log}
				<p
					class="font-mono gpt-text font-bold max-md:text-sm {log.speaker === 'James Henry'
						? 'text-left'
						: 'text-right self-end'}"
				>
					{log.speaker}
				</p>
				<p
					class="font-mono gpt-text pb-5 max-md:text-xs {log.speaker === 'James Henry'
						? 'text-left'
						: 'text-right self-end'}"
				>
					{@html marked.parse(log.message)}
				</p>
			{/each}
		</span>
	</div>
	<div
		class="flex w-full relative items-center p-3 sm:p-5 gap-2 sm:gap-3 {gptStore.opened
			? ''
			: 'max-md:hidden'}"
	>
		<div
			class:invisible={prompt !== ''}
			class="absolute pointer-events-none grow text-xl sm:text-2xl md:text-3xl opacity-10 gpt-text"
		>
			{placeholder.toString().replaceAll(',', '')}
		</div>
		<div
			contenteditable="true"
			role="textbox"
			tabindex="0"
			bind:this={input}
			bind:innerText={prompt}
			class:gpt-mask={inputIsOverflowing}
			class:mask-left={inputScrolledRight}
			class:mask-right={inputScrolledLeft}
			onscroll={onInputScroll}
			class="gpt gpt-text overflow-x-scroll text-nowrap grow mx-auto text-xl sm:text-2xl md:text-3xl bg-transparent focus:outline-none active:outline-none placeholder:opacity-50 placeholder:transition-opacity {fetching
				? 'placeholder:opacity-10'
				: ''}"
			{onkeydown}
		></div>
		<button
			disabled={prompt === '' || prompt.charCodeAt(0) === 10}
			class="right-0 w-4 md:w-8 h-auto disabled:opacity-10 disabled:hover:scale-100 hover:scale-150 shrink-0 transition-[transform_opacity] duration-500"
			onclick={() => onkeydown()}
			><img
				src={caret}
				alt="Send Message Button"
				class="w-full h-auto -rotate-90 {optionsStore.dark ? 'invert-0' : 'invert'}"
			/></button
		>
	</div>
</div>
<div
	role="button"
	aria-expanded="true"
	aria-controls="gpt"
	tabindex="0"
	class="button fixed z-29 w-screen h-screen top-0 left-0"
	class:hidden={!gptStore.opened}
	onclick={(e) => {
		e.stopPropagation();
		gptStore.opened = false;
	}}
	onkeydown={(e) => {}}
></div>

<!-- {/key} -->

<style>
	@reference "tailwindcss";
	#gpt {
		background-color: #fff;
		color: #000;
		box-shadow:
			0 0 10px rgb(255, 255, 255, 0.3),
			-10px 0 40px rgb(255, 0, 255, 0.3),
			10px 0 40px rgb(0, 255, 255, 0.3);
	}

	#gpt :global(a) {
		@apply underline;
	}

	:global(html[data-theme='dark']) #gpt {
		background-color: #000;
		color: #fff;
	}

	.gpt-text,
	.gpt :global(p),
	.gpt :global(div[contenteditable='true']) {
		color: inherit;
	}

	.gpt-glow::after {
		content: '';
		position: absolute;
		z-index: -1;
		left: 0;
		top: 0;
		width: 100%;
		height: 100%;
		opacity: 0;
		transition: opacity 0.3s ease-in-out;
		animation: glowing 5s infinite;
	}

	.gpt-glow:hover::after {
		opacity: 1;
	}

	.gpt-mask {
		mask-image: linear-gradient(
			90deg,
			rgba(2, 0, 36, 0) 0%,
			rgba(0, 0, 0, 1) 15%,
			rgba(0, 0, 0, 1) 75%,
			rgba(0, 0, 0, 0) 100%
		);
	}

	.mask {
		mask-image: linear-gradient(
			0deg,
			rgba(2, 0, 36, 0) 0%,
			rgba(0, 0, 0, 1) 15%,
			rgba(0, 0, 0, 1) 75%,
			rgba(0, 0, 0, 0) 100%
		);
	}
	.mask-bottom {
		mask-image: linear-gradient(0deg, rgba(2, 0, 36, 0) 0%, rgba(0, 0, 0, 1) 15%);
	}
	.mask-top {
		mask-image: linear-gradient(0deg, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0) 100%);
	}
	.mask-left {
		mask-image: linear-gradient(90deg, rgba(2, 0, 36, 0) 0%, rgba(0, 0, 0, 1) 15%);
	}
	.mask-right {
		mask-image: linear-gradient(90deg, rgba(0, 0, 0, 1) 75%, rgba(0, 0, 0, 0) 100%);
	}
</style>
