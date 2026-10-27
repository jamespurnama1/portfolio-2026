// Tiny blurred copy of a Sanity image, shown while the full image loads.
export function blurPlaceholder(url?: string) {
	if (!url || !url.includes('cdn.sanity.io') || /\.(mp4|webm|mov)(\?|$)/i.test(url)) return '';
	return `${url.split('?')[0]}?w=32&q=30&blur=20&auto=format`;
}

export function placeholderStyle(url?: string, lqip?: string) {
	const src = lqip || blurPlaceholder(url);
	return src
		? `background-image:url(${src});background-size:cover;background-position:center;`
		: '';
}
