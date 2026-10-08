import { describe, expect, it } from 'vitest';
import * as repo from './repo';
import { SEGMENTS, study, testDb } from './test/helpers';

describe('toResearchItems', () => {
	it('numbers items and keeps ids stable across edits', () => {
		const first = repo.toResearchItems(['A', 'B', 'C'], 'RQ');
		expect(first.map((i) => i.id)).toEqual(['RQ1', 'RQ2', 'RQ3']);
		// B removed, D added: A and C keep their ids, D gets a new one.
		const second = repo.toResearchItems(['A', 'C', 'D'], 'RQ', first);
		expect(second).toEqual([
			{ id: 'RQ1', text: 'A' },
			{ id: 'RQ3', text: 'C' },
			{ id: 'RQ4', text: 'D' }
		]);
	});
});

describe('repository', () => {
	it('stores studies, interviews, segments and guide items', async () => {
		const db = await testDb();
		const s = await repo.createStudy(db, {
			title: 'T',
			goal: 'G',
			researchQuestions: ['q1', 'q2'],
			hypotheses: ['h1'],
			context: study().context
		});
		expect(s.researchQuestions[1].id).toBe('RQ2');
		const i = await repo.createInterview(db, { studyId: s.id, label: 'P01', source: 'live' });
		await repo.appendSegments(db, i.id, SEGMENTS.slice(0, 2));
		await repo.appendSegments(db, i.id, SEGMENTS.slice(2));
		const segs = await repo.getSegments(db, i.id);
		expect(segs.map((x) => x.idx)).toEqual([0, 1, 2, 3, 4]);

		await repo.setSpeakerRoles(db, i.id, { R: 'observer' });
		expect((await repo.getSegments(db, i.id))[1].role).toBe('observer');

		const g1 = await repo.addGuideItem(db, { studyId: s.id, text: 'first' });
		const g2 = await repo.addGuideItem(db, { studyId: s.id, text: 'second' });
		expect([g1.position, g2.position]).toEqual([0, 1]);
		await repo.updateGuideItem(db, g2.id, { status: 'asked' });
		expect((await repo.listGuide(db, s.id)).map((g) => g.status)).toEqual(['active', 'asked']);

		await repo.deleteStudy(db, s.id);
		expect(await repo.getSegments(db, i.id)).toEqual([]); // cascades
	});
});
