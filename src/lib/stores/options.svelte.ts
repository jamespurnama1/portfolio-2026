import { isMobileSafari } from '$lib/utils/device';

let noiseFactor = $state(0.1);
let noiseScale = $state(0.005);
// Disable the ping-pong ghost/persistence effect on Safari Mobile from the start,
// so the shader never gets a non-zero value even for the first frame.
let rgbPersistFactor = $state(isMobileSafari ? 0 : 0.7);
let alphaPersistFactor = $state(isMobileSafari ? 0 : 0.9);
let dark = $state(true);
let showSources = $state(false);
let fullscreen = $state(false);
let notification = $state(false);
let videoPaused = $state(false);
// Safari Mobile performance opt-outs — toggle in Debug pane.
// disableIntroScene is enabled for all (not just mobile) when desired.
let disableIntroScene = $state(false);
let disableCardBend = $state(isMobileSafari);

export const optionsStore = {
	get noiseFactor() {
		return noiseFactor;
	},
	set noiseFactor(newVal) {
		noiseFactor = newVal;
	},
	get noiseScale() {
		return noiseScale;
	},
	set noiseScale(newVal) {
		noiseScale = newVal;
	},
	get rgbPersistFactor() {
		return rgbPersistFactor;
	},
	set rgbPersistFactor(newVal) {
		rgbPersistFactor = newVal;
	},
	get alphaPersistFactor() {
		return alphaPersistFactor;
	},
	set alphaPersistFactor(newVal) {
		alphaPersistFactor = newVal;
	},
	get dark() {
		return dark;
	},
	set dark(newVal) {
		dark = newVal;
	},
	get showSources() {
		return showSources;
	},
	set showSources(newVal) {
		showSources = newVal;
	},
	get fullscreen() {
		return fullscreen;
	},
	set fullscreen(newVal) {
		fullscreen = newVal;
	},
	get notification() {
		return notification;
	},
	set notification(newVal) {
		notification = newVal;
	},
	get videoPaused() {
		return videoPaused;
	},
	set videoPaused(newVal) {
		videoPaused = newVal;
	},
	get disableIntroScene() {
		return disableIntroScene;
	},
	set disableIntroScene(newVal) {
		disableIntroScene = newVal;
	},
	get disableCardBend() {
		return disableCardBend;
	},
	set disableCardBend(newVal) {
		disableCardBend = newVal;
	}
};
