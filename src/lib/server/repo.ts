/**
 * Data access. Every function takes the database explicitly so the same code
 * runs inside SvelteKit, in unit tests (`:memory:`) and in the eval scripts.
 */
import { and, asc, desc, eq, inArray, max } from 'drizzle-orm';
import type { DB } from './db';
import { guideItems, interviews, probeFeedback, reflections, segments, studies } from './db/schema';
import type {
	GuideItem,
	Interview,
	InterviewSource,
	ReflectionConfig,
	ReflectionRun,
	ResearchItem,
	Segment,
	SpeakerRole,
	Study,
	StudyContext
} from '#lib/domain.js';

// ---------------------------------------------------------------------------
// Studies
// ---------------------------------------------------------------------------

export interface StudyInput {
	title: string;
	goal: string;
	researchQuestions: string[];
	hypotheses: string[];
	context: StudyContext;
}

/** Assign stable ids (RQ1, RQ2… / H1, H2…), keeping ids of unchanged items. */
export function toResearchItems(
	texts: string[],
	prefix: 'RQ' | 'H',
	previous: ResearchItem[] = []
): ResearchItem[] {
	const cleaned = texts.map((t) => t.trim()).filter(Boolean);
	const used = new Set<string>();
	const byText = new Map(previous.map((p) => [p.text, p.id]));
	let next = previous.reduce((m, p) => Math.max(m, Number(p.id.slice(prefix.length)) || 0), 0) + 1;
	return cleaned.map((text) => {
		const existing = byText.get(text);
		if (existing && !used.has(existing)) {
			used.add(existing);
			return { id: existing, text };
		}
		const id = `${prefix}${next++}`;
		used.add(id);
		return { id, text };
	});
}

export async function createStudy(db: DB, input: StudyInput): Promise<Study> {
	const [row] = await db
		.insert(studies)
		.values({
			title: input.title,
			goal: input.goal,
			researchQuestions: toResearchItems(input.researchQuestions, 'RQ'),
			hypotheses: toResearchItems(input.hypotheses, 'H'),
			context: input.context
		})
		.returning();
	return row;
}

export async function updateStudy(db: DB, id: string, input: StudyInput): Promise<Study> {
	const current = await getStudy(db, id);
	if (!current) throw new Error('Study not found');
	const [row] = await db
		.update(studies)
		.set({
			title: input.title,
			goal: input.goal,
			researchQuestions: toResearchItems(input.researchQuestions, 'RQ', current.researchQuestions),
			hypotheses: toResearchItems(input.hypotheses, 'H', current.hypotheses),
			context: input.context,
			updatedAt: new Date().toISOString()
		})
		.where(eq(studies.id, id))
		.returning();
	return row;
}

export async function getStudy(db: DB, id: string): Promise<Study | null> {
	const row = await db.query.studies.findFirst({ where: eq(studies.id, id) });
	return row ?? null;
}

export async function listStudies(db: DB): Promise<(Study & { interviewCount: number })[]> {
	const rows = await db.select().from(studies).orderBy(desc(studies.updatedAt));
	const counts = await db
		.select({ studyId: interviews.studyId, id: interviews.id })
		.from(interviews);
	return rows.map((s) => ({
		...s,
		interviewCount: counts.filter((c) => c.studyId === s.id).length
	}));
}

export async function deleteStudy(db: DB, id: string) {
	await db.delete(studies).where(eq(studies.id, id));
}

// ---------------------------------------------------------------------------
// Interviews + transcript segments
// ---------------------------------------------------------------------------

export async function createInterview(
	db: DB,
	input: { studyId: string; label: string; participantNote?: string; source: InterviewSource }
): Promise<Interview> {
	const [row] = await db
		.insert(interviews)
		.values({
			studyId: input.studyId,
			label: input.label,
			participantNote: input.participantNote ?? '',
			source: input.source
		})
		.returning();
	return row;
}

export async function getInterview(db: DB, id: string): Promise<Interview | null> {
	const row = await db.query.interviews.findFirst({ where: eq(interviews.id, id) });
	return row ?? null;
}

export async function listInterviews(db: DB, studyId: string): Promise<Interview[]> {
	return db
		.select()
		.from(interviews)
		.where(eq(interviews.studyId, studyId))
		.orderBy(asc(interviews.createdAt));
}

export async function updateInterview(
	db: DB,
	id: string,
	patch: Partial<
		Pick<Interview, 'label' | 'participantNote' | 'status' | 'consentAt' | 'durationSec' | 'source'>
	>
) {
	await db.update(interviews).set(patch).where(eq(interviews.id, id));
}

export async function deleteInterview(db: DB, id: string) {
	await db.delete(interviews).where(eq(interviews.id, id));
}

export async function getSegments(db: DB, interviewId: string): Promise<Segment[]> {
	const rows = await db
		.select()
		.from(segments)
		.where(eq(segments.interviewId, interviewId))
		.orderBy(asc(segments.idx));
	return rows.map(({ idx, speaker, role, text, startMs, endMs }) => ({
		idx,
		speaker,
		role,
		text,
		startMs,
		endMs
	}));
}

