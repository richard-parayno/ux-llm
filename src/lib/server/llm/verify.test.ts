import { describe, expect, it } from 'vitest';
import type { Probe } from '#lib/domain.js';
import { askedQuestions, locateQuote, selectProbes, verifyAnalysis, verifyProbes } from './verify';
import { SEGMENTS } from '../test/helpers';

const probe = (over: Partial<Probe>): Probe => ({
	question: 'Walk me through the last time a flood changed your route.',
	probeType: 'example',
	targets: ['RQ2'],
	basis: 'transcript',
	anchors: [{ seg: 1, quote: 'When it floods I check the Facebook group first' }],
	rationale: 'Floods force adaptation.',
	whenToAsk: 'When they mention weather.',
	priority: 'high',
	...over
});

const ctx = {
	segments: SEGMENTS,
	exclude: askedQuestions(SEGMENTS),
	knownTargets: new Set(['RQ1', 'RQ2', 'H1'])
};

describe('locateQuote', () => {
	it('finds exact quotes, ignoring case and punctuation', () => {
		expect(locateQuote('when it floods, I check the FACEBOOK group', SEGMENTS, 1)).toEqual({
			seg: 1,
			grounding: 'exact'
		});
	});
	it('fixes a wrong segment index', () => {
		expect(locateQuote('Grab is easier when I have many stops', SEGMENTS, 1)).toEqual({
			seg: 3,
			grounding: 'exact'
		});
	});
	it('accepts elisions', () => {
		expect(locateQuote('I took the bus … then a jeepney', SEGMENTS, 1).grounding).toBe('exact');
	});
	it('tolerates near-verbatim quotes', () => {
		expect(
			locateQuote('my sister told me about a shortcut through Sucat', SEGMENTS, 3).grounding
		).toBe('approximate');
	});
	it('rejects invented quotes', () => {
		expect(locateQuote('I hate taking the train every morning', SEGMENTS, 1).grounding).toBe(
			'none'
		);
	});
	it('respects role filters', () => {
		expect(
			locateQuote('How did you get to work today', SEGMENTS, 0, ['participant']).grounding
		).toBe('none');
	});
});

describe('verifyProbes', () => {
	it('accepts a grounded, open, novel probe', () => {
		const { accepted, rejected } = verifyProbes([probe({})], ctx);
		expect(rejected).toHaveLength(0);
		expect(accepted[0].anchors[0]).toMatchObject({ seg: 1, grounding: 'exact' });
		expect(accepted[0].checks.issues).toEqual([]);
	});

	it('rejects a probe that repeats an asked question (the 2024 study failure mode)', () => {
		const { accepted, rejected } = verifyProbes(
			[probe({ question: 'How did you get to work today?', probeType: 'process' })],
			ctx
		);
		expect(accepted).toHaveLength(0);
		expect(rejected[0].checks.issues).toContain('repeats_asked_question');
		expect(rejected[0].checks.mostSimilarAsked).toBe('How did you get to work today?');
	});

	it('rejects hallucinated anchors', () => {
		const { rejected } = verifyProbes(
			[probe({ anchors: [{ seg: 1, quote: 'I always take the MRT with my dog' }] })],
			ctx
		);
		expect(rejected[0].checks.issues).toContain('ungrounded');
	});

	it('allows gap probes without anchors', () => {
		const { accepted } = verifyProbes([probe({ basis: 'gap', anchors: [] })], ctx);
		expect(accepted).toHaveLength(1);
	});

	it('rejects yes/no, double-barreled and duplicate probes', () => {
		const { accepted, rejected } = verifyProbes(
			[
				probe({}),
				probe({ question: 'Walk me through the last time a flood changed your route?' }),
				probe({ question: 'Do you trust the Facebook group?' }),
				probe({ question: 'What do you check first? And who posts there?' })
			],
			ctx
		);
		expect(accepted).toHaveLength(1);
		expect(rejected.map((r) => r.checks.issues[0])).toEqual([
			'duplicate_probe',
			'closed_question',
			'multiple_questions'
		]);
	});

	it('strips unknown targets without rejecting', () => {
		const { accepted } = verifyProbes([probe({ targets: ['RQ2', 'RQ9'] })], ctx);
		expect(accepted[0].targets).toEqual(['RQ2']);
		expect(accepted[0].checks.issues).toEqual(['unknown_target']);
	});
});

describe('selectProbes', () => {
	it('keeps high priority first but preserves original order', () => {
		const { accepted } = verifyProbes(
			[
				probe({
					priority: 'low',
					question: 'What would change if Grab were not available at all?',
					basis: 'gap',
					anchors: []
				}),
				probe({ priority: 'high' }),
				probe({
					priority: 'medium',
					question: 'Why does your sister know these shortcuts?',
					anchors: [{ seg: 3, quote: 'My sister told me about the shortcut through Sucat' }]
				})
			],
			ctx
		);
		expect(selectProbes(accepted, 2).map((p) => p.priority)).toEqual(['high', 'medium']);
	});
});

describe('verifyAnalysis', () => {
	it('drops evidence that cannot be found and fixes indices', () => {
		const out = verifyAnalysis(
			{
				summary: 's',
				coverage: [
					{
						rqId: 'RQ1',
						status: 'partial',
						evidence: [
							{ seg: 0, quote: 'Grab is easier when I have many stops' },
							{ seg: 1, quote: 'completely made up' }
						],
						note: ''
					}
				],
				hypotheses: [],
				probes: [],
				missedOpportunities: [
					{
						seg: 0,
						quote: 'My sister told me about the shortcut',
						whatWasMissed: 'x',
						suggestedProbe: 'y'
					}
				],
				questionCraft: [
					{ seg: 9, quote: 'Do you use Google Maps?', issue: 'closed', suggestion: 'z' }
				],
				emergentThemes: [],
				adaptationNotes: []
			},
			SEGMENTS
		);
		expect(out.coverage[0].evidence).toEqual([
			{ seg: 3, quote: 'Grab is easier when I have many stops', grounding: 'exact' }
		]);
		expect(out.missedOpportunities[0].seg).toBe(3);
		expect(out.questionCraft[0].seg).toBe(2);
	});
});
