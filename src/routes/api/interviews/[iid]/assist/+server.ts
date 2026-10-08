import { error, json } from '@sveltejs/kit';
import { getDb, getProvider } from '#lib/server/app.js';
import { getInterview } from '#lib/server/repo.js';
import { buildInterviewContext, filterNudges } from '#lib/server/reflect.js';
import { ProviderError } from '#lib/server/llm/provider.js';
import type { RequestHandler } from './$types';

/** One live co-pilot tick: coverage so far, ≤ 2 verified nudges, guide items already asked. */
export const POST: RequestHandler = async ({ params, request }) => {
	const { recentFrom = 0 } = (await request.json().catch(() => ({}))) as { recentFrom?: number };
	const db = await getDb();
	const interview = await getInterview(db, params.iid);
	if (!interview) error(404, 'Interview not found');
	if (!interview.consentAt) error(403, 'Confirm participant consent first.');
	const ctx = await buildInterviewContext(db, interview.id, { redact: true });
	if (ctx.segments.length < 2) return json({ coverage: [], nudges: [], askedGuideItemIds: [] });
	try {
		const { output } = await getProvider().liveAssist({ ...ctx, recentFrom });
		return json({ ...output, nudges: filterNudges(output.nudges, ctx.segments).slice(0, 2) });
	} catch (e) {
		error(
			e instanceof ProviderError && e.kind === 'rate_limited' ? 429 : 502,
			e instanceof Error ? e.message : 'Assist failed'
		);
	}
};
