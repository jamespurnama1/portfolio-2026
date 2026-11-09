import { createElement } from 'react';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { BatchGalleryInput } from '../BatchGalleryInput';
import { thumbnailUrl } from '../thumbnail';

const mediaFields = [
	defineField({
		name: 'alt',
		type: 'string',
		title: 'Text'
	}),
	defineField({
		name: 'project',
		type: 'reference',
		title: 'Project',
		to: [{ type: 'post' }],
		options: { filter: 'count(*[_type == "landing" && references(^._id)]) > 0' },
		description: 'Choose a project listed in a landing category.'
	})
];

const mediaPreview = {
	select: {
		title: 'alt',
		url: 'asset.url',
		mimeType: 'asset.mimeType',
		filename: 'asset.originalFilename'
	},
	prepare({
		title,
		url,
		mimeType,
		filename
	}: {
		title?: string;
		url?: string;
		mimeType?: string;
		filename?: string;
	}) {
		const style = { width: '100%', height: '100%', objectFit: 'cover' as const };
		const thumb = thumbnailUrl(url, mimeType);
		// Video elements are too heavy for a large draggable grid, so show a label instead.
		const media = thumb
			? createElement('img', { src: thumb, alt: '', style, loading: 'lazy', decoding: 'async' })
			: mimeType?.startsWith('video/')
				? createElement(
						'div',
						{ style: { ...style, display: 'grid', placeItems: 'center', fontSize: 12 } },
						'VIDEO'
					)
				: undefined;
		return { title: title || filename || 'Untitled', media };
	}
};

export const galleryType = defineType({
	name: 'gallery',
	type: 'document',
	fields: [
		defineField({
			name: 'title',
			type: 'string',
			title: 'Title'
		}),
		defineField({
			name: 'media',
			type: 'array',
			title: 'Media',
			options: { layout: 'grid' },
			components: { input: BatchGalleryInput },
			of: [
				// File assets (videos and uploads from the batch input)
				defineArrayMember({
					name: 'media',
					type: 'file',
					title: 'Media (file)',
					fields: mediaFields,
					preview: mediaPreview
				}),
				// Image assets already in the library (sanity.imageAsset)
				defineArrayMember({
					name: 'mediaImage',
					type: 'image',
					title: 'Media (image)',
					fields: mediaFields,
					preview: mediaPreview
				})
			]
		})
	]
});
