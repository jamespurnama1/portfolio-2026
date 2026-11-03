import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, parent }) => {
	const { projects } = await parent();
	if (!projects?.some((project) => project.slug.current === params.slug)) {
		error(404, 'Project not found');
	}
};
