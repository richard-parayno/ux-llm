import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (value: string | undefined) => (value ? value : undefined);

export const variables = defineEnvVars({
	DATABASE_URL: {
		description: 'libSQL/SQLite URL for app data, e.g. "file:data/intavue.db".',
		schema: (value) => value || 'file:data/intavue.db'
	},
	ANTHROPIC_API_KEY: {
		description: 'Claude API key. Leave empty to run in offline demo mode with the mock provider.',
		schema: optional
	},
	INTAVUE_LLM_PROVIDER: {
		description: '"claude", "mock", or empty to auto-detect from ANTHROPIC_API_KEY.',
		schema: (value) => {
			if (!value) return undefined;
			if (value !== 'claude' && value !== 'mock')
				throw new Error('INTAVUE_LLM_PROVIDER must be "claude" or "mock"');
			return value;
		}
	},
	INTAVUE_MODEL: {
		description: 'Claude model for post-interview reflection.',
		schema: (value) => value || 'claude-opus-5-5'
	},
	INTAVUE_LIVE_MODEL: {
		description:
			'Claude model for live nudges. Defaults to INTAVUE_MODEL at low effort; set to claude-haiku-5-5 for lower latency.',
		schema: optional
	},
	INTAVUE_EFFORT: {
		description: 'Effort for reflection runs: low | medium | high | xhigh | max.',
		schema: (value) => {
			const v = value || 'high';
			if (!['low', 'medium', 'high', 'xhigh', 'max'].includes(v))
				throw new Error('INTAVUE_EFFORT must be one of low|medium|high|xhigh|max');
			return v as 'low' | 'medium' | 'high' | 'xhigh' | 'max';
		}
	},
	DEEPGRAM_API_KEY: {
		description: 'Deepgram key for audio transcription and live mode. Empty = audio features off.',
		schema: optional
	},
	DEEPGRAM_MODEL: {
		description: 'Deepgram model for transcription.',
		schema: (value) => value || 'nova-3'
	}
});
