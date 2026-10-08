import { error, json } from '@sveltejs/kit';
import { parseTranscript } from '#lib/server/transcript/parse.js';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const { text } = (await request.json().catch(() => ({}))) as { text?: string };
	if (!text || text.length > 2_000_000) error(400, 'Provide transcript text');
	const { segments, format, speakers } = parseTranscript(text);
	return json({ segments, format, speakers });
};
