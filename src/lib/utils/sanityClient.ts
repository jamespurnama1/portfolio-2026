import { createClient } from '@sanity/client';
import { SANITY_PROJECT_ID, SANITY_DATASET } from '$app/env/private';
import type { Data } from '#lib/types/index.js';
import { error } from '@sveltejs/kit';
import { dev } from '$app/env';
import { readFileSync } from 'fs';
import { join } from 'path';

const DEV_CACHE_PATH = join(process.cwd(), 'static/dev/cache.json');

/** Replace cdn.sanity.io URLs with local /dev/assets/<filename> paths */
function localizeUrls(obj: unknown): unknown {
	if (typeof obj === 'string') {
		if (obj.startsWith('https://cdn.sanity.io/')) {
			return '/dev/assets/' + obj.split('/').pop();
		}
		return obj;
	}
	if (Array.isArray(obj)) return obj.map(localizeUrls);
	if (obj !== null && typeof obj === 'object') {
		return Object.fromEntries(
			Object.entries(obj as Record<string, unknown>).map(([k, v]) => [k, localizeUrls(v)])
		);
	}
	return obj;
}

export const client = createClient({
	projectId: SANITY_PROJECT_ID,
	dataset: SANITY_DATASET,
	apiVersion: '2023-09-05', // choose the API version you want
	useCdn: process.env.NODE_ENV === 'production'
});

export async function sanityLoad() {
	if (dev) {
		try {
			const raw = JSON.parse(readFileSync(DEV_CACHE_PATH, 'utf-8'));
			return localizeUrls(raw) as Data;
		} catch {
			console.warn('[dev] Failed to read static/dev/cache.json — falling back to Sanity');
		}
	}

	const data: Data = await client.fetch(`{
  "gallery": *[_type == "gallery"][] {
      media[] {
      _key,
      alt,
      "url": asset->url,
      "id": asset->_id,
      "filename": asset->originalFilename,
      "size": asset->size
    }
  },
  "category": *[_type == "landing"],
  "post":  *[_type == "post"]{
  _id,
  _rev,
    _type,
  title,
  description,
  type,
  role,
  color,
  content[] {
      "image": image.asset->{
    _id,
    url,
    originalFilename,
    size,
    "lqip": metadata.lqip
  },
  "imageLight": imageLight.asset->{
    _id,
    url,
    originalFilename,
    size,
    "lqip": metadata.lqip
  },
  "video": video.asset->{
    _id,
    url,
    originalFilename,
    size
  },
    headline,
    body,
    caption
  },
  link,
  slug,
  year,
  tools,
  awards[] {
    "icon": {
      "asset": icon.asset->{
        _id,
        url,
        originalFilename,
        size
      }
    },
    gold,
    silver,
    bronze,
    crystal,
    issuer,
    index
  },
  "thumbnail": {
    "asset": thumbnail.asset->{
      _id,
      url,
      originalFilename,
      size
    }
  },
  "thumbnailImage": {
    "asset": thumbnailImage.asset->{
      _id,
      url,
      originalFilename,
      size
    }
  },
  _createdAt,
  _updatedAt
}
}`);
	if (data) return data;
	throw error(500, 'Internal Server Error');
	return {
		status: 500,
		body: new Error('Internal Server Error')
	};
}
