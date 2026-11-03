import { defineField, defineType } from 'sanity';

export const postType = defineType({
	name: 'post',
	title: 'Post',
	type: 'document',
	fieldsets: [{ name: 'hero', title: 'Hero Media' }],
	fields: [
		defineField({
			name: 'title',
			type: 'string',
			title: 'Title'
		}),
		defineField({
			name: 'description',
			type: 'text',
			title: 'Description'
		}),
		defineField({ name: 'index', type: 'number' }),
		defineField({
			name: 'tools',
			type: 'array',
			title: 'Tools',
			of: [
				{
					name: 'toolItem',
					type: 'string',
					title: 'Tool',
					options: {
						list: [
							{ title: 'Blender', value: 'Blender' },
							{ title: 'Adobe Illustrator', value: 'Adobe Illustrator' },
							{ title: 'Adobe Photoshop', value: 'Adobe Photoshop' },
							{ title: 'Adobe After Effects', value: 'Adobe After Effects' },
							{ title: 'Adobe Premiere Pro', value: 'Adobe Premiere Pro' },
							{ title: 'Adobe Lightroom', value: 'Adobe Lightroom' },
							{ title: 'Adobe InDesign', value: 'Adobe InDesign' },
							{ title: 'Cinema4D', value: 'Cinema4D' },
							{ title: 'Figma', value: 'Figma' },
							{ title: 'Adobe XD', value: 'Adobe XD' },
							{ title: 'Davinci Resolve', value: 'Davinci Resolve' },
							{ title: 'Vue.js', value: 'Vue.js' },
							{ title: 'Nuxt', value: 'Nuxt' },
							{ title: 'Svelte', value: 'Svelte' },
							{ title: 'Three.js', value: 'Three.js' }
						]
					}
				}
			]
		}),
		defineField({
			name: 'type',
			type: 'string',
			title: 'Types',
			options: {
				list: [
					{ title: 'Freelance', value: 'Freelance' },
					{ title: 'Personal Project', value: 'Personal Project' },
					{ title: 'Full Time', value: 'Full Time' },
					{ title: 'Part Time', value: 'Part Time' },
					{ title: 'Initiative', value: 'Initiative' }
				]
			}
		}),
		defineField({
			name: 'role',
			type: 'array',
			title: 'Roles',
			of: [
				{
					name: 'roleItem',
					type: 'string',
					title: 'Role',
					options: {
						list: [
							{ title: 'Publication Designer', value: 'Publication Designer' },
							{ title: 'Motion Graphics Designer', value: 'Motion Graphics Designer' },
							{ title: 'Art Director', value: 'Art Director' },
							{ title: 'Digital Designer', value: 'Digital Designer' },
							{ title: 'UI/UX Designer', value: 'UI/UX Designer' },
							{ title: 'Brand Designer', value: 'Brand Designer' },
							{ title: 'Frontend Developer', value: 'Frontend Developer' },
							{ title: 'Photographer', value: 'Photographer' }
						]
					}
				}
			]
		}),
		defineField({
			name: 'link',
			type: 'url',
			title: 'Link'
		}),
		defineField({
			name: 'year',
			type: 'number',
			title: 'Year',
			validation: (rule) => rule.required().min(2000).max(new Date().getFullYear())
		}),
		defineField({
			name: 'slug',
			type: 'slug',
			title: 'Slug'
		}),
		defineField({
			name: 'color',
			type: 'color',
			title: 'Primary Color'
		}),
		defineField({
			name: 'color2',
			type: 'color',
			title: 'Secondary Color'
		}),
		defineField({
			name: 'theme',
			type: 'string',
			title: 'Theme',
			options: {
				list: [
					{ title: 'Light', value: 'light' },
					{ title: 'Dark', value: 'dark' }
				]
			}
		}),
		defineField({
			name: 'thumbnail',
			type: 'file',
			title: 'Thumbnail',
			fieldset: 'hero'
		}),
		defineField({
			name: 'thumbnailImage',
			type: 'image',
			title: 'Image Thumbnail',
			fieldset: 'hero'
		}),
		defineField({
			name: 'heroMedia',
			type: 'file',
			title: 'Hero Media',
			fieldset: 'hero',
			options: { accept: 'image/*,video/*' }
		}),
		defineField({
			name: 'awards',
			type: 'array',
			title: 'Awards',
			of: [
				{
					name: 'awardItem',
					type: 'object',
					title: 'Award Item',
					fields: [
						{ name: 'index', type: 'number', title: 'Index' },
						{ name: 'year', type: 'number', title: 'Year' },
						{ name: 'issuer', type: 'string', title: 'Issuer' },
						{ name: 'icon', type: 'image', title: 'Icon' },
						{ name: 'gold', type: 'array', title: 'Gold', of: [{ type: 'string' }] },
						{ name: 'silver', type: 'array', title: 'Silver', of: [{ type: 'string' }] },
						{ name: 'bronze', type: 'array', title: 'Bronze', of: [{ type: 'string' }] },
						{ name: 'crystal', type: 'array', title: 'Crystal', of: [{ type: 'string' }] }
					]
				}
			]
		}),
		defineField({
			name: 'carousel',
			type: 'array',
			title: 'Carousel',
			of: [
				{
					name: 'carouselItem',
					type: 'object',
					title: 'Carousel Item',
					fields: [
						{ name: 'video', type: 'file', title: 'Video' },
						{ name: 'image', type: 'image', title: 'Image' },
						{ name: 'alt', type: 'string', title: 'Alt' }
					]
				}
			]
		}),
		defineField({
			name: 'content',
			type: 'array',
			title: 'Content',
			of: [
				{
					name: 'sectionItem',
					type: 'object',
					title: 'Content Item',
					fields: [
						{ name: 'headline', type: 'string', title: 'Headline' },
						{ name: 'video', type: 'file', title: 'Video' },
						{ name: 'image', type: 'image', title: 'Image' },
						{ name: 'imageLight', type: 'image', title: 'Image Light Mode' },
						{ name: 'body', type: 'text', title: 'Body' },
						{ name: 'caption', type: 'string', title: 'Caption' },
						defineField({
							name: 'attachToTop',
							type: 'boolean',
							title: 'Attach to top content',
							initialValue: false,
							hidden: ({ document, parent }) => {
								const content = document?.content;
								return Array.isArray(content) && content[0]?._key === parent?._key;
							}
						})
					],
					preview: {
						select: {
							title: 'headline',
							media: 'image'
						}
					}
				}
			]
		})
		// defineField({
		//   name: 'content',
		//   type: 'markdown'
		// })
	],
	preview: {
		select: {
			title: 'title',
			media: 'thumbnailImage'
		}
	}
});
