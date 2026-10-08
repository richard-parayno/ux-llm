/**
 * Deterministic, offline stand-in for Claude.
 *
 * It exists so the app runs end to end with no API key (demo mode), so tests
 * are hermetic, and so the eval harness has a floor to compare against. It is
 * a heuristic, not an LLM: it picks salient participant turns, fills probe
 * templates with exact quotes, and scores coverage by keyword overlap.
 */
import type {
	CoverageStatus,
	Evidence,
	LiveAssistOutput,
	Probe,
	ProbeType,
	ReflectionOutput,
	RefineOutput,
	RepairOutput,
	ResearchItem,
	Segment
} from '#lib/domain.js';
import {
	emptyUsage,
	type LLMProvider,
	type LiveRequest,
	type ReflectRequest,
	type RefineRequest,
	type RepairRequest,
	type Result
} from './provider';
import {
	contentTokens,
	extractQuestions,
	isClosedQuestion,
	questionSimilarity,
	wordCount
} from './text';

export class MockProvider implements LLMProvider {
	readonly name = 'mock' as const;
	readonly model = 'intavue-mock-1';

	constructor(private readonly opts: { delayMs?: number } = {}) {}

	private async wrap<T>(output: T, signal?: AbortSignal): Promise<Result<T>> {
		if (this.opts.delayMs) await sleep(this.opts.delayMs, signal);
		return { output, usage: { ...emptyUsage(), calls: 1 } };
	}

	reflect(req: ReflectRequest, signal?: AbortSignal) {
		return this.wrap(mockReflection(req), signal);
	}

	repair(req: RepairRequest, signal?: AbortSignal) {
		const exclude = new Set([
			...req.accepted.map((p) => p.question),
			...req.rejected.map((r) => r.question)
		]);
		const pool = mockReflection({ ...req, candidates: req.candidates + req.needed + 6 }).probes;
		const probes = pool.filter((p) => !exclude.has(p.question)).slice(0, req.needed);
		return this.wrap<RepairOutput>({ probes }, signal);
	}

	liveAssist(req: LiveRequest, signal?: AbortSignal) {
		return this.wrap(mockLive(req), signal);
	}

	refine(req: RefineRequest, signal?: AbortSignal) {
		return this.wrap(mockRefine(req.probe.question, req.instruction), signal);
	}
}

function sleep(ms: number, signal?: AbortSignal) {
	return new Promise<void>((resolve, reject) => {
		const t = setTimeout(resolve, ms);
		signal?.addEventListener('abort', () => {
			clearTimeout(t);
			reject(signal.reason);
		});
	});
}

// ---------------------------------------------------------------------------

const participantSegs = (segs: Segment[]) =>
	segs.filter((s) => s.role === 'participant' || s.role === 'unknown');

/** First sentence of a segment, cut to ≤ maxWords, as an exact substring. */
export function excerpt(text: string, maxWords = 14): string {
	const sentence = text.split(/(?<=[.!?])\s+/).find((s) => wordCount(s) >= 4) ?? text;
	const words = [...sentence.matchAll(/\S+/g)];
	if (words.length <= maxWords) return sentence.trim();
	const last = words[maxWords - 1];
	return sentence.slice(0, last.index! + last[0].length).replace(/[,;:–-]+$/, '');
}

function salientTerm(seg: Segment, all: Segment[]): string {
	const freq = new Map<string, number>();
	for (const s of all)
		for (const t of new Set(contentTokens(s.text))) freq.set(t, (freq.get(t) ?? 0) + 1);
	const local = contentTokens(seg.text).filter((t) => t.length >= 4);
	if (local.length === 0) return 'that';
	// Prefer words frequent in this turn but rare across the interview.
	const scored = [...new Set(local)].map((t) => ({
		t,
		s: local.filter((x) => x === t).length / (freq.get(t) ?? 1)
	}));
	scored.sort((a, b) => b.s - a.s || a.t.localeCompare(b.t));
	return scored[0].t;
}

const TEMPLATES: { type: ProbeType; make: (term: string, quote: string) => string }[] = [
	{
		type: 'example',
		make: (t) => `Walk me through the most recent time ${t} came up — what happened, step by step?`
	},
	{
		type: 'meaning',
		make: (t) => `Why does ${t} matter so much to you when you decide what to do?`
	},
	{
		type: 'elaboration',
		make: (_t, q) => `You said "${q}" — what does that look like on a typical day?`
	},
	{
		type: 'contrast',
		make: (t) => `How is ${t} different on a day when things don't go as planned?`
	},
	{ type: 'feeling', make: (t) => `What goes through your mind when you have to deal with ${t}?` },
	{
		type: 'process',
		make: (t) =>
			`How do you figure out what to do about ${t} — where does that information come from?`
	},
	{ type: 'clarification', make: (_t, q) => `When you say "${q}", what exactly do you mean?` },
	{
		type: 'counterfactual',
		make: (t) => `If ${t} were suddenly not an option, what would you do instead?`
	}
];

