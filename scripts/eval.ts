/**
 * intavue eval harness.
 *
 *   pnpm eval                      # mock provider (offline floor)
 *   ANTHROPIC_API_KEY=… pnpm eval  # Claude (INTAVUE_MODEL, default claude-opus-5-5)
 *   pnpm eval --judge              # + rubric scores from an LLM judge (needs a key)
 *   pnpm eval --runs 3             # repeat each case to see variance
 *
 * Deterministic metrics come from the same verifier the app uses, so they
 * directly measure the failure modes reported in the paper:
 *   - repeat rate      share of drafted probes that re-ask an interviewer question
 *   - ungrounded rate  share of drafted probes whose quotes are not in the transcript
 *   - closed rate      share of drafted yes/no probes
 *   - delivered        probes returned vs. requested after verify → repair
 *   - gap targeting    uncovered research questions that got at least one probe
 * Results are written to eval/results/<timestamp>.{json,md}.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import { CASES, type EvalCase } from '../eval/cases.ts';
import { parseTranscript } from '../src/lib/server/transcript/parse.ts';
import { toResearchItems } from '../src/lib/server/repo.ts';
import { reflectPipeline } from '../src/lib/server/reflect.ts';
import { ClaudeProvider } from '../src/lib/server/llm/claude.ts';
import { MockProvider } from '../src/lib/server/llm/mock.ts';
import type { LLMProvider } from '../src/lib/server/llm/provider.ts';
import type { ReflectionResult, Segment, Study } from '../src/lib/domain.ts';

const args = process.argv.slice(2);
const judge = args.includes('--judge');
const runs = Number(args[args.indexOf('--runs') + 1]) || 1;
const only = args.includes('--case') ? args[args.indexOf('--case') + 1] : null;

const hasKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const providerName = process.env.INTAVUE_LLM_PROVIDER ?? (hasKey ? 'claude' : 'mock');
const model = process.env.INTAVUE_MODEL ?? 'claude-opus-5-5';
const provider: LLMProvider =
	providerName === 'claude'
		? new ClaudeProvider({
				model,
				effort: (process.env.INTAVUE_EFFORT as 'high') ?? 'high'
			})
		: new MockProvider();

function toStudy(c: EvalCase): Study {
	return {
		id: c.id,
		title: c.study.title,
		goal: c.study.goal,
		researchQuestions: toResearchItems(c.study.researchQuestions, 'RQ'),
		hypotheses: toResearchItems(c.study.hypotheses, 'H'),
		context: c.study.context,
		createdAt: '',
		updatedAt: ''
	};
}

function segmentsFor(c: EvalCase): Segment[] {
	const parsed = parseTranscript(c.transcript).segments.slice(0, c.maxTurns);
	return parsed.map((s, idx) => ({ ...s, idx }));
}

const Rubric = z.object({
	probes: z.array(
		z.object({
			index: z.number().int(),
			open: z.number().int().describe('1–5: invites a rich, open answer'),
			nonLeading: z.number().int().describe('1–5: does not presuppose an answer or hypothesis'),
			grounded: z
				.number()
				.int()
				.describe("1–5: clearly follows from the participant's words or a real coverage gap"),
			depth: z.number().int().describe('1–5: likely to surface new insight, not surface facts'),
			speakable: z.number().int().describe('1–5: natural to say aloud to this participant'),
			comment: z.string()
		})
	)
});

async function judgeProbes(c: EvalCase, segs: Segment[], result: ReflectionResult) {
	const client = new Anthropic();
	const msg = await client.beta.messages.parse({
		model,
		max_tokens: 16000,
		betas: ['server-side-fallback-2026-07-01'],
		fallbacks: 'default',
		output_config: { effort: 'medium', format: betaZodOutputFormat(Rubric) },
		system:
			'You are an experienced qualitative UX researcher grading suggested follow-up probes for the next interview session. Be strict and calibrated: 3 means acceptable, 5 means you would definitely use it as-is.',
		messages: [
			{
				role: 'user',
				content: [
					`Research goal: ${c.study.goal}`,
					`Research questions:\n${c.study.researchQuestions.map((q, i) => `RQ${i + 1}: ${q}`).join('\n')}`,
					`Transcript:\n${segs.map((s) => `[${s.idx}] ${s.role.toUpperCase()}: ${s.text}`).join('\n')}`,
					`Probes to grade:\n${result.probes.map((p, i) => `${i}. ${p.question}`).join('\n')}`
				].join('\n\n')
			}
		]
	});
	return msg.parsed_output?.probes ?? [];
}

interface CaseResult {
	case: string;
	run: number;
	ms: number;
	requested: number;
	delivered: number;
	drafted: number;
	repeatRate: number;
	ungroundedRate: number;
	closedRate: number;
	repaired: number;
	exactQuoteShare: number;
	gapTargeting: number | null;
	tokens: { input: number; output: number; cacheRead: number };
	judge?: { mean: number; dims: Record<string, number> };
	probes: string[];
	rejected: { question: string; issues: string[] }[];
	error?: string;
}

const results: CaseResult[] = [];
for (const c of CASES.filter((x) => !only || x.id === only)) {
	for (let run = 1; run <= runs; run++) {
		const segs = segmentsFor(c);
		const study = toStudy(c);
		const started = Date.now();
		process.stdout.write(`${c.id} #${run} … `);
		try {
			const out = await reflectPipeline(
				provider,
				{
					brief: { study, priorInterviews: [], guide: [] },
					label: c.id,
					participantNote: '',
					segments: segs
				},
				{
					probeCount: c.probeCount,
					focus: 'balanced',
					ownFollowUps: '',
					note: '',
					redactPii: false
				}
			);
			const r = out.result;
			const all = [...r.probes, ...r.rejected];
			const share = (issue: string) =>
				all.length
					? all.filter((p) => p.checks.issues.includes(issue as never)).length / all.length
					: 0;
			const anchors = r.probes.flatMap((p) => p.anchors);
			const uncovered = r.coverage.filter((cv) => cv.status !== 'addressed').map((cv) => cv.rqId);
			const targeted = new Set(r.probes.flatMap((p) => p.targets));
			const row: CaseResult = {
				case: c.id,
				run,
				ms: Date.now() - started,
				requested: c.probeCount,
				delivered: r.probes.length,
				drafted: all.length,
				repeatRate: share('repeats_asked_question'),
				ungroundedRate: share('ungrounded'),
				closedRate: share('closed_question'),
				repaired: r.probes.filter((p) => p.repaired).length,
				exactQuoteShare: anchors.length
					? anchors.filter((a) => a.grounding === 'exact').length / anchors.length
					: 1,
				gapTargeting: uncovered.length
					? uncovered.filter((id) => targeted.has(id)).length / uncovered.length
					: null,
				tokens: {
					input: out.usage.inputTokens,
					output: out.usage.outputTokens,
					cacheRead: out.usage.cacheReadTokens
				},
				probes: r.probes.map((p) => p.question),
				rejected: r.rejected.map((p) => ({ question: p.question, issues: p.checks.issues }))
			};
			if (judge && hasKey) {
				const scores = await judgeProbes(c, segs, r);
				const dims = ['open', 'nonLeading', 'grounded', 'depth', 'speakable'] as const;
				const avg = (k: (typeof dims)[number]) =>
					scores.reduce((n, s) => n + s[k], 0) / Math.max(1, scores.length);
				const dimScores = Object.fromEntries(dims.map((d) => [d, Math.round(avg(d) * 100) / 100]));
				row.judge = {
					mean: Math.round((dims.reduce((n, d) => n + avg(d), 0) / dims.length) * 100) / 100,
					dims: dimScores
				};
			}
			results.push(row);
			console.log(
				`${row.delivered}/${row.requested} probes, repeats ${pct(row.repeatRate)}, ${row.ms} ms`
			);
		} catch (e) {
			const error = e instanceof Error ? e.message : String(e);
			console.log(`failed: ${error}`);
			results.push({
				case: c.id,
				run,
				ms: Date.now() - started,
				requested: c.probeCount,
				delivered: 0,
				drafted: 0,
				repeatRate: 0,
				ungroundedRate: 0,
				closedRate: 0,
				repaired: 0,
				exactQuoteShare: 0,
				gapTargeting: null,
				tokens: { input: 0, output: 0, cacheRead: 0 },
				probes: [],
				rejected: [],
				error
			});
		}
	}
}

function pct(n: number | null) {
	return n === null ? '—' : `${Math.round(n * 100)}%`;
}

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
mkdirSync('eval/results', { recursive: true });
const meta = {
	provider: provider.name,
	model: provider.model,
	judge: judge && hasKey,
	runs,
	at: new Date().toISOString()
};
writeFileSync(`eval/results/${stamp}.json`, JSON.stringify({ meta, results }, null, 2));

const md = [
	`# intavue eval — ${meta.at}`,
	'',
	`Provider: **${meta.provider}** (${meta.model})${meta.judge ? ' · LLM judge on' : ''}`,
	'',
	'| case | run | delivered | drafted | repeats | ungrounded | closed | repaired | exact quotes | gap targeting | judge | ms |',
	'|---|---|---|---|---|---|---|---|---|---|---|---|',
	...results.map(
		(r) =>
			`| ${r.case} | ${r.run} | ${r.delivered}/${r.requested} | ${r.drafted} | ${pct(r.repeatRate)} | ${pct(r.ungroundedRate)} | ${pct(r.closedRate)} | ${r.repaired} | ${pct(r.exactQuoteShare)} | ${pct(r.gapTargeting)} | ${r.judge?.mean ?? '—'} | ${r.ms} |${r.error ? ` ⚠ ${r.error}` : ''}`
	),
	'',
	'## Probes',
	...results.flatMap((r) => [
		'',
		`### ${r.case} #${r.run}`,
		...r.probes.map((q, i) => `${i + 1}. ${q}`),
		...(r.rejected.length
			? [
					'',
					'_Filtered out:_',
					...r.rejected.map((x) => `- ~~${x.question}~~ (${x.issues.join(', ')})`)
				]
			: [])
	])
].join('\n');
writeFileSync(`eval/results/${stamp}.md`, md + '\n');
console.log(`\nWrote eval/results/${stamp}.md`);
if (results.some((r) => r.error)) process.exitCode = 1;
