/**
 * Shared domain model for intavue.
 *
 * Everything the UI and the server agree on lives here. The LLM output
 * schemas are Zod objects so the same definition drives Claude's structured
 * output (`output_config.format`), runtime validation, and TypeScript types.
 *
 * Constraints such as "exactly N probes" are deliberately NOT encoded in the
 * schemas (structured outputs only support a subset of JSON Schema); they are
 * enforced by the verifier in `server/llm/verify.ts` instead.
 */
import { z } from 'zod';
import { PROBE_TYPES, type ProbeType, type SpeakerRole } from './constants';

export * from './constants';

// ---------------------------------------------------------------------------
// Study + interview
// ---------------------------------------------------------------------------

export interface ResearchItem {
	/** Stable short id the model can cite, e.g. "RQ1" or "H2". */
	id: string;
	text: string;
}

export interface StudyContext {
	/** What the interviews are about, in plain language (e.g. "daily commuting in Metro Manila"). */
	topic: string;
	/** Who the participants are; used to adapt wording (cultural in/out-group, expertise). */
	participantProfile: string;
	/** Language(s) participants speak, e.g. "Taglish (Filipino/English code-switching)". */
	interviewLanguage: string;
	/** Language for generated probes; empty = match the interview. */
	outputLanguage: string;
	/** Planned length of one session in minutes; informs default probe count. */
	sessionMinutes: number;
}

export interface Study {
	id: string;
	title: string;
	goal: string;
	researchQuestions: ResearchItem[];
	hypotheses: ResearchItem[];
	context: StudyContext;
	createdAt: string;
	updatedAt: string;
}

export interface Segment {
	/** Position in the transcript, 0-based. This is what the model cites as `seg`. */
	idx: number;
	/** Raw speaker label from the source ("I", "Speaker 1", "S0", "Maria"...). */
	speaker: string;
	role: SpeakerRole;
	text: string;
	startMs: number | null;
	endMs: number | null;
}

export const INTERVIEW_SOURCES = ['paste', 'file', 'audio', 'live'] as const;
export type InterviewSource = (typeof INTERVIEW_SOURCES)[number];

export interface Interview {
	id: string;
	studyId: string;
	label: string;
	participantNote: string;
	source: InterviewSource;
	status: 'draft' | 'live' | 'ready';
	/** ISO timestamp the researcher confirmed participant consent for AI processing. */
	consentAt: string | null;
	durationSec: number | null;
	createdAt: string;
}

export interface GuideItem {
	id: string;
	studyId: string;
	text: string;
	rationale: string;
	probeType: ProbeType | 'manual';
	targets: string[];
	status: 'active' | 'asked' | 'archived';
	sourceReflectionId: string | null;
	position: number;
	createdAt: string;
}

// ---------------------------------------------------------------------------
// LLM output schemas
// ---------------------------------------------------------------------------

export const Evidence = z.object({
	seg: z.number().int().describe('Index of the transcript segment the quote comes from.'),
	quote: z
		.string()
		.describe('Verbatim excerpt copied character-for-character from that segment (≤ 25 words).')
});
export type Evidence = z.infer<typeof Evidence>;

export const Probe = z.object({
	question: z
		.string()
		.describe(
			'The follow-up question, phrased exactly as the researcher could say it aloud. Open-ended, one question only.'
		),
	probeType: z.enum(PROBE_TYPES),
	targets: z
		.array(z.string())
		.describe('IDs of research questions / hypotheses this probe serves, e.g. ["RQ1","H2"].'),
	basis: z
		.enum(['transcript', 'gap'])
		.describe(
			'"transcript" if it follows up on something the participant said (must include anchors); "gap" if it targets a research question the interview has not covered yet.'
		),
	anchors: z.array(Evidence).describe('Participant quotes this probe follows up on.'),
	rationale: z.string().describe('Why ask this: the insight it could unlock (1–2 sentences).'),
	whenToAsk: z
		.string()
		.describe(
			'A short cue for when to use it in the next session, e.g. "after they describe their route".'
		),
	priority: z.enum(['high', 'medium', 'low'])
});
export type Probe = z.infer<typeof Probe>;

export const CoverageStatus = z.enum(['addressed', 'partial', 'not_addressed']);
export type CoverageStatus = z.infer<typeof CoverageStatus>;

