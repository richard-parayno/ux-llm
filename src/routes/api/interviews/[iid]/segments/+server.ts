import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/app.js';
import { appendSegments, getInterview } from '#lib/server/repo.js';
import { SPEAKER_ROLES } from '#lib/domain.js';
import type { RequestHandler } from './$types';

const Body = z.object({
	segments: z
		.array(
			z.object({
				speaker: z.string().min(1).max(60),
				role: z.enum(SPEAKER_ROLES),
				text: z.string().min(1).max(20_000),
				startMs: z.number().int().nonnegative().nullable(),
				endMs: z.number().int().nonnegative().nullable()
			})
		)
		.max(200)
});

/** Live mode persists each finished utterance as it happens, so nothing is lost on reload. */
export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid segments');
	const db = await getDb();
	const interview = await getInterview(db, params.iid);
	if (!interview) error(404, 'Interview not found');
	if (interview.status !== 'live') error(409, 'This interview is not live');
	await appendSegments(db, params.iid, body.data.segments);
	return json({ ok: true });
};
