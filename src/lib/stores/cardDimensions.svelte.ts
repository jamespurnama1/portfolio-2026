import { writable } from 'svelte/store';

export interface CardDimension {
  width: number;
  height: number;
}

// Array of dimensions, indexed by card index
export const cardDimensionsStore = writable<CardDimension[]>([]);
