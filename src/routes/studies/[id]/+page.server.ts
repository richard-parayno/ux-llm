import { error, fail } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import * as repo from '#lib/server/repo.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const db = await getDb();
	const study = await repo.getStudy(db, params.id);
	if (!study) error(404, 'Study not found');
	const [interviews, guide] = await Promise.all([
		repo.listInterviews(db, study.id),
		repo.listGuide(db, study.id)
	]);
	const latest = await repo.latestReflections(
		db,
		interviews.map((i) => i.id)
	);
	const rows = await Promise.all(
		interviews.map(async (i) => {
			const segs = await repo.getSegments(db, i.id);
			const r = latest.get(i.id);
			return {
				...i,
				segmentCount: segs.length,
				words: segs.reduce((n, s) => n + s.text.split(/\s+/).length, 0),
				coverage: r?.result?.coverage ?? null,
				summary: r?.result?.summary ?? null,
				reflectedAt: r?.finishedAt ?? null
			};
		})
	);
	return { study, interviews: rows, guide };
};

export const actions: Actions = {
	addGuide: async ({ request, params }) => {
		const text = String((await request.formData()).get('text') ?? '').trim();
		if (!text) return fail(400, { guideError: 'Write a question first.' });
		await repo.addGuideItem(await getDb(), { studyId: params.id, text });
	},
	guideStatus: async ({ request }) => {
		const form = await request.formData();
		const status = String(form.get('status'));
		if (!['active', 'asked', 'archived'].includes(status)) return fail(400);
		await repo.updateGuideItem(await getDb(), String(form.get('id')), {
			status: status as 'active' | 'asked' | 'archived'
		});
	},
	guideEdit: async ({ request }) => {
		const form = await request.formData();
		const text = String(form.get('text') ?? '').trim();
		if (!text) return fail(400);
		await repo.updateGuideItem(await getDb(), String(form.get('id')), { text });
	},
	guideDelete: async ({ request }) => {
		await repo.deleteGuideItem(await getDb(), String((await request.formData()).get('id')));
	},
	guideMove: async ({ request, params }) => {
		const form = await request.formData();
		const db = await getDb();
		const id = String(form.get('id'));
		const dir = form.get('dir') === 'up' ? -1 : 1;
		const items = await repo.listGuide(db, params.id);
		const i = items.findIndex((g) => g.id === id);
		const j = i + dir;
		if (i < 0 || j < 0 || j >= items.length) return;
		[items[i], items[j]] = [items[j], items[i]];
		await Promise.all(items.map((g, pos) => repo.updateGuideItem(db, g.id, { position: pos })));
	}
};
