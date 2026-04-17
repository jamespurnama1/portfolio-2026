import { writable } from 'svelte/store';

export const projectListHost = writable<HTMLElement | null>(null);
