const KEY = 'soundEnabled';

let enabled = $state(true);

// Default is on; only an explicit toggle is stored.
if (typeof localStorage !== 'undefined') {
	try {
		enabled = localStorage.getItem(KEY) !== 'off';
	} catch {
		/* storage unavailable */
	}
}

export const soundPrefs = {
	get enabled() {
		return enabled;
	},
	set(value: boolean, persist = false) {
		enabled = value;
		if (!persist) return;
		try {
			localStorage.setItem(KEY, value ? 'on' : 'off');
		} catch {
			/* storage unavailable */
		}
	}
};
