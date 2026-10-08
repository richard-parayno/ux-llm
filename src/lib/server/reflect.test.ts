import { describe, expect, it } from 'vitest';
import { reflectPipeline, runReflection, parseOwnFollowUps, filterNudges } from './reflect';
import type { LLMProvider, ReflectRequest, RepairRequest } from './llm/provider';
import { emptyUsage } from './llm/provider';
import { MockProvider } from './llm/mock';
import type { Probe, ReflectionConfig, ReflectionOutput } from '#lib/domain.js';
import { SEGMENTS, study, testDb } from './test/helpers';
import * as repo from './repo';
import { seedDemoStudy } from './demo';
import { readFileSync } from 'node:fs';

const config: ReflectionConfig = {
	probeCount: 2,
	focus: 'balanced',
	ownFollowUps: '',
	note: '',
	redactPii: false
};
const ctx = {
	brief: { study: study(), priorInterviews: [], guide: [] },
	label: 'P01',
	participantNote: '',
	segments: SEGMENTS
};

const good: Probe = {
	question: 'Walk me through the last time a flood changed your route.',
	probeType: 'example',
	targets: ['RQ2'],
	basis: 'transcript',
	anchors: [{ seg: 1, quote: 'When it floods I check the Facebook group first' }],
	rationale: 'r',
	whenToAsk: 'w',
	priority: 'high'
};

function output(probes: Probe[]): ReflectionOutput {
	return {
		summary: 'sum',
		coverage: [],
		hypotheses: [],
		probes,
		missedOpportunities: [],
		questionCraft: [],
		emergentThemes: [],
		adaptationNotes: []
	};
}

/** Scripted provider: first draft has a repeat + a hallucination, repair fixes it. */
function scripted() {
	const calls: { reflect: ReflectRequest[]; repair: RepairRequest[] } = { reflect: [], repair: [] };
	const provider: LLMProvider = {
		name: 'mock',
		model: 'scripted',
		async reflect(req) {
			calls.reflect.push(req);
			return {
				output: output([
					good,
					{ ...good, question: 'Do you use Google Maps?', probeType: 'process' },
					{ ...good, question: 'Why the MRT?', anchors: [{ seg: 1, quote: 'I love the MRT' }] }
				]),
				usage: { ...emptyUsage(), inputTokens: 100, outputTokens: 10, calls: 1 }
			};
		},
		async repair(req) {
			calls.repair.push(req);
			return {
				output: {
					probes: [
						{
							...good,
							question: 'How did your sister find out about the shortcut through Sucat?',
							anchors: [{ seg: 3, quote: 'My sister told me about the shortcut through Sucat' }],
							priority: 'medium'
						}
					]
				},
				usage: { ...emptyUsage(), inputTokens: 50, cacheReadTokens: 90, outputTokens: 5, calls: 1 }
			};
		},
		liveAssist: () => Promise.reject(new Error('n/a')),
		refine: () => Promise.reject(new Error('n/a'))
	};
	return { provider, calls };
}

describe('reflectPipeline', () => {
	it('verifies, repairs rejected probes once, and reports what was filtered', async () => {
		const { provider, calls } = scripted();
		const out = await reflectPipeline(provider, ctx, config);
		expect(calls.reflect[0].candidates).toBe(4); // probeCount + spares
		expect(calls.repair).toHaveLength(1);
		expect(calls.repair[0].rejected.map((r) => r.reason).join(' ')).toMatch(
			/already asked|verbatim/
		);
		expect(out.result.probes.map((p) => p.question)).toEqual([
			good.question,
			'How did your sister find out about the shortcut through Sucat?'
		]);
		expect(out.result.probes[1].repaired).toBe(true);
		expect(out.result.rejected).toHaveLength(2);
		expect(out.warnings.join(' ')).toMatch(/repeated a question you already asked/);
		expect(out.usage).toMatchObject({ calls: 2, inputTokens: 150, cacheReadTokens: 90 });
	});

	it("excludes the researcher's own follow-ups", async () => {
		const { provider } = scripted();
		const out = await reflectPipeline(provider, ctx, {
			...config,
			probeCount: 1,
			ownFollowUps: '- Walk me through the last time a flood changed your route'
		});
		expect(out.result.probes[0].question).not.toBe(good.question);
	});

	it('warns about short transcripts', async () => {
		const out = await reflectPipeline(new MockProvider(), ctx, config);
		expect(out.warnings.join(' ')).toMatch(/short/);
	});
});

describe('runReflection (persisted)', () => {
	it('runs the demo study end to end with the mock provider', async () => {
		const db = await testDb();
		const { interview } = await seedDemoStudy(
			db,
			readFileSync('src/lib/server/demo/commute-p01-taglish.txt', 'utf8')
		);
		const run = await repo.createReflection(db, {
			interviewId: interview.id,
			config: { ...config, probeCount: 5, redactPii: true },
			provider: 'mock',
			model: 'mock'
		});
		const stages: string[] = [];
		await runReflection(db, new MockProvider(), run.id, { onStage: (s) => void stages.push(s) });
		const done = await repo.getReflection(db, run.id);
		expect(done?.status).toBe('done');
		expect(done?.result?.probes).toHaveLength(5);
		expect(done?.result?.probes.every((p) => p.basis === 'gap' || p.anchors.length > 0)).toBe(true);
		expect(stages[0]).toMatch(/Reading/);
	});

	it('records provider failures on the run', async () => {
		const db = await testDb();
		const s = await repo.createStudy(db, {
			title: 't',
			goal: 'g',
			researchQuestions: ['q'],
			hypotheses: [],
			context: study().context
		});
		const i = await repo.createInterview(db, { studyId: s.id, label: 'P1', source: 'paste' });
		await repo.replaceSegments(db, i.id, SEGMENTS);
		const run = await repo.createReflection(db, {
			interviewId: i.id,
			config,
			provider: 'x',
			model: 'x'
		});
		const failing = { ...scripted().provider, reflect: () => Promise.reject(new Error('boom')) };
		await runReflection(db, failing, run.id);
		expect(await repo.getReflection(db, run.id)).toMatchObject({ status: 'error', error: 'boom' });
	});
});

describe('helpers', () => {
	it('parses own follow-ups from bullet lists', () => {
		expect(parseOwnFollowUps('- one thing?\n2) another thing\n\n* ok')).toEqual([
			'one thing?',
			'another thing'
		]);
	});

	it('drops live nudges that repeat asked questions', () => {
		const kept = filterNudges(
			[
				{ probe: 'How did you get to work today?', anchor: null },
				{
					probe: 'What do the drivers post in that Facebook group?',
					anchor: { seg: 1, quote: 'the drivers post updates there' }
				}
			],
			SEGMENTS
		);
		expect(kept.map((k) => k.probe)).toEqual(['What do the drivers post in that Facebook group?']);
	});
});