export const ReflectionOutput = z.object({
	summary: z
		.string()
		.describe('2–4 sentences: what this interview taught us relative to the research goal.'),
	coverage: z.array(
		z.object({
			rqId: z.string(),
			status: CoverageStatus,
			evidence: z.array(Evidence),
			note: z.string().describe('What is known so far and what is still missing.')
		})
	),
	hypotheses: z.array(
		z.object({
			hId: z.string(),
			signal: z.enum(['supports', 'challenges', 'mixed', 'no_evidence']),
			evidence: z.array(Evidence),
			note: z.string()
		})
	),
	probes: z.array(Probe),
	missedOpportunities: z
		.array(
			z.object({
				seg: z.number().int(),
				quote: z.string(),
				whatWasMissed: z.string(),
				suggestedProbe: z.string()
			})
		)
		.describe('Moments where the participant opened a door the interviewer did not walk through.'),
	questionCraft: z
		.array(
			z.object({
				seg: z.number().int(),
				quote: z.string().describe("The interviewer's question, verbatim."),
				issue: z.enum(['leading', 'closed', 'double_barreled', 'jargon', 'assumptive', 'too_long']),
				suggestion: z.string().describe('A better phrasing.')
			})
		)
		.describe(
			"Constructive feedback on the interviewer's own questions (max ~5, most useful first)."
		),
	emergentThemes: z.array(
		z.object({
			theme: z.string(),
			evidence: z.array(Evidence),
			note: z.string()
		})
	),
	adaptationNotes: z
		.array(z.string())
		.describe(
			'Notes on adapting wording to the participant (culture, language, local terms). Empty if none.'
		)
});
export type ReflectionOutput = z.infer<typeof ReflectionOutput>;

/** Replacement probes requested during the verify → repair loop. */
export const RepairOutput = z.object({ probes: z.array(Probe) });
export type RepairOutput = z.infer<typeof RepairOutput>;

export const LiveNudge = z.object({
	probe: z.string().describe('A short follow-up the interviewer could ask next (≤ 25 words).'),
	kind: z.enum(['follow_up', 'gap', 'clarify']),
	anchor: Evidence.nullable().describe('The recent participant quote it follows up on, if any.'),
	why: z.string().describe('≤ 12 words.')
});
export type LiveNudge = z.infer<typeof LiveNudge>;

export const LiveAssistOutput = z.object({
	coverage: z.array(z.object({ rqId: z.string(), status: CoverageStatus })),
	nudges: z
		.array(LiveNudge)
		.describe('0–2 nudges. Return none if the conversation is flowing well.'),
	askedGuideItemIds: z
		.array(z.string())
		.describe('IDs of guide items the interviewer has already asked (in any wording).')
});
export type LiveAssistOutput = z.infer<typeof LiveAssistOutput>;

export const RefineOutput = z.object({
	question: z.string(),
	note: z.string().describe('One short sentence on what changed.')
});
export type RefineOutput = z.infer<typeof RefineOutput>;

// ---------------------------------------------------------------------------
// Verification annotations + stored reflection
// ---------------------------------------------------------------------------

export type GroundingLevel = 'exact' | 'approximate' | 'none';

export interface VerifiedEvidence extends Evidence {
	grounding: GroundingLevel;
}

export type ProbeIssue =
	| 'ungrounded'
	| 'repeats_asked_question'
	| 'duplicate_probe'
	| 'closed_question'
	| 'multiple_questions'
	| 'unknown_target';

export interface VerifiedProbe extends Omit<Probe, 'anchors'> {
	id: string;
	anchors: VerifiedEvidence[];
	checks: {
		/** Highest similarity to anything the interviewer already asked (0–1). */
		similarityToAsked: number;
		mostSimilarAsked: string | null;
		issues: ProbeIssue[];
	};
	/** True if it came from the repair round. */
	repaired: boolean;
}

export interface ReflectionConfig {
	probeCount: number;
	focus: 'balanced' | 'depth' | 'coverage';
	/** The researcher's own follow-up ideas, written before seeing AI output. */
	ownFollowUps: string;
	/** Optional extra instruction ("we only have 10 minutes next time"). */
	note: string;
	redactPii: boolean;
}

export interface ReflectionResult extends Omit<ReflectionOutput, 'probes'> {
	probes: VerifiedProbe[];
	/** Probes the verifier rejected and could not repair (kept for transparency). */
	rejected: VerifiedProbe[];
}

export interface ReflectionRun {
	id: string;
	interviewId: string;
	status: 'queued' | 'running' | 'done' | 'error';
	stage: string;
	config: ReflectionConfig;
	result: ReflectionResult | null;
	warnings: string[];
	provider: string;
	model: string;
	usage: TokenUsage | null;
	error: string | null;
	createdAt: string;
	finishedAt: string | null;
}

export interface TokenUsage {
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	calls: number;
}

export const DEFAULT_CONTEXT: StudyContext = {
	topic: '',
	participantProfile: '',
	interviewLanguage: 'English',
	outputLanguage: '',
	sessionMinutes: 30
};

/**
 * Default probe count scales with session length. The paper's participants
 * found five too few for 45+ minute interviews and asked for "up to ten".
 */
export function defaultProbeCount(sessionMinutes: number): number {
	if (sessionMinutes <= 15) return 3;
	if (sessionMinutes <= 30) return 5;
	if (sessionMinutes <= 45) return 7;
	return 10;
}

export const MAX_PROBES = 15;
