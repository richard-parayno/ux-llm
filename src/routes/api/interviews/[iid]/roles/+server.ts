import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/app.js';
import { setSpeakerRoles } from '#lib/server/repo.js';
import { SPEAKER_ROLES } from '#lib/domain.js';
import type { RequestHandler } from './$types';

const Body = z.object({ map: z.record(z.string().max(60), z.enum(SPEAKER_ROLES)) });

export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid role map');
	await setSpeakerRoles(await getDb(), params.iid, body.data.map);
	return json({ ok: true });
};
