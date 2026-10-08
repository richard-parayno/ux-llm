import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/app.js';
import { getInterview, updateGuideItem, updateInterview } from '#lib/server/repo.js';
import type { RequestHandler } from './$types';

const Body = z.object({
	durationSec: z
		.number()
		.int()
		.nonnegative()
		.max(24 * 3600)
		.nullable(),
	askedGuideItemIds: z.array(z.string()).max(500)
});

export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid request');
	const db = await getDb();
	const interview = await getInterview(db, params.iid);
	if (!interview) error(404, 'Interview not found');
	await updateInterview(db, interview.id, { status: 'ready', durationSec: body.data.durationSec });
	for (const id of body.data.askedGuideItemIds) await updateGuideItem(db, id, { status: 'asked' });
	return json({ ok: true });
};
