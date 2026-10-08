import { describe, expect, it } from 'vitest';
import type Anthropic from '@anthropic-ai/sdk';
import { ClaudeProvider } from './claude';
import { ProviderError } from './provider';
import { SEGMENTS, study } from '../test/helpers';

type Params = Record<string, unknown> & {
	messages: { content: { text: string; cache_control?: unknown }[] }[];
};

function fakeClient(message: Record<string, unknown>) {
	const calls: Params[] = [];
	const client = {
		beta: {
			messages: {
				stream: (params: Params) => {
					calls.push(params);
					return { finalMessage: async () => message };
				}
			}
		}
	} as unknown as Anthropic;
	return { client, calls };
}

const req = {
	brief: { study: study(), priorInterviews: [], guide: [] },
	label: 'P01',
	participantNote: '',
	segments: SEGMENTS,
	config: {
		probeCount: 3,
		focus: 'balanced' as const,
		ownFollowUps: '',
		note: '',
		redactPii: false
	},
	candidates: 5,
	participantWords: 40,
	ownFollowUps: []
};

const usage = {
	input_tokens: 10,
	output_tokens: 20,
	cache_read_input_tokens: 5,
	cache_creation_input_tokens: 0
};

describe('ClaudeProvider', () => {
	it('sends a cache-friendly structured-output request with refusal fallbacks', async () => {
		const parsed = { summary: 'ok' };
		const { client, calls } = fakeClient({ stop_reason: 'end_turn', parsed_output: parsed, usage });
		const p = new ClaudeProvider({ model: 'claude-opus-5-5', effort: 'high', client });
		const out = await p.reflect(req);
		expect(out.output).toBe(parsed);
		expect(out.usage).toEqual({
			inputTokens: 10,
			outputTokens: 20,
			cacheReadTokens: 5,
			cacheWriteTokens: 0,
			calls: 1
		});

		const params = calls[0];
		expect(params.model).toBe('claude-opus-5-5');
		expect(params.fallbacks).toBe('default');
		expect(params.betas).toEqual(['server-side-fallback-2026-07-01']);
		expect(params.thinking).toEqual({ type: 'adaptive' });
		expect((params.output_config as { effort: string; format: unknown }).effort).toBe('high');
		expect((params.output_config as { format: { type: string } }).format.type).toBe('json_schema');
		const [brief, transcript, task] = params.messages[0].content;
		expect(brief.cache_control).toEqual({ type: 'ephemeral' });
		expect(transcript.cache_control).toEqual({ type: 'ephemeral' });
		expect(task.cache_control).toBeUndefined();
		expect(transcript.text).toContain('[1] PARTICIPANT (R): I took the bus');
		expect(task.text).toContain('Return 5 probes');
	});

	it('uses the live model at low effort for nudges', async () => {
		const { client, calls } = fakeClient({ stop_reason: 'end_turn', parsed_output: {}, usage });
		const p = new ClaudeProvider({
			model: 'claude-opus-5-5',
			liveModel: 'claude-haiku-5-5',
			effort: 'high',
			client
		});
		await p.liveAssist({ ...req, recentFrom: 2 });
		expect(calls[0].model).toBe('claude-haiku-5-5');
		expect((calls[0].output_config as { effort: string }).effort).toBe('low');
	});

	it('maps refusals and truncation to typed errors', async () => {
		const refusal = fakeClient({
			stop_reason: 'refusal',
			stop_details: { category: 'bio' },
			parsed_output: null,
			usage
		});
		await expect(
			new ClaudeProvider({ model: 'm', effort: 'low', client: refusal.client }).reflect(req)
		).rejects.toMatchObject({
			kind: 'refusal'
		});
		const cut = fakeClient({ stop_reason: 'max_tokens', parsed_output: null, usage });
		await expect(
			new ClaudeProvider({ model: 'm', effort: 'low', client: cut.client }).reflect(req)
		).rejects.toBeInstanceOf(ProviderError);
		const bad = fakeClient({ stop_reason: 'end_turn', parsed_output: null, usage });
		await expect(
			new ClaudeProvider({ model: 'm', effort: 'low', client: bad.client }).reflect(req)
		).rejects.toMatchObject({
			kind: 'invalid_output'
		});
	});
});
