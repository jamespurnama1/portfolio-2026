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

/** True on any mobile/touch device (iOS, Android, Windows Phone, etc.). */
export const isMobile =
	browser &&
	typeof navigator !== 'undefined' &&
	/android|iphone|ipad|ipod|blackberry|windows phone/i.test(navigator.userAgent);
