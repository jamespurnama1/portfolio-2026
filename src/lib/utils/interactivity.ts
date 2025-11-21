import { interactivity } from '@threlte/extras';
import type { Camera } from 'three';

export const pointerInteractivity = (camera: Camera) => interactivity({
	target: document.documentElement,
	compute: (event, state) => {
		state.pointer.update((p) => {
			p.x = (event.clientX / window.innerWidth) * 2 - 1;
			p.y = -(event.clientY / window.innerHeight) * 2 + 1;
			return p;
		});
		state.raycaster.setFromCamera(state.pointer.current, camera);
	}
});
