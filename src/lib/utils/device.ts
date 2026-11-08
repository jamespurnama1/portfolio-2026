import { browser } from '$app/env';

const SAFARI_REGEX = /^((?!chrome|android).)*safari/i;

export const isSafariUserAgent = (ua: string) => SAFARI_REGEX.test(ua);

export const isSafari =
	browser && typeof navigator !== 'undefined' && isSafariUserAgent(navigator.userAgent);

/** True only on iOS Safari (iPhone/iPad/iPod) — excludes Safari on macOS and iPadOS desktop-mode. */
export const isMobileSafari =
	browser &&
	typeof navigator !== 'undefined' &&
	isSafariUserAgent(navigator.userAgent) &&
	/iphone|ipad|ipod/i.test(navigator.userAgent);

function detectLowPower() {
	if (!browser || typeof navigator === 'undefined') return false;
	// Lighthouse/PageSpeed and headless browsers render WebGL in software, which saturates the main thread.
	if (/Chrome-Lighthouse|HeadlessChrome|PTST/i.test(navigator.userAgent) || navigator.webdriver)
		return true;
	if (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2) return true;
	try {
		const canvas = document.createElement('canvas');
		const gl = canvas.getContext('webgl2') ?? canvas.getContext('webgl');
		const info = gl?.getExtension('WEBGL_debug_renderer_info');
		const renderer = info ? String(gl!.getParameter(info.UNMASKED_RENDERER_WEBGL)) : '';
		gl?.getExtension('WEBGL_lose_context')?.loseContext();
		return /swiftshader|llvmpipe|software|basic render/i.test(renderer);
	} catch {
		return false;
	}
}

/** True when the device has no real GPU or very few cores, so heavy WebGL effects should be reduced. */
export const isLowPower = detectLowPower();

/** True on any mobile/touch device (iOS, Android, Windows Phone, etc.). */
export const isMobile =
	browser &&
	typeof navigator !== 'undefined' &&
	/android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
