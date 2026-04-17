import { interactivity } from '@threlte/extras';
import type { Camera } from 'three';

type CameraSource = Camera | undefined | (() => Camera | undefined);

function resolveCamera(camera: CameraSource) {
	return typeof camera === 'function' ? camera() : camera;
}

export const pointerInteractivity = (camera: CameraSource) =>
	interactivity({
		compute: (event, state) => {
			const activeCamera = resolveCamera(camera);
			if (!activeCamera || typeof window === 'undefined') return;

			const target = state.target.current as Element | undefined;
			const rect = target?.getBoundingClientRect?.();
			const width = rect?.width || window.innerWidth;
			const height = rect?.height || window.innerHeight;
			const left = rect?.left || 0;
			const top = rect?.top || 0;

			state.pointer.update((p) => {
				p.x = ((event.clientX - left) / width) * 2 - 1;
				p.y = -((event.clientY - top) / height) * 2 + 1;
				return p;
			});
			state.raycaster.setFromCamera(state.pointer.current, activeCamera);
		}
	});
