import { defineConfig } from 'sanity';
import { structureTool } from 'sanity/structure';
import { visionTool } from '@sanity/vision';
import { colorInput } from '@sanity/color-input';
import { markdownSchema } from 'sanity-plugin-markdown';
import { schemaTypes } from './schemaTypes';

export default defineConfig({
	name: 'default',
	title: 'Portfolio',
	basePath: '/studio',
	projectId: 'rdnxsacz',
	dataset: 'production',
	plugins: [structureTool(), visionTool(), colorInput(), markdownSchema()],
	schema: { types: schemaTypes }
});
