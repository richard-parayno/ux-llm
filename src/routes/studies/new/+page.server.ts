import { fail, redirect } from '@sveltejs/kit';
import { getDb } from '#lib/server/app.js';
import { parseStudyForm } from '#lib/server/forms.js';
import { createStudy } from '#lib/server/repo.js';
import type { Actions } from './$types';

export const actions: Actions = {
	default: async ({ request }) => {
		const parsed = parseStudyForm(await request.formData());
		if (!parsed.ok) return fail(400, { errors: parsed.errors, values: parsed.values });
		const study = await createStudy(await getDb(), parsed.input);
		redirect(303, `/studies/${study.id}`);
	}
};
