/** @type {import('./$types').PageServerLoad} */
import { sanityLoad } from '#lib/utils/sanityClient.js';
import type { Data, Landing, Post, SanityReference } from '#lib/types/index.js';
import { error } from '@sveltejs/kit';

export async function load() {
	const projects: Post[] = [];
	let categoriesLength: number[] = [];
	let projectsLength: number;
	const data = (await sanityLoad()) as Data;

	// categories
	const categories = data.category.sort((a, b) => a.index - b.index).map((x) => x.title as string);

	// catItems
	const catItems = data.category.sort((a, b) => a.index - b.index);

	// Projects: only posts referenced by landing documents, each used once
	const seenPostIds = new Set<string>();
	catItems.forEach((cat) => {
		const items: Post[] = [];
		(cat.items ?? []).forEach((ref) => {
			const refId = (ref as SanityReference<Post>)._ref;
			if (seenPostIds.has(refId)) return;
			const matchedPost = data.post.find((project) => (project as Post)._id === refId);
			if (!matchedPost) return;
			seenPostIds.add(refId);
			items.push(matchedPost as Post);
		});
		cat.items = items;
		projects.push(...items);
	});

	// categoriesLength
	catItems.forEach((cat) => {
		const consecutive = categoriesLength.length ? categoriesLength[categoriesLength.length - 1] : 0;
		categoriesLength.push(consecutive + cat.items!.length);
	});

	// projectsLength
	projectsLength = projects.length;

	// gallery
	const gallery = data.gallery || [];

	if (data) {
		return {
			projects,
			projectsLength,
			categories,
			catItems,
			categoriesLength,
			gallery
		};
	}
	return {
		status: 500,
		body: new Error('Internal Server Error')
	};
}
