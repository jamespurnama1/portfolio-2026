const FILE_THUMB = /^[a-f0-9]{40}(-\d+x\d+)?\.(png|jpe?g|webp|gif|avif)$/i;

// Small preview URL so Studio grids don't load full-size originals.
export function thumbnailUrl(url?: string, mimeType?: string) {
	if (!url || !mimeType?.startsWith('image/')) return undefined;
	if (url.includes('/images/')) return `${url}?w=240&h=240&fit=crop&auto=format`;
	// File assets ignore ?w=, so go through the site's resizing endpoint.
	const file = url.split('/').pop() ?? '';
	return FILE_THUMB.test(file) ? `/api/thumb?f=${file}&w=320` : url;
}
