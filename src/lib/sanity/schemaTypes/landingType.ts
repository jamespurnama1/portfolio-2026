import {defineField, defineType} from 'sanity'

export const landingType = defineType({
  name: 'landing',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
    }),
    defineField({
      name: 'index',
      type: 'number',
    }),
    defineField({
      name: 'items',
      type: 'array',
      of: [
        {
          type: 'reference',
          to: [{type: 'post'}],
        },
      ],
    }),
  ],
})
