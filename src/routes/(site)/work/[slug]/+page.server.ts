import { error } from '@sveltejs/kit';
import { client } from '#lib/utils/sanityClient.js';
import type { EntryGenerator, PageServerLoad } from './$types';

// Prerender every project linked from a landing category.
export const entries: EntryGenerator = async () => {
	const slugs: string[] = await client.fetch(
		`array::unique(*[_type == "landing"].items[]->slug.current)`
	);
	return slugs.filter(Boolean).map((slug) => ({ slug }));
};

export const load: PageServerLoad = async ({ params, parent }) => {
	const { projects } = await parent();
	if (!projects?.some((project) => project.slug.current === params.slug)) {
		error(404, 'Project not found');
	}
};
