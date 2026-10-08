/**
 * Browser-side live transcription: captures audio (microphone, or microphone
 * mixed with a meeting tab's audio for remote interviews) and streams it to
 * Deepgram over a WebSocket authenticated with a short-lived token minted by
 * our server. Emits finished utterances with a diarized speaker number.
 */

export interface Utterance {
	speaker: number;
	text: string;
	startMs: number;
	endMs: number;
}

export interface LiveCallbacks {
	onUtterance: (u: Utterance) => void;
	onInterim: (text: string) => void;
	onStatus: (status: 'connecting' | 'listening' | 'closed' | 'error', detail?: string) => void;
}

interface DGWord {
	word: string;
	punctuated_word?: string;
	start: number;
	end: number;
	speaker?: number;
}

interface DGResults {
	type: 'Results';
	is_final: boolean;
	speech_final: boolean;
	channel: { alternatives: { transcript: string; words: DGWord[] }[] };
}

export type CaptureMode = 'mic' | 'mic+tab';

export class LiveTranscriber {
	private ws: WebSocket | null = null;
	private recorder: MediaRecorder | null = null;
	private streams: MediaStream[] = [];
	private audioCtx: AudioContext | null = null;
	private keepAlive: ReturnType<typeof setInterval> | null = null;
	private pending: { speaker: number; words: DGWord[] } | null = null;

	constructor(private readonly cb: LiveCallbacks) {}

	async start(opts: { language: string; capture: CaptureMode }) {
		this.cb.onStatus('connecting');
		const res = await fetch('/api/stt/token', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ language: opts.language })
		});
		if (!res.ok)
			throw new Error(
				(await res.json().catch(() => null))?.message ?? 'Could not start transcription'
			);
		const { token, url } = (await res.json()) as { token: string; url: string };

		const stream = await this.capture(opts.capture);
		const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((t) =>
			MediaRecorder.isTypeSupported(t)
		);
		this.recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);

		// Browsers can't set Authorization headers on WebSockets; Deepgram accepts
		// a temporary token via the subprotocol instead.
		const ws = new WebSocket(url, ['bearer', token]);
		this.ws = ws;
		ws.onopen = () => {
			this.recorder!.ondataavailable = (e) => {
				if (e.data.size > 0 && ws.readyState === WebSocket.OPEN) ws.send(e.data);
			};
			this.recorder!.start(250);
			this.keepAlive = setInterval(() => {
				if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'KeepAlive' }));
			}, 5000);
			this.cb.onStatus('listening');
		};
		ws.onmessage = (ev) => this.handle(JSON.parse(String(ev.data)));
		ws.onerror = () => this.cb.onStatus('error', 'Connection to Deepgram failed.');
		ws.onclose = () => {
			this.flush();
			this.cb.onStatus('closed');
		};
	}

	private async capture(mode: CaptureMode): Promise<MediaStream> {
		const mic = await navigator.mediaDevices.getUserMedia({
			audio: { echoCancellation: true, noiseSuppression: true }
		});
		this.streams.push(mic);
		if (mode === 'mic') return mic;

		// Remote interview: mix the meeting tab's audio (the participant) with the mic (you).
		const display = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
		this.streams.push(display);
		if (display.getAudioTracks().length === 0)
			throw new Error('No tab audio was shared. Pick the meeting tab and tick "Share tab audio".');
		this.audioCtx = new AudioContext();
		const dest = this.audioCtx.createMediaStreamDestination();
		this.audioCtx.createMediaStreamSource(mic).connect(dest);
		this.audioCtx.createMediaStreamSource(new MediaStream(display.getAudioTracks())).connect(dest);
		return dest.stream;
	}

	private handle(msg: { type: string } & Partial<Omit<DGResults, 'type'>>) {
		if (msg.type === 'UtteranceEnd') return this.flush();
		if (msg.type !== 'Results' || !msg.channel) return;
		const alt = msg.channel.alternatives[0];
		if (!alt) return;
		if (!msg.is_final) {
			this.cb.onInterim(alt.transcript);
			return;
		}
		this.cb.onInterim('');
		for (const w of alt.words) {
			const speaker = w.speaker ?? 0;
			if (this.pending && this.pending.speaker !== speaker) this.flush();
			this.pending ??= { speaker, words: [] };
			this.pending.words.push(w);
		}
		if (msg.speech_final) this.flush();
	}

	private flush() {
		const p = this.pending;
		this.pending = null;
		if (!p || p.words.length === 0) return;
		this.cb.onUtterance({
			speaker: p.speaker,
			text: p.words.map((w) => w.punctuated_word ?? w.word).join(' '),
			startMs: Math.round(p.words[0].start * 1000),
			endMs: Math.round(p.words[p.words.length - 1].end * 1000)
		});
	}

	stop() {
		if (this.keepAlive) clearInterval(this.keepAlive);
		if (this.recorder && this.recorder.state !== 'inactive') this.recorder.stop();
		if (this.ws?.readyState === WebSocket.OPEN)
			this.ws.send(JSON.stringify({ type: 'CloseStream' }));
		for (const s of this.streams) for (const t of s.getTracks()) t.stop();
		void this.audioCtx?.close();
		this.streams = [];
	}
}
