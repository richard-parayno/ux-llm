import { redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import { listStudies } from '#lib/server/repo.js';
import { seedDemoStudy } from '#lib/server/demo/index.js';
import { DEMO_TRANSCRIPT } from '#lib/server/demo/transcript.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const db = await getDb();
	return { studies: await listStudies(db) };
};

export const actions: Actions = {
	demo: async () => {
		const db = await getDb();
		const { study } = await seedDemoStudy(db, DEMO_TRANSCRIPT);
		redirect(303, `/studies/${study.id}`);
	}
};
