/**
 * The reflection pipeline: generate → verify → (repair) → persist.
 */
import type { DB } from './db';
import * as repo from './repo';
import type { LLMProvider, InterviewContext } from './llm/provider';
import { addUsage, emptyUsage, ProviderError } from './llm/provider';
import type { PriorInterview } from './llm/prompts';
import {
	askedQuestions,
	describeIssues,
	participantWordCount,
	selectProbes,
	verifyAnalysis,
	verifyProbes,
	type AskedQuestion
} from './llm/verify';
import { extractQuestions } from './llm/text';
import { redactSegments } from './privacy/redact';
import type { ReflectionConfig, ReflectionResult, Segment, VerifiedProbe } from '#lib/domain.js';

/** Rough chars→tokens; only used to decide whether earlier transcripts fit. */
const approxTokens = (s: string) => Math.ceil(s.length / 4);
const PRIOR_TRANSCRIPT_BUDGET = 300_000;

export async function buildInterviewContext(
	db: DB,
	interviewId: string,
	opts: { redact?: boolean; segmentsOverride?: Segment[] } = {}
): Promise<InterviewContext & { studyId: string }> {
	const interview = await repo.getInterview(db, interviewId);
	if (!interview) throw new Error('Interview not found');
	const study = await repo.getStudy(db, interview.studyId);
	if (!study) throw new Error('Study not found');
	const [allInterviews, guide] = await Promise.all([
		repo.listInterviews(db, study.id),
		repo.listGuide(db, study.id)
	]);
	const segments = opts.segmentsOverride ?? (await repo.getSegments(db, interviewId));

	const others = allInterviews.filter((i) => i.id !== interviewId && i.status === 'ready');
	const latest = await repo.latestReflections(
		db,
		others.map((o) => o.id)
	);
	const priorInterviews: PriorInterview[] = [];
	let budget = PRIOR_TRANSCRIPT_BUDGET;
	for (const o of others) {
		const r = latest.get(o.id);
		const segs = await repo.getSegments(db, o.id);
		const cost = approxTokens(segs.map((s) => s.text).join('\n'));
		const include = cost <= budget;
		if (include) budget -= cost;
		priorInterviews.push({
			label: o.label,
			summary: r?.result?.summary ?? null,
			coverage: r?.result?.coverage ?? null,
			segments: include ? segs : null
		});
	}

	const names = [interview.label].filter((n) => !/^p\d+$/i.test(n));
	const llmSegments = opts.redact ? redactSegments(segments, { names }).segments : segments;
	return {
		studyId: study.id,
		brief: { study, priorInterviews, guide },
		label: interview.label,
		participantNote: interview.participantNote,
		segments: llmSegments
	};
}

export function parseOwnFollowUps(text: string): string[] {
	return text
		.split('\n')
		.map((l) => l.replace(/^\s*[-*\d.)]+\s*/, '').trim())
		.filter((l) => l.length > 3);
}

export interface RunOptions {
	signal?: AbortSignal;
	/** Max repair rounds when verification rejects probes. */
	maxRepairs?: number;
	onStage?: (stage: string) => void | Promise<void>;
}

export interface PipelineOutput {
	result: ReflectionResult;
	warnings: string[];
	usage: ReturnType<typeof emptyUsage>;
}

