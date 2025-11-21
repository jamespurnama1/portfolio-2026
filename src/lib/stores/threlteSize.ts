import { writable } from 'svelte/store';
export const threlteSize = writable<{ width: number; height: number }>({ width: 0, height: 0 });
