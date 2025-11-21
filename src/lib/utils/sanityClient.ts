import { createClient } from '@sanity/client';
import { SANITY_PROJECT_ID, SANITY_DATASET } from '$env/static/private';
import type { Data } from '$lib/types';
import { error } from '@sveltejs/kit';

export const client = createClient({
	projectId: SANITY_PROJECT_ID,
	dataset: SANITY_DATASET,
	apiVersion: '2023-09-05', // choose the API version you want
	useCdn: process.env.NODE_ENV === 'production'
});

export async function sanityLoad() {
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
    size
  },
  "imageLight": imageLight.asset->{
    _id,
    url,
    originalFilename,
    size
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
