import {defineField, defineType} from 'sanity'

export const galleryType = defineType({
  name: 'gallery',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
      title: 'Title',
    }),
    defineField({
      name: 'media',
      type: 'array',
      title: 'Media',
      of: [
        {
          name: 'media',
          type: 'file',
          title: 'Media',
          fields: [
            {
              name: 'alt',
              type: 'string',
              title: 'Alternative text',
            },
          ],
        },
      ],
    }),
  ],
})