function overlapEvidence(item: ResearchItem, segs: Segment[], minShared = 2): Evidence[] {
	const target = new Set(contentTokens(item.text).filter((t) => t.length >= 4));
	return participantSegs(segs)
		.map((s) => ({ s, shared: new Set(contentTokens(s.text).filter((t) => target.has(t))).size }))
		.filter(({ shared }) => shared >= minShared)
		.sort((a, b) => b.shared - a.shared || a.s.idx - b.s.idx)
		.slice(0, 3)
		.map(({ s }) => ({ seg: s.idx, quote: excerpt(s.text, 12) }));
}

function coverageFor(rqs: ResearchItem[], segs: Segment[]) {
	return rqs.map((rq) => {
		const evidence = overlapEvidence(rq, segs, 1);
		const strong = overlapEvidence(rq, segs, 2);
		const status: CoverageStatus =
			strong.length >= 2 ? 'addressed' : evidence.length >= 1 ? 'partial' : 'not_addressed';
		return { rqId: rq.id, status, evidence: strong.length ? strong : evidence };
	});
}

export function mockReflection(req: ReflectRequest): ReflectionOutput {
	const { segments, brief } = req;
	const study = brief.study;
	const parts = participantSegs(segments).filter((s) => wordCount(s.text) >= 12);
	const ranked = [...parts].sort((a, b) => wordCount(b.text) - wordCount(a.text) || a.idx - b.idx);
	const coverage = coverageFor(study.researchQuestions, segments);
	const asked = segments
		.filter((s) => s.role === 'interviewer')
		.flatMap((s) => extractQuestions(s.text));

	const probes: Probe[] = [];
	const gaps = coverage.filter((c) => c.status !== 'addressed');
	const wantGaps = req.config.focus === 'coverage' ? gaps.length : Math.min(gaps.length, 2);
	for (const g of gaps.slice(0, wantGaps)) {
		const rq = study.researchQuestions.find((r) => r.id === g.rqId)!;
		const topic = secondPerson(
			rq.text
				.replace(/^\s*\d+[.)]\s*/, '')
				.replace(/\?.*$/s, '')
				.trim()
		);
		probes.push({
			question: `We haven't talked about this yet: ${lowerFirst(topic)} — what has your own experience been?`,
			probeType: 'elaboration',
			targets: [rq.id],
			basis: 'gap',
			anchors: [],
			rationale: `${rq.id} is ${g.status === 'partial' ? 'only partly' : 'not yet'} covered in this interview.`,
			whenToAsk: 'Once the participant has finished their current story.',
			priority: g.status === 'not_addressed' ? 'high' : 'medium'
		});
	}

	let t = 0;
	for (const seg of ranked) {
		if (probes.length >= req.candidates) break;
		const term = salientTerm(seg, segments);
		const quote = excerpt(seg.text, 10);
		const tpl = TEMPLATES[t++ % TEMPLATES.length];
		const question = tpl.make(term, quote);
		if (asked.some((a) => questionSimilarity(a, question) >= 0.55)) continue;
		const targets = study.researchQuestions
			.filter((rq) => contentTokens(rq.text).some((w) => contentTokens(seg.text).includes(w)))
			.map((rq) => rq.id)
			.slice(0, 2);
		probes.push({
			question,
			probeType: tpl.type,
			targets,
			basis: 'transcript',
			anchors: [{ seg: seg.idx, quote }],
			rationale: `The participant raised "${term}" but it was not explored further; this invites a concrete account.`,
			whenToAsk: `When ${term} comes up again.`,
			priority: probes.length < 3 ? 'high' : 'medium'
		});
	}

	// Thin transcript: fall back on the remaining gaps, then on hypotheses to test.
	for (const g of gaps.slice(wantGaps)) {
		if (probes.length >= req.candidates) break;
		const rq = study.researchQuestions.find((r) => r.id === g.rqId)!;
		probes.push({
			question: `Tell me about a recent time when ${lowerFirst(
				secondPerson(
					rq.text
						.replace(/^\s*\d+[.)]\s*/, '')
						.replace(/\?.*$/s, '')
						.trim()
						.replace(/^(how|what|why|do|does|did)\s+/i, '')
				)
			)}.`,
			probeType: 'example',
			targets: [rq.id],
			basis: 'gap',
			anchors: [],
			rationale: `${rq.id} still needs concrete examples.`,
			whenToAsk: 'Early in the next session.',
			priority: 'medium'
		});
	}
	for (const h of study.hypotheses) {
		if (probes.length >= req.candidates) break;
		const claim = h.text.replace(/[.;].*$/s, '').trim();
		probes.push({
			question: `Some people told us "${lowerFirst(claim)}". How does that compare with your own experience?`,
			probeType: 'contrast',
			targets: [h.id],
			basis: 'gap',
			anchors: [],
			rationale: `Tests ${h.id} without assuming it is true.`,
			whenToAsk: 'Once rapport is established.',
			priority: 'low'
		});
	}

	const hypotheses = study.hypotheses.map((h) => {
		const evidence = overlapEvidence(h, segments);
		return {
			hId: h.id,
			signal: evidence.length ? ('mixed' as const) : ('no_evidence' as const),
			evidence,
			note: evidence.length
				? 'Related talk found — read the quotes to judge whether it supports or challenges this.'
				: 'Nothing in this interview speaks to this yet.'
		};
	});

	const missedOpportunities = [];
	for (let i = 0; i < segments.length - 1 && missedOpportunities.length < 3; i++) {
		const s = segments[i];
		const next = segments[i + 1];
		if (s.role !== 'participant' || next.role !== 'interviewer' || wordCount(s.text) < 30) continue;
		const a = new Set(contentTokens(s.text));
		const shared = contentTokens(next.text).filter((w) => a.has(w)).length;
		if (shared > 1) continue;
		const term = salientTerm(s, segments);
		missedOpportunities.push({
			seg: s.idx,
			quote: excerpt(s.text, 12),
			whatWasMissed: `The interview moved on before exploring "${term}".`,
			suggestedProbe: `Earlier you mentioned ${term} — can you tell me more about that?`
		});
	}

	const questionCraft = [];
	for (const s of segments.filter((x) => x.role === 'interviewer')) {
		if (questionCraft.length >= 4) break;
		const qs = extractQuestions(s.text);
		if (qs.length >= 2 && (s.text.match(/\?/g) ?? []).length >= 2) {
			questionCraft.push({
				seg: s.idx,
				quote: excerpt(s.text, 20),
				issue: 'double_barreled' as const,
				suggestion: `Ask one at a time, starting with: "${qs[0]}"`
			});
			continue;
		}
		const closed = qs.find(isClosedQuestion);
		if (closed) {
			questionCraft.push({
				seg: s.idx,
				quote: closed,
				issue: 'closed' as const,
				suggestion: `Try an open version: "${openUp(closed)}"`
			});
		}
	}

	const rqTokens = new Set(study.researchQuestions.flatMap((r) => contentTokens(r.text)));
	const freq = new Map<string, number>();
	for (const s of participantSegs(segments))
		for (const tok of new Set(contentTokens(s.text)))
			if (tok.length >= 5 && !rqTokens.has(tok)) freq.set(tok, (freq.get(tok) ?? 0) + 1);
	const emergentThemes = [...freq.entries()]
		.filter(([, n]) => n >= 2)
		.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
		.slice(0, 3)
		.map(([theme]) => {
			const seg = participantSegs(segments).find((s) => contentTokens(s.text).includes(theme))!;
			return {
				theme,
				evidence: [{ seg: seg.idx, quote: excerpt(seg.text, 12) }],
				note: 'Recurring in the participant’s words but not part of the research questions.'
			};
		});

	const lang = study.context.interviewLanguage.toLowerCase();
	const adaptationNotes: string[] = [];
	if (/taglish|filipino|tagalog|code/.test(lang))
		adaptationNotes.push(
			'The participant code-switches between Filipino and English; Taglish probes with polite markers (po/opo) will feel natural.'
		);

	const words = parts.reduce((n, s) => n + wordCount(s.text), 0);
	const addressed = coverage.filter((c) => c.status === 'addressed').length;
	const summary =
		words < 150
			? `This transcript is short (about ${words} participant words), so there is little to follow up on yet. Most suggestions target research questions that have not come up.`
			: `The participant spoke at length (about ${words} words across ${parts.length} substantial turns). ${addressed} of ${coverage.length} research questions look addressed; the probes below dig into their own words and the remaining gaps. (Demo mode: generated heuristically, not by an LLM.)`;

	return {
		summary,
		coverage: coverage.map((c) => ({
			...c,
			note:
				c.status === 'addressed'
					? 'Several turns speak to this.'
					: c.status === 'partial'
						? 'Touched on briefly.'
						: 'Not discussed yet.'
		})),
		hypotheses,
		probes: probes.slice(0, req.candidates),
		missedOpportunities,
		questionCraft,
		emergentThemes,
		adaptationNotes
	};
}

