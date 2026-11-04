import type { AiInvolvement } from '#lib/types/index.js';

const LABELS: Record<AiInvolvement, string> = {
	none: 'No AI Involvement',
	minimal: 'Minimal AI Involvement',
	assisted: 'AI Assisted',
	involved: 'AI Involved'
};

export const aiLabel = (value?: AiInvolvement | null) => LABELS[value ?? 'none'] ?? LABELS.none;