/** Pure pipeline (no persistence) — used by the app and the eval harness. */
export async function reflectPipeline(
	provider: LLMProvider,
	ctx: InterviewContext,
	config: ReflectionConfig,
	opts: RunOptions = {}
): Promise<PipelineOutput> {
	const warnings: string[] = [];
	let usage = emptyUsage();
	const segments = ctx.segments;
	const participantWords = participantWordCount(segments);
	if (segments.length === 0) throw new ProviderError('The transcript is empty.', 'bad_request');
	if (!segments.some((s) => s.role === 'interviewer'))
		warnings.push(
			'No speaker is marked as the interviewer, so repeated questions cannot be detected. Assign speaker roles for better results.'
		);
	if (participantWords < 150)
		warnings.push(
			`This transcript is short (~${participantWords} participant content words). Suggestions lean on your research questions rather than what was said.`
		);

	const ownFollowUps = parseOwnFollowUps(config.ownFollowUps);
	const exclude: AskedQuestion[] = [
		...askedQuestions(segments),
		...ctx.brief.guide
			.filter((g) => g.status !== 'archived')
			.flatMap((g) => extractQuestions(g.text).map((text) => ({ seg: -1, text }))),
		...ownFollowUps.map((text) => ({ seg: -1, text }))
	];
	const knownTargets = new Set([
		...ctx.brief.study.researchQuestions.map((r) => r.id),
		...ctx.brief.study.hypotheses.map((h) => h.id)
	]);
	const candidates = config.probeCount + Math.max(2, Math.ceil(config.probeCount * 0.3));
	const req = { ...ctx, config, candidates, participantWords, ownFollowUps };

	await opts.onStage?.('Reading the transcript and drafting probes');
	const first = await provider.reflect(req, opts.signal);
	usage = addUsage(usage, first.usage);

	await opts.onStage?.('Verifying quotes and checking for repeated questions');
	const analysis = verifyAnalysis(first.output, segments);
	const vctx = { segments, exclude, knownTargets };
	let { accepted, rejected } = verifyProbes(first.output.probes, vctx);

	const maxRepairs = opts.maxRepairs ?? 1;
	for (let round = 0; round < maxRepairs && accepted.length < config.probeCount; round++) {
		const needed = config.probeCount - accepted.length;
		await opts.onStage?.(
			`Repairing ${needed} probe${needed === 1 ? '' : 's'} that failed verification`
		);
		const repaired = await provider.repair(
			{
				...req,
				accepted,
				rejected: rejected.map((r) => ({ question: r.question, reason: describeIssues(r) })),
				needed: needed + 1
			},
			opts.signal
		);
		usage = addUsage(usage, repaired.usage);
		const second = verifyProbes(repaired.output.probes, vctx, {
			repaired: true,
			startIndex: accepted.length + rejected.length,
			alreadyAccepted: accepted
		});
		accepted = [...accepted, ...second.accepted];
		rejected = [...rejected, ...second.rejected];
	}

	const probes = selectProbes(accepted, config.probeCount);
	if (probes.length < config.probeCount)
		warnings.push(
			`Only ${probes.length} of ${config.probeCount} probes passed verification. Rejected ones are listed below for transparency.`
		);
	const repeats = rejected.filter((r) => r.checks.issues.includes('repeats_asked_question')).length;
	if (repeats)
		warnings.push(
			`${repeats} suggestion${repeats === 1 ? '' : 's'} repeated a question you already asked and ${repeats === 1 ? 'was' : 'were'} filtered out.`
		);

	return { result: { ...analysis, probes, rejected }, warnings, usage };
}

/** Run a queued reflection and persist progress + result. */
export async function runReflection(
	db: DB,
	provider: LLMProvider,
	reflectionId: string,
	opts: RunOptions = {}
): Promise<void> {
	const run = await repo.getReflection(db, reflectionId);
	if (!run) throw new Error('Reflection not found');
	try {
		await repo.updateReflection(db, reflectionId, {
			status: 'running',
			stage: 'Preparing context'
		});
		const ctx = await buildInterviewContext(db, run.interviewId, { redact: run.config.redactPii });
		const out = await reflectPipeline(provider, ctx, run.config, {
			...opts,
			onStage: async (stage) => {
				await repo.updateReflection(db, reflectionId, { stage });
				await opts.onStage?.(stage);
			}
		});
		await repo.updateReflection(db, reflectionId, {
			status: 'done',
			stage: 'Done',
			result: out.result,
			warnings: out.warnings,
			usage: out.usage,
			finishedAt: new Date().toISOString()
		});
	} catch (err) {
		await repo.updateReflection(db, reflectionId, {
			status: 'error',
			stage: 'Failed',
			error: err instanceof Error ? err.message : String(err),
			finishedAt: new Date().toISOString()
		});
	}
}

/** Annotate live nudges with the same verification as post-interview probes. */
export function filterNudges<
	T extends { probe: string; anchor: { seg: number; quote: string } | null }
>(nudges: T[], segments: Segment[]): T[] {
	const asked = askedQuestions(segments);
	const probes = nudges.map((n) => ({
		question: n.probe,
		probeType: 'elaboration' as const,
		targets: [],
		basis: n.anchor ? ('transcript' as const) : ('gap' as const),
		anchors: n.anchor ? [n.anchor] : [],
		rationale: '',
		whenToAsk: '',
		priority: 'medium' as const
	}));
	const { accepted } = verifyProbes(probes, { segments, exclude: asked, knownTargets: new Set() });
	const ok = new Set(accepted.map((a: VerifiedProbe) => a.question));
	return nudges.filter((n) => ok.has(n.probe));
}
