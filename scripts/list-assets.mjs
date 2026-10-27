import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const data = JSON.parse(readFileSync(join(__dirname, '../static/dev/cache.json'), 'utf8'));
const urls = new Set();

(data.gallery || []).forEach((g) =>
	(g.media || []).forEach((m) => {
		if (m.url) urls.add(m.url);
	})
);
(data.post || []).forEach((p) => {
	if (p.thumbnail?.asset?.url) urls.add(p.thumbnail.asset.url);
	if (p.thumbnailImage?.asset?.url) urls.add(p.thumbnailImage.asset.url);
	(p.awards || []).forEach((a) => {
		if (a.icon?.asset?.url) urls.add(a.icon.asset.url);
	});
	(p.content || []).forEach((c) => {
		if (c.image?.url) urls.add(c.image.url);
		if (c.imageLight?.url) urls.add(c.imageLight.url);
		if (c.video?.url) urls.add(c.video.url);
	});
});

console.error('Total URLs:', urls.size);
for (const u of urls) console.log(u);
