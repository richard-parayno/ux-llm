import { error } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import { getStudy, listGuide } from '#lib/server/repo.js';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params }) => {
	const db = await getDb();
	const study = await getStudy(db, params.id);
	if (!study) error(404, 'Study not found');
	const guide = (await listGuide(db, study.id)).filter((g) => g.status === 'active');
	const md = [
		`# Interview guide — ${study.title}`,
		'',
		`**Goal:** ${study.goal}`,
		'',
		'## Research questions',
		...study.researchQuestions.map((r) => `- **${r.id}** ${r.text}`),
		'',
		'## Questions for the next session',
		...guide.map(
			(g, i) =>
				`${i + 1}. ${g.text}${g.targets.length ? ` _(${g.targets.join(', ')})_` : ''}${g.rationale ? `\n   - Why: ${g.rationale}` : ''}`
		),
		''
	].join('\n');
	const slug =
		study.title
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-|-$/g, '') || 'study';
	return new Response(md, {
		headers: {
			'content-type': 'text/markdown; charset=utf-8',
			'content-disposition': `attachment; filename="${slug}-guide.md"`
		}
	});
};
