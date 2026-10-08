/**
 * The demo study mirrors the materials used in the 2024 intavue.ai study:
 * the Metro Manila commuting goal, research questions and hypotheses that
 * participants were given, plus a real (anonymised) pilot transcript in
 * Taglish from October 2022.
 */
import type { DB } from '../db';
import * as repo from '../repo';
import { parseTranscript } from '../transcript/parse';
import { DEFAULT_CONTEXT } from '#lib/domain.js';

export const DEMO_STUDY = {
	title: 'Commuting in Metro Manila',
	goal: 'Investigate how commuters within Metro Manila formulate their routes for their daily commute, to understand the commuter experience and identify critical areas that need to be improved.',
	researchQuestions: [
		'How do commuters formulate the routes that they take for their commute? Where do they get the information necessary for their routes?',
		'How do they adapt to unforeseen circumstances in their commute?',
		'Do they use tools such as Google Maps to formulate their routes? If yes, what particular tools do they use?'
	],
	hypotheses: [
		'Commuters primarily rely on word of mouth for their knowledge of commuting routes; their primary source of information is other commuters.',
		'If they are lost, commuters ask directions from people around the area.',
		'Commuters rely on software applications such as Google Maps and messaging apps to formulate their routes.'
	],
	context: {
		...DEFAULT_CONTEXT,
		topic: 'Daily commuting and route planning in Metro Manila',
		participantProfile:
			'Working adults in Metro Manila who commute by public transport and ride-hailing',
		interviewLanguage: 'Taglish (Filipino–English code-switching)',
		sessionMinutes: 20
	}
};

export async function seedDemoStudy(db: DB, transcript: string) {
	const study = await repo.createStudy(db, DEMO_STUDY);
	const interview = await repo.createInterview(db, {
		studyId: study.id,
		label: 'P01',
		participantNote: 'Accountant, commutes by bus to Alabang; uses Grab for multi-stop trips.',
		source: 'file'
	});
	const parsed = parseTranscript(transcript);
	await repo.replaceSegments(db, interview.id, parsed.segments);
	await repo.updateInterview(db, interview.id, { status: 'ready' });
	return { study, interview };
}
