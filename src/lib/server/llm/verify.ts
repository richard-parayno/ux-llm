/**
 * Deterministic post-checks on model output — the "verify" half of
 * generate → verify → repair.
 *
 * The 2024 study surfaced two reliability problems this addresses directly:
 *  1. Participants doubted whether outputs were grounded in the interview
 *     (P03, P12). → every quote is located in the transcript; probes whose
 *     quotes can't be found are rejected, and the UI shows which are verified.
 *  2. With short transcripts the model sometimes returned a question the
 *     interviewer had already asked (Limitations, §6). → probes are compared
 *     against every interviewer question and rejected if they repeat one.
 */
import type {
	Evidence,
	GroundingLevel,
	Probe,
	ProbeIssue,
	ReflectionOutput,
	ReflectionResult,
	Segment,
	VerifiedEvidence,
	VerifiedProbe
} from '#lib/domain.js';
import {
	contentTokens,
	countQuestions,
	extractQuestions,
	isClosedQuestion,
	normalize,
	questionSimilarity
} from './text';

export const REPEAT_THRESHOLD = 0.6;
export const DUPLICATE_THRESHOLD = 0.7;
const FUZZY_THRESHOLD = 0.85;

/** Issues that disqualify a probe (others are shown as warnings). */
export const BLOCKING_ISSUES: ProbeIssue[] = [
	'ungrounded',
	'repeats_asked_question',
	'duplicate_probe',
	'closed_question',
	'multiple_questions'
];

export interface LocatedQuote {
	seg: number;
	grounding: GroundingLevel;
}

/**
 * Find a quote in the transcript. Tries the cited segment first, then every
 * segment; accepts "…" elisions; falls back to a fuzzy token match so trivial
 * transcription/punctuation differences don't count as hallucinations.
 */
export function locateQuote(
	quote: string,
	segs: Pick<Segment, 'idx' | 'text' | 'role'>[],
	hint: number,
	allowedRoles?: Segment['role'][]
): LocatedQuote {
	const parts = quote
		.split(/\s*(?:\.\.\.|…)\s*/)
		.map(normalize)
		.filter((p) => p.length > 0);
	if (parts.length === 0) return { seg: hint, grounding: 'none' };

	const candidates = segs.filter((s) => !allowedRoles || allowedRoles.includes(s.role));
	const ordered = [
		...candidates.filter((s) => s.idx === hint),
		...candidates.filter((s) => s.idx !== hint)
	];
	for (const s of ordered) {
		const hay = normalize(s.text);
		if (parts.every((p) => hay.includes(p))) return { seg: s.idx, grounding: 'exact' };
	}

	const qTokens = parts.join(' ').split(' ');
	if (qTokens.length >= 4) {
		let best: LocatedQuote = { seg: hint, grounding: 'none' };
		let bestScore = 0;
		for (const s of ordered) {
			const hay = new Set(normalize(s.text).split(' '));
			const score = qTokens.filter((t) => hay.has(t)).length / qTokens.length;
			if (score > bestScore) {
				bestScore = score;
				best = { seg: s.idx, grounding: 'approximate' };
			}
		}
		if (bestScore >= FUZZY_THRESHOLD) return best;
	}
	return { seg: hint, grounding: 'none' };
}

function verifyEvidence(
	ev: Evidence[],
	segs: Segment[],
	roles?: Segment['role'][]
): VerifiedEvidence[] {
	return ev
		.map((e) => {
			const loc = locateQuote(e.quote, segs, e.seg, roles);
			return { seg: loc.seg, quote: e.quote, grounding: loc.grounding };
		})
		.filter((e) => e.grounding !== 'none');
}

export interface AskedQuestion {
	seg: number;
	text: string;
}

/** Every question the interviewer has already asked, plus anything else the researcher wants excluded. */
export function askedQuestions(segs: Segment[]): AskedQuestion[] {
	return segs
		.filter((s) => s.role === 'interviewer')
		.flatMap((s) => extractQuestions(s.text).map((text) => ({ seg: s.idx, text })));
}

export interface VerifyContext {
	segments: Segment[];
	/** Questions the probe must not repeat: interviewer questions + guide items + researcher's own ideas. */
	exclude: AskedQuestion[];
	knownTargets: Set<string>;
	idPrefix?: string;
}

