import type {
	LiveAssistOutput,
	ReflectionConfig,
	ReflectionOutput,
	RefineOutput,
	RepairOutput,
	Segment,
	TokenUsage,
	VerifiedProbe
} from '#lib/domain.js';
import type { StudyBrief } from './prompts';

/** Inputs shared by every call about one interview (they form the cached prefix). */
export interface InterviewContext {
	brief: StudyBrief;
	label: string;
	participantNote: string;
	segments: Segment[];
}

export interface ReflectRequest extends InterviewContext {
	config: ReflectionConfig;
	candidates: number;
	participantWords: number;
	ownFollowUps: string[];
}

export interface RepairRequest extends ReflectRequest {
	accepted: VerifiedProbe[];
	rejected: { question: string; reason: string }[];
	needed: number;
}

export interface LiveRequest extends InterviewContext {
	recentFrom: number;
}

export interface RefineRequest extends InterviewContext {
	probe: Pick<VerifiedProbe, 'question' | 'rationale' | 'anchors' | 'probeType'>;
	instruction: string;
}

export interface Result<T> {
	output: T;
	usage: TokenUsage;
}

export interface LLMProvider {
	readonly name: 'claude' | 'mock';
	readonly model: string;
	reflect(req: ReflectRequest, signal?: AbortSignal): Promise<Result<ReflectionOutput>>;
	repair(req: RepairRequest, signal?: AbortSignal): Promise<Result<RepairOutput>>;
	liveAssist(req: LiveRequest, signal?: AbortSignal): Promise<Result<LiveAssistOutput>>;
	refine(req: RefineRequest, signal?: AbortSignal): Promise<Result<RefineOutput>>;
}

export class ProviderError extends Error {
	constructor(
		message: string,
		readonly kind:
			| 'refusal'
			| 'truncated'
			| 'invalid_output'
			| 'rate_limited'
			| 'auth'
			| 'unavailable'
			| 'bad_request'
	) {
		super(message);
	}
}

export const emptyUsage = (): TokenUsage => ({
	inputTokens: 0,
	outputTokens: 0,
	cacheReadTokens: 0,
	cacheWriteTokens: 0,
	calls: 0
});

export function addUsage(a: TokenUsage, b: TokenUsage): TokenUsage {
	return {
		inputTokens: a.inputTokens + b.inputTokens,
		outputTokens: a.outputTokens + b.outputTokens,
		cacheReadTokens: a.cacheReadTokens + b.cacheReadTokens,
		cacheWriteTokens: a.cacheWriteTokens + b.cacheWriteTokens,
		calls: a.calls + b.calls
	};
}
