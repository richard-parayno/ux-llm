/**
 * Claude implementation of the provider interface.
 *
 * What changed vs. the 2023 version (gpt-3.5-turbo-16k via LangChain):
 *  - No chunking / map-reduce / vector store. A 1M-token context window holds
 *    the full transcript plus every earlier interview in the study.
 *  - Structured outputs (Zod → JSON Schema) instead of "RESPOND IN THIS
 *    FORMAT" free text that the UI had to display raw.
 *  - Prompt caching on the study brief and transcript so repair/refine calls
 *    are cheap and fast.
 *  - Adaptive thinking with an explicit effort level; streaming so long
 *    reflections never hit HTTP timeouts.
 *  - Server-side refusal fallbacks (`fallbacks: "default"`), so a safety
 *    classifier false positive on sensitive interview topics degrades to
 *    another model instead of failing the run.
 */
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import {
	LiveAssistOutput,
	ReflectionOutput,
	RefineOutput,
	RepairOutput,
	type TokenUsage
} from '#lib/domain.js';
import {
	LIVE_SYSTEM,
	REFINE_SYSTEM,
	REFLECT_SYSTEM,
	renderLiveTask,
	renderReflectTask,
	renderRefineTask,
	renderRepairTask,
	renderStudyBrief,
	renderTranscript
} from './prompts';
import {
	ProviderError,
	type InterviewContext,
	type LLMProvider,
	type LiveRequest,
	type ReflectRequest,
	type RefineRequest,
	type RepairRequest,
	type Result
} from './provider';

type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface ClaudeOptions {
	apiKey?: string;
	model: string;
	liveModel?: string;
	effort: Effort;
	/** Override for tests / proxies. */
	client?: Anthropic;
}

const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

export class ClaudeProvider implements LLMProvider {
	readonly name = 'claude' as const;
	readonly model: string;
	private readonly liveModel: string;
	private readonly effort: Effort;
	private readonly client: Anthropic;

	constructor(opts: ClaudeOptions) {
		this.model = opts.model;
		this.liveModel = opts.liveModel ?? opts.model;
		this.effort = opts.effort;
		this.client = opts.client ?? new Anthropic(opts.apiKey ? { apiKey: opts.apiKey } : {});
	}

	reflect(req: ReflectRequest, signal?: AbortSignal) {
		return this.call(
			{
				model: this.model,
				system: REFLECT_SYSTEM,
				context: req,
				task: renderReflectTask(req.config, req),
				schema: ReflectionOutput,
				effort: this.effort,
				maxTokens: 64000
			},
			signal
		);
	}

	repair(req: RepairRequest, signal?: AbortSignal) {
		return this.call(
			{
				model: this.model,
				system: REFLECT_SYSTEM,
				context: req,
				task: renderRepairTask(req.accepted, req.rejected, req.needed),
				schema: RepairOutput,
				effort: this.effort,
				maxTokens: 32000
			},
			signal
		);
	}

	liveAssist(req: LiveRequest, signal?: AbortSignal) {
		const guideIds = req.brief.guide.filter((g) => g.status === 'active').map((g) => g.id);
		return this.call(
			{
				model: this.liveModel,
				system: LIVE_SYSTEM,
				context: req,
				task: renderLiveTask(guideIds, req.recentFrom),
				schema: LiveAssistOutput,
				// Live nudges must arrive while the moment is still relevant.
				effort: 'low',
				maxTokens: 8000
			},
			signal
		);
	}

	refine(req: RefineRequest, signal?: AbortSignal) {
		return this.call(
			{
				model: this.model,
				system: REFINE_SYSTEM,
				context: req,
				task: renderRefineTask(req.probe, req.instruction),
				schema: RefineOutput,
				effort: 'low',
				maxTokens: 4000
			},
			signal
		);
	}

	private async call<S extends z.ZodType>(
		args: {
			model: string;
			system: string;
			context: InterviewContext;
			task: string;
			schema: S;
			effort: Effort;
			maxTokens: number;
		},
		signal?: AbortSignal
	): Promise<Result<z.infer<S>>> {
		const { context } = args;
		try {
			const stream = this.client.beta.messages.stream(
				{
					model: args.model,
					max_tokens: args.maxTokens,
					betas: [FALLBACK_BETA],
					fallbacks: 'default',
					thinking: { type: 'adaptive' },
					output_config: { effort: args.effort, format: betaZodOutputFormat(args.schema) },
					system: [{ type: 'text', text: args.system, cache_control: { type: 'ephemeral' } }],
					messages: [
						{
							role: 'user',
							content: [
								{
									type: 'text',
									text: renderStudyBrief(context.brief),
									cache_control: { type: 'ephemeral' }
								},
								{
									type: 'text',
									text: renderTranscript(context.label, context.segments, context.participantNote),
									cache_control: { type: 'ephemeral' }
								},
								{ type: 'text', text: args.task }
							]
						}
					]
				},
				{ signal }
			);
			const message = await stream.finalMessage();

			if (message.stop_reason === 'refusal') {
				throw new ProviderError(
					`The model declined this request${message.stop_details?.category ? ` (${message.stop_details.category})` : ''}.`,
					'refusal'
				);
			}
			if (message.stop_reason === 'max_tokens') {
				throw new ProviderError('The response was cut off (max_tokens).', 'truncated');
			}
			if (!message.parsed_output) {
				throw new ProviderError(
					'The model returned output that did not match the schema.',
					'invalid_output'
				);
			}
			return { output: message.parsed_output as z.infer<S>, usage: toUsage(message.usage) };
		} catch (err) {
			throw mapError(err);
		}
	}
}

function toUsage(u: Anthropic.Beta.BetaUsage): TokenUsage {
	return {
		inputTokens: u.input_tokens,
		outputTokens: u.output_tokens,
		cacheReadTokens: u.cache_read_input_tokens ?? 0,
		cacheWriteTokens: u.cache_creation_input_tokens ?? 0,
		calls: 1
	};
}

function mapError(err: unknown): Error {
	if (err instanceof ProviderError) return err;
	if (
		err instanceof Anthropic.AuthenticationError ||
		err instanceof Anthropic.PermissionDeniedError
	)
		return new ProviderError('Claude rejected the API key.', 'auth');
	if (err instanceof Anthropic.RateLimitError)
		return new ProviderError('Rate limited by the Claude API — try again shortly.', 'rate_limited');
	if (err instanceof Anthropic.BadRequestError)
		return new ProviderError(`Claude API rejected the request: ${err.message}`, 'bad_request');
	if (err instanceof Anthropic.APIConnectionError || err instanceof Anthropic.InternalServerError)
		return new ProviderError('Could not reach the Claude API.', 'unavailable');
	if (err instanceof Anthropic.APIError)
		return new ProviderError(`Claude API error ${err.status}: ${err.message}`, 'unavailable');
	if (err instanceof Error && err.name === 'SyntaxError')
		return new ProviderError('The model returned malformed JSON.', 'invalid_output');
	return err instanceof Error ? err : new Error(String(err));
}
