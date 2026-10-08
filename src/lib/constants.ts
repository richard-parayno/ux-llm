/**
 * Runtime constants shared with the browser. Kept separate from `domain.ts`
 * so client bundles don't pull in Zod.
 */

export const SPEAKER_ROLES = ['interviewer', 'participant', 'observer', 'unknown'] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];

/**
 * Probe types, after Robinson (2023) "Probing in qualitative research
 * interviews" (ref [22] in the paper), extended with a few practical UX ones.
 */
export const PROBE_TYPES = [
	'elaboration',
	'clarification',
	'example',
	'process',
	'contrast',
	'meaning',
	'feeling',
	'counterfactual',
	'reflection'
] as const;
export type ProbeType = (typeof PROBE_TYPES)[number];

export const PROBE_TYPE_HELP: Record<ProbeType, string> = {
	elaboration: 'Invite them to say more about something they mentioned briefly.',
	clarification: 'Pin down an ambiguous term, reference or claim.',
	example: 'Ask for a concrete, specific past instance.',
	process: 'Walk through the steps or sequence of what they did.',
	contrast: 'Compare against another situation, time, tool or person.',
	meaning: 'Ask why it matters to them / what it means for them.',
	feeling: 'Surface emotion or experience around a moment.',
	counterfactual: 'Explore what would happen if something were different.',
	reflection: 'Mirror back what you heard and invite correction or depth.'
};
