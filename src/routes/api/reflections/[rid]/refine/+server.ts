import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb, getProvider } from '#lib/server/app.js';
import { getReflection, recordFeedback } from '#lib/server/repo.js';
import { buildInterviewContext } from '#lib/server/reflect.js';
import { REFINE_PRESETS, type RefinePreset } from '#lib/server/llm/prompts.js';
import { ProviderError } from '#lib/server/llm/provider.js';
import type { RequestHandler } from './$types';

const Body = z.object({
	probeId: z.string(),
	question: z.string().min(3).max(1000),
	preset: z.string().optional(),
	instruction: z.string().max(500).optional()
});

export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid request');
	const { probeId, question, preset, instruction } = body.data;
	const text =
		preset && preset in REFINE_PRESETS
			? REFINE_PRESETS[preset as RefinePreset]
			: instruction?.trim();
	if (!text) error(400, 'Say how to change it');

	const db = await getDb();
	const run = await getReflection(db, params.rid);
	const probe = run?.result?.probes.find((p) => p.id === probeId);
	if (!run || !probe) error(404, 'Probe not found');

	try {
		const ctx = await buildInterviewContext(db, run.interviewId, { redact: run.config.redactPii });
		const { output } = await getProvider().refine({
			...ctx,
			probe: { ...probe, question },
			instruction: text
		});
		await recordFeedback(db, {
			reflectionId: run.id,
			probeId,
			action: 'refined',
			payload: { from: question, to: output.question, instruction: preset ?? text }
		});
		return json(output);
	} catch (e) {
		error(
			e instanceof ProviderError && e.kind === 'rate_limited' ? 429 : 502,
			e instanceof Error ? e.message : 'Refine failed'
		);
	}
};
