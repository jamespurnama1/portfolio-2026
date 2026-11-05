import { loadAbout } from '#lib/utils/sanityClient.js';

export async function load() {
	return { about: await loadAbout() };
}
