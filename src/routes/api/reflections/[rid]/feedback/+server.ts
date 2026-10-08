import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/app.js';
import { getReflection, recordFeedback } from '#lib/server/repo.js';
import type { RequestHandler } from './$types';

const Body = z.object({
	probeId: z.string().min(1).max(50),
	action: z.enum(['added_to_guide', 'dismissed', 'edited', 'refined', 'helpful', 'not_helpful']),
	payload: z.record(z.string(), z.unknown()).optional()
});

export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid feedback');
	const db = await getDb();
	if (!(await getReflection(db, params.rid))) error(404, 'Not found');
	await recordFeedback(db, { reflectionId: params.rid, ...body.data });
	return json({ ok: true });
};
