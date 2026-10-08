/**
 * Deepgram speech-to-text: pre-recorded uploads with diarization, plus
 * short-lived tokens so the browser can stream live audio straight to
 * Deepgram without ever seeing the API key.
 *
 * This replaces the manual "paste your transcript" step from 2023, when STT
 * quality on accented, code-switched speech wasn't good enough to rely on.
 */
import type { ParsedSegment } from '../transcript/parse';
import { inferRoles } from '../transcript/parse';

export const STT_LANGUAGES = [
	{ value: 'multi', label: 'Auto / code-switching (English, Spanish, Hindi, …)' },
	{ value: 'en', label: 'English' },
	{ value: 'tl', label: 'Tagalog / Filipino' },
	{ value: 'de', label: 'German' },
	{ value: 'es', label: 'Spanish' },
	{ value: 'fr', label: 'French' },
	{ value: 'pt', label: 'Portuguese' },
	{ value: 'it', label: 'Italian' },
	{ value: 'nl', label: 'Dutch' },
	{ value: 'pl', label: 'Polish' },
	{ value: 'cs', label: 'Czech' },
	{ value: 'hi', label: 'Hindi' },
	{ value: 'ja', label: 'Japanese' }
] as const;

export interface DeepgramOptions {
	apiKey: string;
	model: string;
	baseUrl?: string;
	fetch?: typeof fetch;
}

interface DeepgramUtterance {
	start: number;
	end: number;
	speaker?: number;
	transcript: string;
	confidence: number;
}

interface DeepgramResponse {
	metadata?: { duration?: number };
	results?: {
		utterances?: DeepgramUtterance[];
		channels?: { alternatives?: { transcript?: string }[]; detected_language?: string }[];
	};
}

export class SttError extends Error {}

export class DeepgramTranscriber {
	readonly name = 'deepgram';
	private readonly base: string;
	private readonly f: typeof fetch;

	constructor(private readonly opts: DeepgramOptions) {
		this.base = opts.baseUrl ?? 'https://api.deepgram.com';
		this.f = opts.fetch ?? fetch;
	}

	async transcribe(
		audio: Blob | Uint8Array,
		contentType: string,
		opts: { language: string; redactPii?: boolean }
	): Promise<{ segments: ParsedSegment[]; durationSec: number | null }> {
		const params = new URLSearchParams({
			model: this.opts.model,
			smart_format: 'true',
			punctuate: 'true',
			utterances: 'true',
			diarize_model: 'latest'
		});
		if (opts.language === 'auto') params.set('detect_language', 'true');
		else params.set('language', opts.language || 'multi');
		if (opts.redactPii) {
			params.append('redact', 'pii');
			params.append('redact', 'pci');
		}
		const res = await this.f(`${this.base}/v1/listen?${params}`, {
			method: 'POST',
			headers: {
				Authorization: `Token ${this.opts.apiKey}`,
				'Content-Type': contentType || 'audio/*'
			},
			body: audio as BodyInit
		});
		if (!res.ok) {
			const detail = await res.text().catch(() => '');
			throw new SttError(`Deepgram transcription failed (${res.status}): ${detail.slice(0, 300)}`);
		}
		const json = (await res.json()) as DeepgramResponse;
		return {
			segments: utterancesToSegments(json),
			durationSec: json.metadata?.duration ? Math.round(json.metadata.duration) : null
		};
	}

	/** Short-lived JWT for a browser WebSocket (`['bearer', token]` subprotocol). */
	async grantToken(ttlSeconds = 60): Promise<{ token: string; expiresIn: number }> {
		const res = await this.f(`${this.base}/v1/auth/grant`, {
			method: 'POST',
			headers: { Authorization: `Token ${this.opts.apiKey}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ ttl_seconds: ttlSeconds })
		});
		if (!res.ok) throw new SttError(`Deepgram token grant failed (${res.status})`);
		const json = (await res.json()) as { access_token: string; expires_in: number };
		return { token: json.access_token, expiresIn: json.expires_in };
	}
}

export function utterancesToSegments(json: DeepgramResponse): ParsedSegment[] {
	const utterances = json.results?.utterances ?? [];
	const segs: ParsedSegment[] = [];
	for (const u of utterances) {
		const text = u.transcript.trim();
		if (!text) continue;
		const speaker = `Speaker ${(u.speaker ?? 0) + 1}`;
		const last = segs[segs.length - 1];
		if (last && last.speaker === speaker) {
			last.text = `${last.text} ${text}`;
			last.endMs = Math.round(u.end * 1000);
		} else {
			segs.push({
				speaker,
				role: 'unknown',
				text,
				startMs: Math.round(u.start * 1000),
				endMs: Math.round(u.end * 1000)
			});
		}
	}
	if (segs.length === 0) {
		const text = json.results?.channels?.[0]?.alternatives?.[0]?.transcript?.trim();
		if (text) segs.push({ speaker: 'Speaker 1', role: 'unknown', text, startMs: 0, endMs: null });
	}
	const roles = inferRoles(segs);
	for (const s of segs) s.role = roles.get(s.speaker) ?? 'unknown';
	return segs;
}

/** Query string for the browser's live WebSocket; kept server-side so it's testable. */
export function liveListenParams(model: string, language: string): string {
	const p = new URLSearchParams({
		model,
		language: language || 'multi',
		interim_results: 'true',
		smart_format: 'true',
		punctuate: 'true',
		diarize_model: 'latest',
		endpointing: language === 'multi' ? '100' : '300',
		utterance_end_ms: '1200',
		vad_events: 'true'
	});
	return p.toString();
}
