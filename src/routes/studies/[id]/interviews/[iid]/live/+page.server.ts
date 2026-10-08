import { error, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import * as repo from '#lib/server/repo.js';
import { parseTranscript } from '#lib/server/transcript/parse.js';
import { STT_LANGUAGES } from '#lib/server/stt/deepgram.js';
import { DEMO_TRANSCRIPT } from '#lib/server/demo/transcript.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = await getDb();
	const [study, interview] = await Promise.all([
		repo.getStudy(db, params.id),
		repo.getInterview(db, params.iid)
	]);
	if (!study || !interview || interview.studyId !== study.id) error(404, 'Interview not found');
	if (interview.status !== 'live') redirect(303, `/studies/${study.id}/interviews/${interview.id}`);
	const [segments, guide] = await Promise.all([
		repo.getSegments(db, interview.id),
		repo.listGuide(db, study.id)
	]);
	return {
		study,
		interview,
		segments,
		guide: guide.filter((g) => g.status === 'active'),
		languages: STT_LANGUAGES,
		demoSegments: parseTranscript(DEMO_TRANSCRIPT).segments
	};
};

export const actions: Actions = {
	consent: async ({ params }) => {
		await repo.updateInterview(await getDb(), params.iid, { consentAt: new Date().toISOString() });
	}
};
