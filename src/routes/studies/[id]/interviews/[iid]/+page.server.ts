import { error, fail, redirect } from '@sveltejs/kit';
import { getDb, getProvider, startReflection } from '#lib/server/app.js';
import * as repo from '#lib/server/repo.js';
import { parseTranscript, speakerStats } from '#lib/server/transcript/parse.js';
import {
	defaultProbeCount,
	MAX_PROBES,
	SPEAKER_ROLES,
	type ReflectionConfig,
	type SpeakerRole
} from '#lib/domain.js';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const db = await getDb();
	const [study, interview] = await Promise.all([
		repo.getStudy(db, params.id),
		repo.getInterview(db, params.iid)
	]);
	if (!study || !interview || interview.studyId !== study.id) error(404, 'Interview not found');
	if (interview.status === 'live')
		redirect(303, `/studies/${study.id}/interviews/${interview.id}/live`);

	const [segments, runs, guide] = await Promise.all([
		repo.getSegments(db, interview.id),
		repo.listReflections(db, interview.id),
		repo.listGuide(db, study.id)
	]);
	const selectedId = url.searchParams.get('r');
	const selected = (selectedId && runs.find((r) => r.id === selectedId)) || runs[0] || null;
	const feedback = selected ? await repo.listFeedback(db, selected.id) : [];
	const provider = getProvider();

	return {
		study,
		interview,
		segments,
		speakers: speakerStats(segments),
		runs: runs.map(({ id, status, createdAt, config }) => ({
			id,
			status,
			createdAt,
			probeCount: config.probeCount
		})),
		reflection: selected,
		feedback: feedback.map(({ probeId, action, payload }) => ({ probeId, action, payload })),
		guide,
		defaults: {
			probeCount: defaultProbeCount(study.context.sessionMinutes),
			maxProbes: MAX_PROBES
		},
		providerLabel: provider.name === 'mock' ? 'demo heuristic' : provider.model,
		imported: url.searchParams.get('imported')
	};
};

export const actions: Actions = {
	roles: async ({ request, params }) => {
		const form = await request.formData();
		const map: Record<string, SpeakerRole> = {};
		for (const [k, v] of form.entries()) {
			if (!k.startsWith('role:')) continue;
			const role = String(v) as SpeakerRole;
			if (SPEAKER_ROLES.includes(role)) map[k.slice(5)] = role;
		}
		await repo.setSpeakerRoles(await getDb(), params.iid, map);
	},

	consent: async ({ request, params }) => {
		const given = (await request.formData()).get('consent') === 'on';
		await repo.updateInterview(await getDb(), params.iid, {
			consentAt: given ? new Date().toISOString() : null
		});
	},

	meta: async ({ request, params }) => {
		const form = await request.formData();
		const label = String(form.get('label') ?? '').trim();
		if (!label) return fail(400, { metaError: 'Label is required.' });
		await repo.updateInterview(await getDb(), params.iid, {
			label,
			participantNote: String(form.get('participantNote') ?? '').trim()
		});
	},

	transcript: async ({ request, params }) => {
		const text = String((await request.formData()).get('transcript') ?? '');
		const parsed = parseTranscript(text);
		if (parsed.segments.length === 0) return fail(400, { transcriptError: 'No dialogue found.' });
		await repo.replaceSegments(await getDb(), params.iid, parsed.segments);
	},

	delete: async ({ params }) => {
		await repo.deleteInterview(await getDb(), params.iid);
		redirect(303, `/studies/${params.id}`);
	},

	reflect: async ({ request, params }) => {
		const db = await getDb();
		const interview = await repo.getInterview(db, params.iid);
		if (!interview) error(404);
		if (!interview.consentAt)
			return fail(400, {
				reflectError: 'Confirm participant consent before sending the transcript to an AI model.'
			});
		const segments = await repo.getSegments(db, interview.id);
		if (segments.length === 0)
			return fail(400, { reflectError: 'This interview has no transcript yet.' });

		const form = await request.formData();
		const count = Math.round(Number(form.get('probeCount')));
		const focus = String(form.get('focus'));
		const config: ReflectionConfig = {
			probeCount: Number.isFinite(count) ? Math.min(MAX_PROBES, Math.max(1, count)) : 5,
			focus: focus === 'depth' || focus === 'coverage' ? focus : 'balanced',
			ownFollowUps: String(form.get('ownFollowUps') ?? '').slice(0, 5000),
			note: String(form.get('note') ?? '').slice(0, 1000),
			redactPii: form.get('redactPii') === 'on'
		};
		const provider = getProvider();
		const run = await repo.createReflection(db, {
			interviewId: interview.id,
			config,
			provider: provider.name,
			model: provider.model
		});
		startReflection(db, run.id);
		return { started: run.id };
	}
};
