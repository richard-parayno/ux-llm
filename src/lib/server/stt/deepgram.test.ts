import { describe, expect, it } from 'vitest';
import { DeepgramTranscriber, liveListenParams, utterancesToSegments } from './deepgram';

const response = {
	metadata: { duration: 61.4 },
	results: {
		utterances: [
			{ start: 0.1, end: 1.9, speaker: 0, transcript: 'How do you get to work?', confidence: 0.9 },
			{ start: 2.2, end: 6.0, speaker: 1, transcript: 'Usually the bus.', confidence: 0.9 },
			{
				start: 6.1,
				end: 9.0,
				speaker: 1,
				transcript: 'Sometimes a jeepney when it rains.',
				confidence: 0.9
			},
			{ start: 9.5, end: 10.5, speaker: 0, transcript: 'Why the jeepney?', confidence: 0.9 }
		]
	}
};

describe('Deepgram', () => {
	it('turns diarized utterances into merged, role-tagged segments', () => {
		const segs = utterancesToSegments(response);
		expect(segs).toHaveLength(3);
		expect(segs[1]).toEqual({
			speaker: 'Speaker 2',
			role: 'participant',
			text: 'Usually the bus. Sometimes a jeepney when it rains.',
			startMs: 2200,
			endMs: 9000
		});
		expect(segs[0].role).toBe('interviewer');
	});

	it('sends audio with diarization and redaction params', async () => {
		let captured: { url: string; init: RequestInit } | null = null;
		const fake = (async (url: string, init: RequestInit) => {
			captured = { url, init };
			return new Response(JSON.stringify(response), { status: 200 });
		}) as unknown as typeof fetch;
		const dg = new DeepgramTranscriber({ apiKey: 'k', model: 'nova-3', fetch: fake });
		const out = await dg.transcribe(new Uint8Array([1, 2, 3]), 'audio/webm', {
			language: 'multi',
			redactPii: true
		});
		const url = new URL(captured!.url);
		expect(url.pathname).toBe('/v1/listen');
		expect(url.searchParams.get('diarize_model')).toBe('latest');
		expect(url.searchParams.get('language')).toBe('multi');
		expect(url.searchParams.getAll('redact')).toEqual(['pii', 'pci']);
		expect((captured!.init.headers as Record<string, string>).Authorization).toBe('Token k');
		expect(out.durationSec).toBe(61);
	});

	it('surfaces API errors', async () => {
		const fake = (async () => new Response('bad key', { status: 401 })) as unknown as typeof fetch;
		const dg = new DeepgramTranscriber({ apiKey: 'k', model: 'nova-3', fetch: fake });
		await expect(
			dg.transcribe(new Uint8Array([1]), 'audio/wav', { language: 'en' })
		).rejects.toThrow(/401/);
	});

	it('mints short-lived tokens for the browser', async () => {
		const fake = (async (_url: string, init: RequestInit) => {
			expect(JSON.parse(String(init.body))).toEqual({ ttl_seconds: 60 });
			return new Response(JSON.stringify({ access_token: 'jwt', expires_in: 60 }));
		}) as unknown as typeof fetch;
		const dg = new DeepgramTranscriber({ apiKey: 'k', model: 'nova-3', fetch: fake });
		expect(await dg.grantToken()).toEqual({ token: 'jwt', expiresIn: 60 });
	});

	it('builds live WebSocket params', () => {
		const p = new URLSearchParams(liveListenParams('nova-3', 'multi'));
		expect(p.get('interim_results')).toBe('true');
		expect(p.get('endpointing')).toBe('100');
		expect(p.get('utterance_end_ms')).toBe('1200');
	});
});
