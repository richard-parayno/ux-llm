/**
 * Prompt construction.
 *
 * Layout is designed for prompt caching (prefix match):
 *   system  — static instructions                       [cache breakpoint]
 *   user[0] — study context + earlier interviews         [cache breakpoint]
 *   user[1] — this interview's transcript                [cache breakpoint]
 *   user[2] — the task for this call (varies per call)
 * so a reflection, its repair round and any refine calls on the same
 * interview reuse the cached transcript instead of re-paying for it.
 */
import type {
	GuideItem,
	ReflectionConfig,
	ReflectionResult,
	ResearchItem,
	Segment,
	Study
} from '#lib/domain.js';
import { PROBE_TYPE_HELP, PROBE_TYPES } from '#lib/domain.js';
import type { VerifiedProbe } from '#lib/domain.js';

export interface PriorInterview {
	label: string;
	summary: string | null;
	coverage: ReflectionResult['coverage'] | null;
	/** Full transcript, included when it fits the context budget. */
	segments: Segment[] | null;
}

export interface StudyBrief {
	study: Study;
	priorInterviews: PriorInterview[];
	guide: GuideItem[];
}

export const REFLECT_SYSTEM = `You are intavue, a thoughtful research partner for UX researchers who run qualitative user interviews. After a session, you help the researcher reflect on it and prepare probing follow-up questions for their next session (a follow-up with the same participant or the next participant in the study).

The researcher stays in charge. Everything you produce is a suggestion they will judge, edit or discard, so be useful rather than exhaustive, and be honest about uncertainty.

## What makes a good probe
- **Grounded.** It follows up on something this participant actually said, citing their exact words — or, when the interview never reached a research question, it opens that gap. Never invent things the participant "said".
- **New.** Never re-ask a question the interviewer already asked in this transcript, even reworded. If a topic was already asked about, go one level deeper (a specific episode, the reason behind it, an exception, a contrast) instead of asking it again.
- **Open and singular.** One question, not yes/no, not double-barreled. Clarification probes may be short and pointed.
- **Non-leading.** Don't presuppose the hypotheses or put words in the participant's mouth. Hypotheses are things to test, not things to confirm.
- **Concrete.** Prefer asking about specific past experiences ("the last time…", "walk me through…") over opinions and hypotheticals.
- **Speakable.** Natural spoken language at the participant's register. Match the interview's language mix (if the interview code-switches, e.g. Taglish, probes may too) unless an output language is specified.
- **Culturally aware.** Use the participant's own terms for places, services and practices. If the researcher is from a different context than the participant, note anything they should adapt in adaptationNotes.

Probe types: ${PROBE_TYPES.map((t) => `${t} (${PROBE_TYPE_HELP[t]})`).join('; ')}.

## Evidence rules
- Transcript segments are numbered like [12]. Every quote you give must be copied character-for-character from the segment you cite (you may shorten with "…"). Keep quotes short (≤ 25 words).
- Probe anchors and hypothesis evidence must be participant words, not interviewer words.
- Quote only from the CURRENT interview transcript; earlier interviews are background context.
- If the transcript is short or thin, say so plainly in the summary, lean on "gap" probes for the research questions, and do not pad.

## Reflection beyond probes
Also help the researcher grow as an interviewer: point out missed opportunities (a door the participant opened that was not walked through) and give kind, specific feedback on a few of the interviewer's own questions (leading, closed, double-barreled, jargon, assumptive, too long) with a better phrasing.`;

export const LIVE_SYSTEM = `You are intavue's live co-pilot, glanced at by a UX researcher *while* they interview someone. Their attention belongs to the participant, so you must be calm, brief and rare.

- Suggest at most 2 nudges, and only when there is something genuinely worth probing in the last few exchanges, or an important research question has not come up yet and the moment allows it. Returning zero nudges is often the right answer.
- A nudge is a short, speakable, open question (≤ 25 words). Never repeat something the interviewer already asked. Prefer following up on the participant's most recent words.
- Anchor quotes must be copied exactly from the cited participant segment.
- Coverage status reflects only what has actually been discussed so far.
- Mark guide items as asked when the interviewer has asked them in any wording.`;

export const REFINE_SYSTEM = `You help a UX researcher rephrase one interview follow-up question. Keep its intent and anchor; change only what the instruction asks. Return a single open, speakable question.`;

// ---------------------------------------------------------------------------

function items(list: ResearchItem[], empty: string) {
	return list.length ? list.map((i) => `- ${i.id}: ${i.text}`).join('\n') : empty;
}

