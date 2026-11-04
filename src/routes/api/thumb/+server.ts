import { error } from '@sveltejs/kit';
import { readFile } from 'fs/promises';
import { join } from 'path';
import sharp from 'sharp';
import { SANITY_PROJECT_ID, SANITY_DATASET } from '$app/env/private';
import { dev } from '$app/env';

const FILE = /^[a-f0-9]{40}(-\d+x\d+)?\.(png|jpe?g|webp|gif|avif)$/i;
const WIDTHS = new Set([320, 480, 1600]);

// Sanity file assets ignore ?w=, so downscale here and let the CDN cache the result.
export async function GET({ url }) {
	const file = url.searchParams.get('f') ?? '';
	const width = Number(url.searchParams.get('w'));
	if (!FILE.test(file) || !WIDTHS.has(width)) error(400, 'Bad request');

	let input: Buffer;
	if (dev) {
		try {
			input = await readFile(join(process.cwd(), 'static/dev/assets', file));
		} catch {
			input = await fetchOriginal(file);
		}
	} else {
		input = await fetchOriginal(file);
	}

	const output = await sharp(input, { sequentialRead: true })
		.rotate()
		.resize({ width, withoutEnlargement: true })
		.webp({ quality: 75 })
		.toBuffer();

	return new Response(new Uint8Array(output), {
		headers: {
			'content-type': 'image/webp',
			'cache-control': 'public, max-age=31536000, s-maxage=31536000, immutable'
		}
	});
}

async function fetchOriginal(file: string) {
	const response = await fetch(
		`https://cdn.sanity.io/files/${SANITY_PROJECT_ID}/${SANITY_DATASET}/${file}`
	);
	if (!response.ok) error(404, 'Not found');
	return Buffer.from(await response.arrayBuffer());
}
