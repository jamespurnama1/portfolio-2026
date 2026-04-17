import { browser } from '$app/environment';

const SAFARI_REGEX = /^((?!chrome|android).)*safari/i;

export const isSafariUserAgent = (ua: string) => SAFARI_REGEX.test(ua);

export const isSafari =
	browser && typeof navigator !== 'undefined' && isSafariUserAgent(navigator.userAgent);
