import { error, json } from '@sveltejs/kit';
import { z } from 'zod';
import { getDb } from '#lib/server/app.js';
import { addGuideItem, getStudy, recordFeedback } from '#lib/server/repo.js';
import { PROBE_TYPES } from '#lib/domain.js';
import type { RequestHandler } from './$types';

const Body = z.object({
	text: z.string().trim().min(3).max(1000),
	rationale: z.string().max(2000).default(''),
	probeType: z.enum([...PROBE_TYPES, 'manual']).default('manual'),
	targets: z.array(z.string().max(20)).max(20).default([]),
	sourceReflectionId: z.string().nullable().default(null),
	probeId: z.string().optional()
});

export const POST: RequestHandler = async ({ params, request }) => {
	const body = Body.safeParse(await request.json().catch(() => null));
	if (!body.success) error(400, 'Invalid guide item');
	const db = await getDb();
	if (!(await getStudy(db, params.id))) error(404, 'Study not found');
	const { probeId, ...item } = body.data;
	const created = await addGuideItem(db, { studyId: params.id, ...item });
	if (probeId && item.sourceReflectionId)
		await recordFeedback(db, {
			reflectionId: item.sourceReflectionId,
			probeId,
			action: 'added_to_guide',
			payload: { guideItemId: created.id, text: item.text }
		});
	return json(created);
};
