self.addEventListener(
	'message',
	async (event: MessageEvent<{ key: string; url: string; width: number; height: number }>) => {
		const { key, url, width, height } = event.data;
		try {
			const response = await fetch(url);
			if (!response.ok) throw new Error('Unable to load gallery ghost source');
			const bitmap = await createImageBitmap(await response.blob(), {
				resizeWidth: width,
				resizeHeight: height,
				resizeQuality: 'medium',
				imageOrientation: 'flipY'
			});
			self.postMessage({ key, bitmap }, { transfer: [bitmap] });
		} catch {
			self.postMessage({ key, error: true });
		}
	}
);
