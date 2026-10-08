import { json } from '@sveltejs/kit';
import { cancelReflection, getDb } from '#lib/server/app.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params }) => {
	await cancelReflection(await getDb(), params.rid);
	return json({ ok: true });
};
