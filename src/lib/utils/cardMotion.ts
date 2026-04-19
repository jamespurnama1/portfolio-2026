export type CardMotionState = {
	bendAmount: number;
	rotationAmount: number;
	textureZoom: number;
	textureRotation: number;
};

type CardMotionOptions = {
	motionProgress: number;
	normalizedX: number;
	enableRoll: boolean;
	bendMax?: number;
	rotationMax?: number;
	zoomMax?: number;
	textureRotationMax?: number;
	threshold?: number;
	easingPower?: number;
};

const DEFAULT_STATE: CardMotionState = {
	bendAmount: 0,
	rotationAmount: 0,
	textureZoom: 1,
	textureRotation: 0
};

function clamp(value: number, min: number, max: number) {
	return Math.min(max, Math.max(min, value));
}

export function createCardMotionState(): CardMotionState {
	return { ...DEFAULT_STATE };
}

export function indexOffsetToMotionProgress(indexOffset: number) {
	return clamp(Math.abs(indexOffset) * 2, 0, 1);
}

export function velocityToMotionProgress(velocity: number, normalizer = 2200) {
	return clamp(Math.abs(velocity) / Math.max(normalizer, 1), 0, 1);
}

export function stepCardMotion(
	state: CardMotionState,
	{
		motionProgress,
		normalizedX,
		enableRoll,
		bendMax = 50,
		rotationMax = 0.15,
		zoomMax = 0.25,
		textureRotationMax = 0.1,
		threshold = 0.1,
		easingPower = 3
	}: CardMotionOptions
): CardMotionState {
	const progress = clamp(motionProgress, 0, 1);
	const easedProgress = progress > threshold ? Math.pow(progress, easingPower) : 0;
	const targetBend = easedProgress * bendMax;
	const bendAmount = state.bendAmount + (targetBend - state.bendAmount) * 0.15;

	const rollSource = Math.abs(normalizedX) > 0.3 ? normalizedX : 0;
	const targetRotation = enableRoll ? rollSource * easedProgress * rotationMax : 0;
	const rotationAmount = state.rotationAmount + (targetRotation - state.rotationAmount) * 0.1;

	const targetTextureZoom = 1 + easedProgress * zoomMax;
	const textureZoom = state.textureZoom + (targetTextureZoom - state.textureZoom) * 0.03;

	const targetTextureRotation = rollSource * easedProgress * textureRotationMax;
	const textureRotation =
		state.textureRotation + (targetTextureRotation - state.textureRotation) * 0.03;

	return {
		bendAmount,
		rotationAmount,
		textureZoom,
		textureRotation
	};
}