/** Replace the whole transcript (segments are re-indexed 0..n-1). */
export async function replaceSegments(db: DB, interviewId: string, segs: Omit<Segment, 'idx'>[]) {
	await db.transaction(async (tx) => {
		await tx.delete(segments).where(eq(segments.interviewId, interviewId));
		if (segs.length === 0) return;
		// libSQL caps bound parameters per statement; insert in chunks.
		for (let i = 0; i < segs.length; i += 200) {
			await tx.insert(segments).values(
				segs.slice(i, i + 200).map((s, j) => ({
					interviewId,
					idx: i + j,
					speaker: s.speaker,
					role: s.role,
					text: s.text,
					startMs: s.startMs,
					endMs: s.endMs
				}))
			);
		}
	});
}

/** Append live segments after the current last index. */
export async function appendSegments(db: DB, interviewId: string, segs: Omit<Segment, 'idx'>[]) {
	if (segs.length === 0) return;
	const [{ last }] = await db
		.select({ last: max(segments.idx) })
		.from(segments)
		.where(eq(segments.interviewId, interviewId));
	const start = last === null ? 0 : last + 1;
	await db.insert(segments).values(
		segs.map((s, j) => ({
			interviewId,
			idx: start + j,
			speaker: s.speaker,
			role: s.role,
			text: s.text,
			startMs: s.startMs,
			endMs: s.endMs
		}))
	);
}

/** Map raw speaker labels to roles (e.g. after diarization). */
export async function setSpeakerRoles(
	db: DB,
	interviewId: string,
	map: Record<string, SpeakerRole>
) {
	for (const [speaker, role] of Object.entries(map)) {
		await db
			.update(segments)
			.set({ role })
			.where(and(eq(segments.interviewId, interviewId), eq(segments.speaker, speaker)));
	}
}

// ---------------------------------------------------------------------------
// Reflections
// ---------------------------------------------------------------------------

export async function createReflection(
	db: DB,
	input: { interviewId: string; config: ReflectionConfig; provider: string; model: string }
): Promise<ReflectionRun> {
	const [row] = await db.insert(reflections).values(input).returning();
	return row;
}

export async function updateReflection(
	db: DB,
	id: string,
	patch: Partial<Omit<ReflectionRun, 'id' | 'interviewId' | 'createdAt'>>
) {
	await db.update(reflections).set(patch).where(eq(reflections.id, id));
}

export async function getReflection(db: DB, id: string): Promise<ReflectionRun | null> {
	const row = await db.query.reflections.findFirst({ where: eq(reflections.id, id) });
	return row ?? null;
}

export async function listReflections(db: DB, interviewId: string): Promise<ReflectionRun[]> {
	return db
		.select()
		.from(reflections)
		.where(eq(reflections.interviewId, interviewId))
		.orderBy(desc(reflections.createdAt));
}

/** Latest successful reflection per interview, for study-level views. */
export async function latestReflections(
	db: DB,
	interviewIds: string[]
): Promise<Map<string, ReflectionRun>> {
	const out = new Map<string, ReflectionRun>();
	if (interviewIds.length === 0) return out;
	const rows = await db
		.select()
		.from(reflections)
		.where(and(inArray(reflections.interviewId, interviewIds), eq(reflections.status, 'done')))
		.orderBy(desc(reflections.createdAt));
	for (const r of rows) if (!out.has(r.interviewId)) out.set(r.interviewId, r);
	return out;
}

export async function recordFeedback(
	db: DB,
	input: {
		reflectionId: string;
		probeId: string;
		action: (typeof probeFeedback.$inferInsert)['action'];
		payload?: Record<string, unknown>;
	}
) {
	await db.insert(probeFeedback).values(input);
}

export async function listFeedback(db: DB, reflectionId: string) {
	return db.select().from(probeFeedback).where(eq(probeFeedback.reflectionId, reflectionId));
}

// ---------------------------------------------------------------------------
// Interview guide (carried forward into the next session)
// ---------------------------------------------------------------------------

export async function listGuide(db: DB, studyId: string): Promise<GuideItem[]> {
	return db
		.select()
		.from(guideItems)
		.where(eq(guideItems.studyId, studyId))
		.orderBy(asc(guideItems.position), asc(guideItems.createdAt));
}

export async function addGuideItem(
	db: DB,
	input: Pick<GuideItem, 'studyId' | 'text'> &
		Partial<Pick<GuideItem, 'rationale' | 'probeType' | 'targets' | 'sourceReflectionId'>>
): Promise<GuideItem> {
	const [{ last }] = await db
		.select({ last: max(guideItems.position) })
		.from(guideItems)
		.where(eq(guideItems.studyId, input.studyId));
	const [row] = await db
		.insert(guideItems)
		.values({ ...input, position: (last ?? -1) + 1 })
		.returning();
	return row;
}

export async function updateGuideItem(
	db: DB,
	id: string,
	patch: Partial<Pick<GuideItem, 'text' | 'status' | 'position'>>
) {
	await db.update(guideItems).set(patch).where(eq(guideItems.id, id));
}

export async function deleteGuideItem(db: DB, id: string) {
	await db.delete(guideItems).where(eq(guideItems.id, id));
}
