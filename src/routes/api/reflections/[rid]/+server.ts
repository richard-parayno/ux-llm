import { error, json } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import { getReflection } from '#lib/server/repo.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const run = await getReflection(await getDb(), params.rid);
	if (!run) error(404, 'Not found');
	const { id, status, stage, error: err, finishedAt } = run;
	return json({ id, status, stage, error: err, finishedAt });
};
