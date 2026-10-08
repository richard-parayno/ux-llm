import { error, fail, redirect } from '@sveltejs/kit';
import { getDb, getTranscriber } from '#lib/server/app.js';
import * as repo from '#lib/server/repo.js';
import { parseTranscript } from '#lib/server/transcript/parse.js';
import { STT_LANGUAGES } from '#lib/server/stt/deepgram.js';
import type { Actions, PageServerLoad } from './$types';

const MAX_TRANSCRIPT_CHARS = 2_000_000;

export const load: PageServerLoad = async ({ params }) => {
	const db = await getDb();
	const study = await repo.getStudy(db, params.id);
	if (!study) error(404, 'Study not found');
	const interviews = await repo.listInterviews(db, study.id);
	return {
		study,
		suggestedLabel: `P${String(interviews.length + 1).padStart(2, '0')}`,
		languages: STT_LANGUAGES
	};
};

function meta(form: FormData) {
	return {
		label: String(form.get('label') ?? '').trim() || 'Interview',
		participantNote: String(form.get('participantNote') ?? '').trim()
	};
}

export const actions: Actions = {
	text: async ({ request, params }) => {
		const form = await request.formData();
		const transcript = String(form.get('transcript') ?? '');
		if (transcript.trim().length < 20)
			return fail(400, { mode: 'text', error: 'Paste or upload a transcript first.' });
		if (transcript.length > MAX_TRANSCRIPT_CHARS)
			return fail(400, { mode: 'text', error: 'That transcript is too long (2M characters max).' });
		const parsed = parseTranscript(transcript);
		if (parsed.segments.length === 0)
			return fail(400, { mode: 'text', error: 'Could not find any dialogue in that text.' });
		const db = await getDb();
		const interview = await repo.createInterview(db, {
			studyId: params.id,
			...meta(form),
			source: form.get('fromFile') === '1' ? 'file' : 'paste'
		});
		await repo.replaceSegments(db, interview.id, parsed.segments);
		await repo.updateInterview(db, interview.id, { status: 'ready' });
		redirect(303, `/studies/${params.id}/interviews/${interview.id}?imported=${parsed.format}`);
	},

	audio: async ({ request, params }) => {
		const stt = getTranscriber();
		if (!stt)
			return fail(400, { mode: 'audio', error: 'Audio transcription needs DEEPGRAM_API_KEY.' });
		const form = await request.formData();
		const file = form.get('audio');
		if (!(file instanceof File) || file.size === 0)
			return fail(400, { mode: 'audio', error: 'Choose an audio or video file.' });
		let result;
		try {
			result = await stt.transcribe(file, file.type, {
				language: String(form.get('language') || 'multi'),
				redactPii: form.get('redactPii') === 'on'
			});
		} catch (e) {
			return fail(502, {
				mode: 'audio',
				error: e instanceof Error ? e.message : 'Transcription failed.'
			});
		}
		if (result.segments.length === 0)
			return fail(422, { mode: 'audio', error: 'No speech was found in that recording.' });
		const db = await getDb();
		const interview = await repo.createInterview(db, {
			studyId: params.id,
			...meta(form),
			source: 'audio'
		});
		await repo.replaceSegments(db, interview.id, result.segments);
		await repo.updateInterview(db, interview.id, {
			status: 'ready',
			durationSec: result.durationSec
		});
		// Audio is never written to disk: it is streamed to Deepgram and discarded.
		redirect(303, `/studies/${params.id}/interviews/${interview.id}?imported=audio`);
	},

	live: async ({ request, params }) => {
		const form = await request.formData();
		const db = await getDb();
		const interview = await repo.createInterview(db, {
			studyId: params.id,
			...meta(form),
			source: 'live'
		});
		await repo.updateInterview(db, interview.id, { status: 'live' });
		redirect(303, `/studies/${params.id}/interviews/${interview.id}/live`);
	}
};
