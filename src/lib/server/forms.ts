import { z } from 'zod';
import { DEFAULT_CONTEXT } from '#lib/domain.js';
import type { StudyInput } from './repo';

const lines = (v: FormDataEntryValue | null) =>
	String(v ?? '')
		.split('\n')
		.map((l) => l.replace(/^\s*(?:[-*•]|\d+[.)]|RQ\d+:|H\d+:)\s*/i, '').trim())
		.filter(Boolean);

const StudySchema = z.object({
	title: z.string().trim().min(1, 'Give the study a title.').max(200),
	goal: z.string().trim().min(10, 'Describe the research goal in a sentence or two.').max(5000),
	researchQuestions: z
		.array(z.string().max(1000))
		.min(1, 'Add at least one research question.')
		.max(20),
	hypotheses: z.array(z.string().max(1000)).max(20),
	context: z.object({
		topic: z.string().trim().max(500),
		participantProfile: z.string().trim().max(1000),
		interviewLanguage: z.string().trim().max(200),
		outputLanguage: z.string().trim().max(100),
		sessionMinutes: z.coerce.number().int().min(5).max(240)
	})
});

export type StudyFormValues = {
	title: string;
	goal: string;
	researchQuestions: string;
	hypotheses: string;
	topic: string;
	participantProfile: string;
	interviewLanguage: string;
	outputLanguage: string;
	sessionMinutes: string;
};

export function parseStudyForm(
	form: FormData
):
	| { ok: true; input: StudyInput }
	| { ok: false; errors: Record<string, string>; values: StudyFormValues } {
	const values = Object.fromEntries(
		[
			'title',
			'goal',
			'researchQuestions',
			'hypotheses',
			'topic',
			'participantProfile',
			'interviewLanguage',
			'outputLanguage',
			'sessionMinutes'
		].map((k) => [k, String(form.get(k) ?? '')])
	) as StudyFormValues;
	const parsed = StudySchema.safeParse({
		title: values.title,
		goal: values.goal,
		researchQuestions: lines(values.researchQuestions),
		hypotheses: lines(values.hypotheses),
		context: {
			topic: values.topic,
			participantProfile: values.participantProfile,
			interviewLanguage: values.interviewLanguage || DEFAULT_CONTEXT.interviewLanguage,
			outputLanguage: values.outputLanguage,
			sessionMinutes: values.sessionMinutes || DEFAULT_CONTEXT.sessionMinutes
		}
	});
	if (parsed.success) return { ok: true, input: parsed.data };
	const errors: Record<string, string> = {};
	for (const issue of parsed.error.issues) {
		const key = String(
			issue.path.at(-1) === undefined
				? 'form'
				: issue.path[0] === 'context'
					? issue.path[1]
					: issue.path[0]
		);
		errors[key] ??= issue.message;
	}
	return { ok: false, errors, values };
}
