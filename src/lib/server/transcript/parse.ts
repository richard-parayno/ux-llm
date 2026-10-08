/**
 * Turn whatever the researcher has into speaker-attributed segments.
 *
 * Supported inputs:
 *  - WebVTT exports from Zoom / Teams / Meet (incl. `<v Name>` voice tags)
 *  - SRT subtitles
 *  - Plain text with speaker labels: "I: …", "Interviewer (I): …",
 *    "Speaker 1: …", "[00:01:02] Maria: …"; wrapped continuation lines are
 *    joined to the previous turn (as in the 2022 study transcripts).
 *  - Unlabelled text (falls back to paragraphs with an unknown speaker).
 */
import type { Segment, SpeakerRole } from '#lib/domain.js';

export type ParsedSegment = Omit<Segment, 'idx'>;

export interface ParseResult {
	segments: ParsedSegment[];
	format: 'vtt' | 'srt' | 'labelled' | 'unlabelled';
	/** Header lines that looked like metadata ("Date Interviewed: …"). */
	header: string[];
	speakers: { speaker: string; role: SpeakerRole; turns: number; words: number }[];
}

const TIME_RANGE =
	/^\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}\s*-->\s*(\d{1,2}:)?\d{1,2}:\d{2}[.,]\d{1,3}/;

export function parseTranscript(input: string): ParseResult {
	const text = input.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
	let result: Omit<ParseResult, 'speakers'>;
	if (/^WEBVTT/.test(text.trimStart())) result = parseCues(text, 'vtt');
	else if (looksLikeSrt(text)) result = parseCues(text, 'srt');
	else result = parseLabelled(text);

	const segments = mergeConsecutive(result.segments);
	const roles = inferRoles(segments);
	for (const s of segments) s.role = roles.get(s.speaker) ?? 'unknown';
	return { ...result, segments, speakers: speakerStats(segments) };
}

function looksLikeSrt(text: string) {
	const lines = text.split('\n').slice(0, 6);
	return lines.some((l) => TIME_RANGE.test(l) && l.includes(','));
}

function toMs(stamp: string): number {
	const [hms, frac = '0'] = stamp.trim().split(/[.,]/);
	const parts = hms.split(':').map(Number);
	while (parts.length < 3) parts.unshift(0);
	const [h, m, s] = parts;
	return ((h * 60 + m) * 60 + s) * 1000 + Number(frac.padEnd(3, '0').slice(0, 3));
}

function parseCues(text: string, format: 'vtt' | 'srt'): Omit<ParseResult, 'speakers'> {
	const blocks = text.split(/\n{2,}/);
	const segments: ParsedSegment[] = [];
	for (const block of blocks) {
		const lines = block.split('\n').filter((l) => l.trim() !== '');
		const timeIdx = lines.findIndex((l) => TIME_RANGE.test(l));
		if (timeIdx === -1) continue;
		const [start, end] = lines[timeIdx].split('-->').map((s) => s.trim().split(/\s+/)[0]);
		let body = lines.slice(timeIdx + 1).join(' ');
		let speaker = '';
		const voice = body.match(/^<v(?:\.[^\s>]+)?\s+([^>]+)>/);
		if (voice) {
			speaker = voice[1].trim();
		}
		body = body.replace(/<[^>]+>/g, '').trim();
		if (!speaker) {
			const label = body.match(/^([^:]{1,40}):\s+(.*)$/);
			if (label && isPlausibleLabel(label[1])) {
				speaker = label[1].trim();
				body = label[2];
			}
		}
		if (!body) continue;
		segments.push({
			speaker: speaker || 'Speaker',
			role: 'unknown',
			text: body,
			startMs: toMs(start),
			endMs: toMs(end)
		});
	}
	return { segments, format, header: [] };
}