/** "How do commuters plan their routes" → "how do you plan your routes" */
function secondPerson(s: string) {
	return s
		.replace(/\b(commuters|users|participants|customers|people|respondents|they)\b/gi, 'you')
		.replace(/\btheir\b/gi, 'your')
		.replace(/\bthemselves\b/gi, 'yourself');
}

function lowerFirst(s: string) {
	return s.charAt(0).toLowerCase() + s.slice(1);
}

/** "Do you use Google Maps?" → "Tell me about how you use Google Maps." */
function openUp(q: string): string {
	const rest = q
		.replace(/\?+\s*$/, '')
		.replace(
			/^(so\s+|and\s+|but\s+)?(do|does|did|is|are|was|were|have|has|had|can|could|would|will)\s+(you\s+)?/i,
			''
		)
		.trim();
	return `Tell me about how you ${rest}.`;
}

function mockLive(req: LiveRequest): LiveAssistOutput {
	const { segments, brief } = req;
	const coverage = coverageFor(brief.study.researchQuestions, segments).map(({ rqId, status }) => ({
		rqId,
		status
	}));
	const asked = segments
		.filter((s) => s.role === 'interviewer')
		.flatMap((s) => extractQuestions(s.text));
	const askedGuideItemIds = brief.guide
		.filter(
			(g) => g.status === 'active' && asked.some((a) => questionSimilarity(a, g.text) >= 0.45)
		)
		.map((g) => g.id);

	const nudges: LiveAssistOutput['nudges'] = [];
	const recent = participantSegs(segments)
		.filter((s) => s.idx >= req.recentFrom && wordCount(s.text) >= 10)
		.at(-1);
	if (recent) {
		const term = salientTerm(recent, segments);
		nudges.push({
			probe: `Can you tell me more about ${term} — what happened the last time?`,
			kind: 'follow_up',
			anchor: { seg: recent.idx, quote: excerpt(recent.text, 10) },
			why: `They mentioned ${term} but didn't elaborate.`
		});
	}
	const gap = coverage.find((c) => c.status === 'not_addressed');
	if (gap && segments.length >= 8) {
		const rq = brief.study.researchQuestions.find((r) => r.id === gap.rqId)!;
		nudges.push({
			probe: `When it feels natural: ${lowerFirst(
				secondPerson(
					rq.text
						.replace(/^\s*\d+[.)]\s*/, '')
						.split('?')[0]
						.trim()
				)
			)}?`,
			kind: 'gap',
			anchor: null,
			why: `${rq.id} hasn't come up yet.`
		});
	}
	return { coverage, nudges: nudges.slice(0, 2), askedGuideItemIds };
}

function mockRefine(question: string, instruction: string): RefineOutput {
	const i = instruction.toLowerCase();
	let q = question;
	let note = 'Demo mode: lightly rephrased.';
	if (i.includes('shorter')) {
		const words = q.replace(/\?$/, '').split(/\s+/);
		q =
			words
				.slice(0, Math.max(6, Math.ceil(words.length * 0.6)))
				.join(' ')
				.replace(/[,—-]+$/, '') + '?';
		note = 'Trimmed to the core question.';
	} else if (i.includes('specific') || i.includes('past experience')) {
		q = `Thinking about the last time this happened — ${lowerFirst(q)}`;
		note = 'Anchored to a specific recent episode.';
	} else if (i.includes('leading')) {
		q = q.replace(/\b(don't you think|wouldn't you say|isn't it)\b,?\s*/gi, '');
		note = 'Removed presupposing phrasing.';
	} else if (i.includes('language')) {
		q = q.replace(/\?$/, ' po?');
		note = 'Added a polite marker in the participant’s language mix.';
	} else if (i.includes('gentler') || i.includes('empathetic')) {
		q = `If you're comfortable sharing, ${lowerFirst(q)}`;
		note = 'Softened the opening.';
	}
	return { question: q, note };
}
