import { error, fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import { parseStudyForm } from '#lib/server/forms.js';
import { deleteStudy, getStudy, updateStudy } from '#lib/server/repo.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const study = await getStudy(await getDb(), params.id);
	if (!study) error(404, 'Study not found');
	return { study };
};

export const actions: Actions = {
	default: async ({ request, params }) => {
		const parsed = parseStudyForm(await request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values: parsed.values });
		await updateStudy(await getDb(), params.id, parsed.input);
		redirect(303, `/studies/${params.id}`);
	},
	delete: async ({ params }) => {
		await deleteStudy(await getDb(), params.id);
		redirect(303, '/');
	}
};