/** "Interviewer (I)", "Speaker 1", "P03", "Maria Santos" — not "Note to self, re the 3pm call". */
function isPlausibleLabel(label: string) {
	const l = label.trim();
	if (!l || l.length > 40) return false;
	if (/[.?!,;"]$/.test(l)) return false;
	const words = l
		.replace(/\([^)]*\)/g, '')
		.trim()
		.split(/\s+/);
	return words.length <= 4;
}

const LINE_LABEL =
	/^\s*(?:\[?(\d{1,2}:\d{2}(?::\d{2})?)\]?\s+)?([\p{L}][\p{L}\p{N} .'_-]{0,38}?)(?:\s*\(([^)]{1,12})\))?\s*:\s*(.*)$/u;

function parseLabelled(text: string): Omit<ParseResult, 'speakers'> {
	type Turn = { label: string; alias?: string; text: string; startMs: number | null };
	const turns: Turn[] = [];
	const loose: string[] = [];
	for (const raw of text.split('\n')) {
		const line = raw.trim();
		if (!line) continue;
		const m = line.match(LINE_LABEL);
		if (m && isPlausibleLabel(m[2]) && !/^https?$/i.test(m[2])) {
			turns.push({
				label: m[2].trim(),
				alias: m[3]?.trim(),
				text: m[4].trim(),
				startMs: m[1] ? toMs(m[1]) : null
			});
		} else if (turns.length > 0) {
			const last = turns[turns.length - 1];
			last.text = last.text ? `${last.text} ${line}` : line;
		} else {
			loose.push(line);
		}
	}

	// Speakers who take at least two turns are real; one-off labels before the
	// first real speaker are document metadata ("Date Interviewed: …").
	const aliasToLabel = new Map<string, string>();
	for (const t of turns) if (t.alias) aliasToLabel.set(t.alias.toLowerCase(), t.label);
	const canonical = (t: Turn) => aliasToLabel.get(t.label.toLowerCase()) ?? t.label;
	const counts = new Map<string, number>();
	for (const t of turns) counts.set(canonical(t), (counts.get(canonical(t)) ?? 0) + 1);

	const realSpeakers = [...counts.entries()].filter(([, n]) => n >= 2).map(([s]) => s);
	if (realSpeakers.length === 0) {
		const paragraphs = text
			.split(/\n{2,}/)
			.map((p) => p.replace(/\s*\n\s*/g, ' ').trim())
			.filter(Boolean);
		return {
			format: 'unlabelled',
			header: [],
			segments: paragraphs.map((p) => ({
				speaker: 'Speaker',
				role: 'unknown',
				text: p,
				startMs: null,
				endMs: null
			}))
		};
	}

	const header = [...loose];
	const segments: ParsedSegment[] = [];
	let started = false;
	for (const t of turns) {
		const speaker = canonical(t);
		const real = (counts.get(speaker) ?? 0) >= 2;
		if (!started && !real) {
			header.push(`${t.label}: ${t.text}`);
			continue;
		}
		started = true;
		if (!t.text) continue;
		segments.push({ speaker, role: 'unknown', text: t.text, startMs: t.startMs, endMs: null });
	}
	return { format: 'labelled', header, segments };
}

/** Join consecutive turns by the same speaker (common in VTT cue splitting). */
function mergeConsecutive(segs: ParsedSegment[]): ParsedSegment[] {
	const out: ParsedSegment[] = [];
	for (const s of segs) {
		const last = out[out.length - 1];
		if (last && last.speaker === s.speaker && s.speaker !== 'Speaker') {
			last.text = `${last.text} ${s.text}`;
			last.endMs = s.endMs ?? last.endMs;
		} else {
			out.push({ ...s });
		}
	}
	return out;
}

const INTERVIEWER_LABEL =
	/^(i|q|int|interviewer|moderator|facilitator|researcher|host|ux researcher)\b/i;
const PARTICIPANT_LABEL = /^(r|a|p\d*|resp|respondent|participant|interviewee|user|customer)\b/i;
const QUESTION_START =
	/^(so\s+)?(what|how|why|when|where|who|which|can|could|would|do|does|did|is|are|was|were|have|has|tell me|ano|paano|bakit|saan|kailan|sino)\b/i;

/**
 * Guess who is who. Explicit labels win; otherwise the speaker who asks the
 * most questions relative to how much they talk is the interviewer.
 */
export function inferRoles(segs: Pick<Segment, 'speaker' | 'text'>[]): Map<string, SpeakerRole> {
	const roles = new Map<string, SpeakerRole>();
	const stats = new Map<string, { turns: number; words: number; questions: number }>();
	for (const s of segs) {
		const st = stats.get(s.speaker) ?? { turns: 0, words: 0, questions: 0 };
		st.turns++;
		st.words += s.text.split(/\s+/).filter(Boolean).length;
		if (s.text.includes('?') || QUESTION_START.test(s.text.trim())) st.questions++;
		stats.set(s.speaker, st);
	}
	for (const speaker of stats.keys()) {
		if (INTERVIEWER_LABEL.test(speaker)) roles.set(speaker, 'interviewer');
		else if (PARTICIPANT_LABEL.test(speaker)) roles.set(speaker, 'participant');
	}
	const unresolved = [...stats.keys()].filter((s) => !roles.has(s));
	if (unresolved.length === 0) return roles;

	const hasInterviewer = [...roles.values()].includes('interviewer');
	const score = (s: string) => {
		const st = stats.get(s)!;
		// Question share minus a talkativeness penalty.
		return st.questions / st.turns - st.words / st.turns / 200;
	};
	// A lone, unlabelled speaker could be anyone — leave it to the researcher.
	if (stats.size === 1 && unresolved.length === 1) return roles;
	const ranked = [...unresolved].sort((a, b) => score(b) - score(a));
	if (!hasInterviewer && ranked.length > 0 && stats.get(ranked[0])!.questions >= 1) {
		roles.set(ranked.shift()!, 'interviewer');
	}
	for (const s of ranked) {
		const st = stats.get(s)!;
		// Speakers who barely talk in a multi-party call are probably observers.
		roles.set(s, st.turns <= 1 && stats.size > 2 ? 'observer' : 'participant');
	}
	return roles;
}

export function speakerStats(segs: ParsedSegment[] | Segment[]) {
	const map = new Map<
		string,
		{ speaker: string; role: SpeakerRole; turns: number; words: number }
	>();
	for (const s of segs) {
		const st = map.get(s.speaker) ?? { speaker: s.speaker, role: s.role, turns: 0, words: 0 };
		st.turns++;
		st.words += s.text.split(/\s+/).filter(Boolean).length;
		map.set(s.speaker, st);
	}
	return [...map.values()];
}
