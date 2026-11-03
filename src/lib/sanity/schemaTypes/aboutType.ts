import {defineField, defineType} from 'sanity'

export const aboutType = defineType({
  name: 'about',
  title: 'About',
  type: 'document',
  fields: [
    defineField({
      name: 'title',
      type: 'string',
    }),
    defineField({
      name: 'bio',
      type: 'text',
    }),
    defineField({
      name: 'image',
      type: 'image',
    }),
    defineField({
      name: 'awards',
      type: 'array',
      of: [
        {
          name: 'awardItem',
          type: 'object',
          fields: [
            {name: 'index', type: 'number'},
            {name: 'year', type: 'number'},
            {name: 'issuer', type: 'string'},
            {name: 'icon', type: 'image'},
            {name: 'gold', type: 'array', of: [{type: 'string'}]},
            {name: 'silver', type: 'array', of: [{type: 'string'}]},
            {name: 'bronze', type: 'array', of: [{type: 'string'}]},
            {name: 'crystal', type: 'array', of: [{type: 'string'}]},
          ],
        },
      ],
    }),
    defineField({
      name: 'languages',
      type: 'array',
      of: [
        {
          name: 'languageItem',
          type: 'object',
          fields: [
            {name: 'language', type: 'string'},
            {
              name: 'percentage',
              type: 'number',
              validation: (rule) => rule.min(0).max(100),
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'skills',
      type: 'array',
      of: [
        {
          name: 'skillItem',
          type: 'object',
          fields: [
            {name: 'skill', type: 'string'},
            {
              name: 'type',
              type: 'string',
              options: {
                list: [
                  {title: 'Graphics & Design', value: 'Graphics & Design'},
                  {title: 'Video & Motion', value: 'Video & Motion'},
                  {title: '3D', value: '3D'},
                  {title: 'UI/UX & Web', value: 'UI/UX & Web'},
                  {title: 'Theory', value: 'Theory'},
                ],
              },
            },
            {
              name: 'percentage',
              type: 'number',
              validation: (rule) => rule.min(0).max(100),
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'socials',
      type: 'array',
      of: [
        {
          name: 'socialsItem',
          type: 'object',
          fields: [
            {
              name: 'media',
              type: 'string',
              options: {
                list: [
                  {title: 'LinkedIn', value: 'linkedin'},
                  {title: 'Instagram', value: 'instagram'},
                  {title: 'Behance', value: 'behance'},
                  {title: 'GitHub', value: 'github'},
                  {title: 'e-mail', value: 'email'},
                ],
              },
            },
            {
              name: 'link',
              type: 'string',
            },
          ],
        },
      ],
    }),
    defineField({
      name: 'resume',
      type: 'file',
    }),
  ],
})
