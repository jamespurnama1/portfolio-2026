type AudioProbe = HTMLVideoElement & {
	audioTracks?: { length: number };
	mozHasAudio?: boolean;
	webkitAudioDecodedByteCount?: number;
	captureStream?: () => MediaStream;
	mozCaptureStream?: () => MediaStream;
};

// No browser exposes this uniformly, so several signals are tried; call again once playback starts.
export function videoHasAudio(video: HTMLVideoElement): boolean {
	const v = video as AudioProbe;
	if (v.readyState < HTMLMediaElement.HAVE_METADATA) return false;
	if (v.audioTracks && v.audioTracks.length > 0) return true;
	if (v.mozHasAudio) return true;
	if ((v.webkitAudioDecodedByteCount ?? 0) > 0) return true;
	try {
		const stream = v.captureStream?.() ?? v.mozCaptureStream?.();
		if (stream && stream.getAudioTracks().length > 0) return true;
	} catch {
		// Cross-origin media can refuse capture.
	}
	return false;
}

// Re-checks on the events where audio info becomes available; returns a cleanup.
export function watchVideoAudio(video: HTMLVideoElement, onChange: (has: boolean) => void) {
	const check = () => onChange(videoHasAudio(video));
	const events = ['loadedmetadata', 'loadeddata', 'playing', 'timeupdate'] as const;
	let timeChecks = 0;
	const onTime = () => {
		if (++timeChecks <= 8) check();
	};
	for (const e of events) video.addEventListener(e, e === 'timeupdate' ? onTime : check);
	check();
	return () => {
		for (const e of events) video.removeEventListener(e, e === 'timeupdate' ? onTime : check);
	};
}
