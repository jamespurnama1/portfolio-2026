import { createElement } from 'react';
import { defineArrayMember, defineField, defineType } from 'sanity';
import { BatchGalleryInput } from '../BatchGalleryInput';

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
				defineArrayMember({
					name: 'media',
					type: 'file',
					title: 'Media',
					options: { accept: 'image/*,video/*' },
					fields: [
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
					],
					preview: {
						select: {
							title: 'alt',
							url: 'asset.url',
							mimeType: 'asset.mimeType',
							filename: 'asset.originalFilename'
						},
						prepare({ title, url, mimeType, filename }) {
							const style = { width: '100%', height: '100%', objectFit: 'cover' as const };
							const media =
								url && mimeType?.startsWith('image/')
									? createElement('img', { src: url, alt: '', style, loading: 'lazy' })
									: url && mimeType?.startsWith('video/')
										? createElement('video', {
												src: url,
												muted: true,
												playsInline: true,
												preload: 'metadata',
												style
											})
										: undefined;
							return { title: title || filename || 'Untitled', media };
						}
					}
				})
			]
		})
	]
});
