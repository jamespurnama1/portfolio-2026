export function createGalleryVideoThumbnails(
	onReady: (url: string, thumbnail: string) => void,
	onError: (url: string) => void
) {
	const nodes = new WeakMap<Element, string>();
	const requested = new Set<string>();
	const queue: string[] = [];
	const cancelActive = new Set<() => void>();
	let observer: IntersectionObserver | undefined;
	let active = 0;
	let destroyed = false;

	function pump() {
		while (!destroyed && active < 2 && queue.length) {
			const url = queue.shift()!;
			active++;
			const video = document.createElement('video');
			video.crossOrigin = 'anonymous';
			video.muted = true;
			video.playsInline = true;
			video.preload = 'metadata';
			let finished = false;
			const finish = (thumbnail?: string) => {
				if (finished) return;
				finished = true;
				clearTimeout(timer);
				cancelActive.delete(cancel);
				video.removeAttribute('src');
				video.load();
				active--;
				if (!destroyed) {
					if (thumbnail) onReady(url, thumbnail);
					else onError(url);
					pump();
				}
			};
			const cancel = () => finish();
			const timer = setTimeout(cancel, 10000);
			cancelActive.add(cancel);
			video.addEventListener(
				'loadedmetadata',
				() => {
					// Frame 0 is often black, so grab a frame from inside the clip.
					const { duration } = video;
					if (Number.isFinite(duration) && duration > 0) {
						video.currentTime = Math.min(1, duration / 4);
					}
				},
				{ once: true }
			);
			video.addEventListener(
				'seeked',
				() => {
					try {
						const scale = Math.min(1, 512 / Math.max(video.videoWidth, video.videoHeight));
						const canvas = document.createElement('canvas');
						canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
						canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
						const context = canvas.getContext('2d');
						if (!context || !video.videoWidth || !video.videoHeight) return finish();
						context.drawImage(video, 0, 0, canvas.width, canvas.height);
						finish(canvas.toDataURL('image/jpeg', 0.75));
					} catch {
						finish();
					}
				},
				{ once: true }
			);
			video.addEventListener('error', cancel, { once: true });
			video.src = url;
			video.load();
		}
	}

	function request(url: string) {
		if (destroyed || requested.has(url)) return;
		requested.add(url);
		queue.push(url);
		pump();
	}

	return {
		observe(node: HTMLElement, url: string) {
			if (typeof IntersectionObserver === 'undefined') {
				request(url);
				return { update: request };
			}
			if (!observer) {
				observer = new IntersectionObserver(
					(entries) => {
						for (const entry of entries) {
							if (!entry.isIntersecting) continue;
							const targetUrl = nodes.get(entry.target);
							if (targetUrl) request(targetUrl);
							observer?.unobserve(entry.target);
						}
					},
					{ rootMargin: '200px' }
				);
			}
			nodes.set(node, url);
			observer.observe(node);
			return {
				update(nextUrl: string) {
					nodes.set(node, nextUrl);
					observer?.observe(node);
				},
				destroy: () => observer?.unobserve(node)
			};
		},
		destroy() {
			destroyed = true;
			observer?.disconnect();
			queue.length = 0;
			for (const cancel of cancelActive) cancel();
		}
	};
}
