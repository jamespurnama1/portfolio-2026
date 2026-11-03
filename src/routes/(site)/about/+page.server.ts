import { client } from '#lib/utils/sanityClient.js';

export async function load() {
	const about = await client.fetch(`*[_type == "about"][0]{
		title,
		bio,
		"image": image.asset->{url},
		awards[]{
			index,
			year,
			issuer,
			"icon": {"asset": icon.asset->{url}},
			gold,
			silver,
			bronze,
			crystal
		},
		languages[]{_key, language, percentage},
		skills[]{_key, skill, type, percentage}
	}`);

	return { about };
}