export function renderStudyBrief({ study, priorInterviews, guide }: StudyBrief): string {
	const c = study.context;
	const lines = [
		`# Study: ${study.title}`,
		``,
		`## Research goal`,
		study.goal || '(not specified)',
		``,
		`## Research questions`,
		items(study.researchQuestions, '(none given — infer the intent from the goal)'),
		``,
		`## Hypotheses / assumptions to test`,
		items(study.hypotheses, '(none given)'),
		``,
		`## Context`,
		`- Topic: ${c.topic || '(see goal)'}`,
		`- Participants: ${c.participantProfile || '(not specified)'}`,
		`- Interview language: ${c.interviewLanguage || 'English'}`,
		`- Planned session length: ${c.sessionMinutes} minutes`
	];
	if (c.outputLanguage) lines.push(`- Write probes in: ${c.outputLanguage}`);

	const active = guide.filter((g) => g.status !== 'archived');
	if (active.length) {
		lines.push(``, `## Current interview guide (questions already planned)`);
		for (const g of active)
			lines.push(`- [${g.id}] ${g.text}${g.status === 'asked' ? ' (asked)' : ''}`);
	}

	if (priorInterviews.length) {
		lines.push(``, `## Earlier interviews in this study (background only — do not quote)`);
		for (const p of priorInterviews) {
			lines.push(``, `### ${p.label}`);
			if (p.summary) lines.push(`Summary: ${p.summary}`);
			if (p.coverage?.length)
				lines.push(`Coverage: ${p.coverage.map((cv) => `${cv.rqId}=${cv.status}`).join(', ')}`);
			if (p.segments?.length) {
				lines.push('Transcript:');
				lines.push(p.segments.map((s) => `${roleTag(s)}: ${s.text}`).join('\n'));
			}
		}
	}
	return lines.join('\n');
}

function roleTag(s: Pick<Segment, 'role' | 'speaker'>) {
	const role = s.role === 'unknown' ? 'SPEAKER' : s.role.toUpperCase();
	return s.speaker && s.speaker.toLowerCase() !== s.role ? `${role} (${s.speaker})` : role;
}

export function renderTranscript(label: string, segments: Segment[], note = ''): string {
	const header = [`# Current interview: ${label}`];
	if (note) header.push(`Researcher's note about this participant: ${note}`);
	header.push(`Segments: ${segments.length}`, '');
	return header.join('\n') + segments.map((s) => `[${s.idx}] ${roleTag(s)}: ${s.text}`).join('\n');
}

export function renderReflectTask(
	cfg: ReflectionConfig,
	opts: { candidates: number; participantWords: number; ownFollowUps: string[] }
): string {
	const focus = {
		balanced:
			'Balance follow-ups on what was said with probes that open uncovered research questions.',
		depth:
			'Favour depth: follow up on what this participant said; only use gap probes where coverage is very thin.',
		coverage:
			'Favour coverage: prioritise research questions that are not yet addressed or only partially addressed.'
	}[cfg.focus];
	const lines = [
		`Reflect on the current interview and suggest probing follow-up questions for the next session.`,
		``,
		`- Return ${opts.candidates} probes, best first. The researcher asked for ${cfg.probeCount}; the extras are spares in case some fail verification.`,
		`- ${focus}`,
		`- Report coverage for every research question and a signal for every hypothesis.`,
		`- Give at most 5 questionCraft items and at most 5 missedOpportunities, most useful first.`
	];
	if (opts.participantWords < 150)
		lines.push(
			`- Note: the participant said very little in this transcript (~${opts.participantWords} content words). Be explicit about that and rely on gap probes rather than stretching thin material.`
		);
	if (opts.ownFollowUps.length) {
		lines.push(
			``,
			`The researcher already wrote these follow-ups themselves. Do not duplicate them; complement them:`,
			...opts.ownFollowUps.map((q) => `- ${q}`)
		);
	}
	if (cfg.note.trim()) lines.push(``, `Researcher's instruction for this run: ${cfg.note.trim()}`);
	return lines.join('\n');
}

export function renderRepairTask(
	accepted: VerifiedProbe[],
	rejected: { question: string; reason: string }[],
	needed: number
): string {
	return [
		`Some of your suggested probes failed automatic verification:`,
		...rejected.map((r) => `- "${r.question}" — rejected because ${r.reason}`),
		``,
		`These were accepted and should not be duplicated:`,
		...(accepted.length ? accepted.map((p) => `- ${p.question}`) : ['- (none)']),
		``,
		`Write ${needed} replacement probes that fix these problems. Follow all the original rules; copy quotes exactly from the cited participant segment.`
	].join('\n');
}

export function renderLiveTask(guideIds: string[], recentFrom: number): string {
	return [
		`The interview is in progress. Focus on segments from [${recentFrom}] onward for nudges.`,
		guideIds.length
			? `Guide item ids you may mark as asked: ${guideIds.join(', ')}.`
			: `There is no interview guide yet.`,
		`Return coverage for every research question, 0–2 nudges, and any guide items already asked.`
	].join('\n');
}

export function renderRefineTask(
	probe: Pick<VerifiedProbe, 'question' | 'rationale' | 'anchors'>,
	instruction: string
): string {
	return [
		`Question: ${probe.question}`,
		`Intent: ${probe.rationale}`,
		probe.anchors.length
			? `Follows up on: ${probe.anchors.map((a) => `"${a.quote}"`).join(' ')}`
			: '',
		``,
		`Instruction: ${instruction}`
	]
		.filter(Boolean)
		.join('\n');
}

/** Ready-made refinements the UI offers as one-click chips. */
export const REFINE_PRESETS = {
	simpler: 'Use simpler, plain wording that a non-native English speaker would understand easily.',
	less_leading: 'Make it less leading — remove any assumption about the answer.',
	concrete: 'Ask about one specific, recent past experience instead of general opinions.',
	shorter: 'Make it shorter and more conversational.',
	local_language:
		"Phrase it in the participant's own language mix as used in the interview (e.g. Taglish if they code-switched).",
	softer: 'Make it gentler and more empathetic; the topic may be sensitive for the participant.'
} as const;
export type RefinePreset = keyof typeof REFINE_PRESETS;
