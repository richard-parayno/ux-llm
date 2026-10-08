/**
 * Eval cases. Each mirrors a situation from the 2024 study:
 *  - commute-full:   the real Taglish pilot transcript, full length
 *  - commute-short:  the same interview cut to ~5 minutes — the paper's
 *                    failure case ("the LLM produced a follow-up question that
 *                    was copied directly from what the interviewer asked if the
 *                    interviewer failed to reach a minimum of 15 minutes")
 *  - grocery:        a synthetic English Teams-style VTT with closed questions
 */
import { readFileSync } from 'node:fs';
import { DEMO_STUDY } from '../src/lib/server/demo/index.ts';
import type { StudyContext } from '../src/lib/domain.ts';

export interface EvalCase {
	id: string;
	study: {
		title: string;
		goal: string;
		researchQuestions: string[];
		hypotheses: string[];
		context: StudyContext;
	};
	transcript: string;
	maxTurns?: number;
	probeCount: number;
}

const commute = readFileSync('src/lib/server/demo/commute-p01-taglish.txt', 'utf8');

export const CASES: EvalCase[] = [
	{ id: 'commute-full', study: DEMO_STUDY, transcript: commute, probeCount: 5 },
	{ id: 'commute-short', study: DEMO_STUDY, transcript: commute, maxTurns: 16, probeCount: 5 },
	{
		id: 'grocery',
		study: {
			title: 'Online grocery habits of new parents',
			goal: 'Understand how parents of infants plan, order and recover from problems with online grocery delivery.',
			researchQuestions: [
				'How do new parents plan and place their grocery orders?',
				'How do they handle out-of-stock items and substitutions?',
				'How do households coordinate shopping between partners?'
			],
			hypotheses: [
				'Price is the main reason parents choose a delivery service.',
				'Parents trust substitutions for non-baby items.'
			],
			context: {
				topic: 'Online grocery delivery',
				participantProfile: 'Parents of children under 2 in a European city',
				interviewLanguage: 'English',
				outputLanguage: '',
				sessionMinutes: 30
			}
		},
		transcript: readFileSync('eval/fixtures/grocery-p01.vtt', 'utf8'),
		probeCount: 5
	}
];
