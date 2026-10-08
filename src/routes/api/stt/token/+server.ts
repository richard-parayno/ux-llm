import { error, json } from '@sveltejs/kit';
import { getTranscriber } from '#lib/server/app.js';
import { liveListenParams } from '#lib/server/stt/deepgram.js';
import { DEEPGRAM_MODEL } from '$app/env/private';
import type { RequestHandler } from './$types';

/** Mint a short-lived Deepgram token so the browser can stream audio directly. */
export const POST: RequestHandler = async ({ request }) => {
	const stt = getTranscriber();
	if (!stt) error(400, 'Live transcription needs DEEPGRAM_API_KEY.');
	const { language } = (await request.json().catch(() => ({}))) as { language?: string };
	try {
		const { token, expiresIn } = await stt.grantToken(60);
		return json({
			token,
			expiresIn,
			url: `wss://api.deepgram.com/v1/listen?${liveListenParams(DEEPGRAM_MODEL, language ?? 'multi')}`
		});
	} catch (e) {
		error(502, e instanceof Error ? e.message : 'Could not get a transcription token');
	}
};
