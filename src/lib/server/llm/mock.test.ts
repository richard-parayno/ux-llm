import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mockReflection, excerpt } from './mock';
import { parseTranscript } from '../transcript/parse';
import { askedQuestions, verifyAnalysis, verifyProbes } from './verify';
import { DEMO_STUDY } from '../demo';
import { toResearchItems } from '../repo';
import { study } from '../test/helpers';

describe('mock provider', () => {
	const segments = parseTranscript(
		readFileSync('src/lib/server/demo/commute-p01-taglish.txt', 'utf8')
	).segments.map((s, idx) => ({ ...s, idx }));
	const s = study({
		researchQuestions: toResearchItems(DEMO_STUDY.researchQuestions, 'RQ'),
		hypotheses: toResearchItems(DEMO_STUDY.hypotheses, 'H'),
		context: DEMO_STUDY.context
	});
	const out = mockReflection({
		brief: { study: s, priorInterviews: [], guide: [] },
		label: 'P01',
		participantNote: '',
		segments,
		config: { probeCount: 5, focus: 'balanced', ownFollowUps: '', note: '', redactPii: false },
		candidates: 7,
		participantWords: 900,
		ownFollowUps: []
	});

	it('produces output that passes its own verification', () => {
		const { rejected, accepted } = verifyProbes(out.probes, {
			segments,
			exclude: askedQuestions(segments),
			knownTargets: new Set(['RQ1', 'RQ2', 'RQ3', 'H1', 'H2', 'H3'])
		});
		expect(rejected).toEqual([]);
		expect(accepted.length).toBeGreaterThanOrEqual(5);
		const analysis = verifyAnalysis(out, segments);
		expect(analysis.coverage).toHaveLength(3);
		expect(analysis.questionCraft.length).toBeGreaterThan(0);
	});

	it('quotes are exact substrings', () => {
		const text = 'This is a long sentence with quite a lot of words in it, really. Short.';
		expect(text).toContain(excerpt(text, 6));
	});
});