export function verifyProbes(
	probes: Probe[],
	ctx: VerifyContext,
	opts: { repaired?: boolean; startIndex?: number; alreadyAccepted?: VerifiedProbe[] } = {}
): { accepted: VerifiedProbe[]; rejected: VerifiedProbe[] } {
	const accepted: VerifiedProbe[] = [];
	const rejected: VerifiedProbe[] = [];
	const prior = opts.alreadyAccepted ?? [];
	let n = opts.startIndex ?? 0;

	for (const p of probes) {
		const issues: ProbeIssue[] = [];
		const anchors = p.anchors.map((a) => {
			const loc = locateQuote(a.quote, ctx.segments, a.seg, ['participant', 'unknown']);
			return { seg: loc.seg, quote: a.quote, grounding: loc.grounding };
		});
		const grounded = anchors.filter((a) => a.grounding !== 'none');
		if (p.basis === 'transcript' && grounded.length === 0) issues.push('ungrounded');

		let similarityToAsked = 0;
		let mostSimilarAsked: string | null = null;
		for (const q of ctx.exclude) {
			const sim = questionSimilarity(p.question, q.text);
			if (sim > similarityToAsked) {
				similarityToAsked = sim;
				mostSimilarAsked = q.text;
			}
		}
		if (similarityToAsked >= REPEAT_THRESHOLD) issues.push('repeats_asked_question');

		for (const other of [...prior, ...accepted]) {
			if (questionSimilarity(p.question, other.question) >= DUPLICATE_THRESHOLD) {
				issues.push('duplicate_probe');
				break;
			}
		}
		if (isClosedQuestion(p.question) && p.probeType !== 'clarification')
			issues.push('closed_question');
		if (countQuestions(p.question) > 1) issues.push('multiple_questions');

		const targets = p.targets.filter((t) => ctx.knownTargets.has(t));
		if (targets.length !== p.targets.length) issues.push('unknown_target');

		const verified: VerifiedProbe = {
			...p,
			id: `${ctx.idPrefix ?? 'p'}${++n}`,
			targets,
			anchors: grounded,
			checks: {
				similarityToAsked: Math.round(similarityToAsked * 100) / 100,
				mostSimilarAsked,
				issues
			},
			repaired: opts.repaired ?? false
		};
		if (issues.some((i) => BLOCKING_ISSUES.includes(i))) rejected.push(verified);
		else accepted.push(verified);
	}
	return { accepted, rejected };
}

/** Verify everything except probes; drops evidence that can't be found. */
export function verifyAnalysis(
	out: ReflectionOutput,
	segments: Segment[]
): Omit<ReflectionResult, 'probes' | 'rejected'> {
	const participant: Segment['role'][] = ['participant', 'unknown'];
	return {
		summary: out.summary,
		coverage: out.coverage.map((c) => ({ ...c, evidence: verifyEvidence(c.evidence, segments) })),
		hypotheses: out.hypotheses.map((h) => ({
			...h,
			evidence: verifyEvidence(h.evidence, segments, participant)
		})),
		missedOpportunities: out.missedOpportunities.flatMap((m) => {
			const loc = locateQuote(m.quote, segments, m.seg, participant);
			return loc.grounding === 'none' ? [] : [{ ...m, seg: loc.seg }];
		}),
		questionCraft: out.questionCraft.flatMap((q) => {
			const loc = locateQuote(q.quote, segments, q.seg, ['interviewer']);
			return loc.grounding === 'none' ? [] : [{ ...q, seg: loc.seg }];
		}),
		emergentThemes: out.emergentThemes.map((t) => ({
			...t,
			evidence: verifyEvidence(t.evidence, segments)
		})),
		adaptationNotes: out.adaptationNotes
	};
}

/** Rank accepted probes and cut to the requested count (high priority, grounded first). */
export function selectProbes(probes: VerifiedProbe[], count: number): VerifiedProbe[] {
	const weight = { high: 0, medium: 1, low: 2 } as const;
	return [...probes]
		.map((p, i) => ({ p, i }))
		.sort((a, b) => weight[a.p.priority] - weight[b.p.priority] || a.i - b.i)
		.slice(0, count)
		.sort((a, b) => a.i - b.i)
		.map(({ p }) => p);
}

/** Human-readable reasons, fed back to the model in the repair round. */
export function describeIssues(p: VerifiedProbe): string {
	const reasons: Record<ProbeIssue, string> = {
		ungrounded: 'its anchor quotes do not appear verbatim in the transcript',
		repeats_asked_question: `it repeats a question the interviewer already asked ("${p.checks.mostSimilarAsked}")`,
		duplicate_probe: 'it duplicates another suggested probe',
		closed_question: 'it is a yes/no question',
		multiple_questions: 'it asks more than one question at once',
		unknown_target: 'it cites research-question ids that do not exist'
	};
	return p.checks.issues.map((i) => reasons[i]).join('; ');
}

/** Fraction of participant words in the transcript — used to warn about thin interviews. */
export function participantWordCount(segs: Segment[]): number {
	return segs
		.filter((s) => s.role === 'participant' || s.role === 'unknown')
		.reduce((n, s) => n + contentTokens(s.text).length, 0);
}
