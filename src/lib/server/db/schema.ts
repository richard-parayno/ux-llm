import { integer, sqliteTable, text, index } from 'drizzle-orm/sqlite-core';
import type {
	GuideItem,
	ReflectionConfig,
	ReflectionResult,
	ResearchItem,
	StudyContext,
	TokenUsage
} from '#lib/domain.js';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());
const createdAt = () =>
	text('created_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString());

export const studies = sqliteTable('studies', {
	id: id(),
	title: text('title').notNull(),
	goal: text('goal').notNull().default(''),
	researchQuestions: text('research_questions', { mode: 'json' })
		.$type<ResearchItem[]>()
		.notNull()
		.default([]),
	hypotheses: text('hypotheses', { mode: 'json' }).$type<ResearchItem[]>().notNull().default([]),
	context: text('context', { mode: 'json' }).$type<StudyContext>().notNull(),
	createdAt: createdAt(),
	updatedAt: text('updated_at')
		.notNull()
		.$defaultFn(() => new Date().toISOString())
});

export const interviews = sqliteTable(
	'interviews',
	{
		id: id(),
		studyId: text('study_id')
			.notNull()
			.references(() => studies.id, { onDelete: 'cascade' }),
		label: text('label').notNull(),
		participantNote: text('participant_note').notNull().default(''),
		source: text('source', { enum: ['paste', 'file', 'audio', 'live'] }).notNull(),
		status: text('status', { enum: ['draft', 'live', 'ready'] })
			.notNull()
			.default('draft'),
		consentAt: text('consent_at'),
		durationSec: integer('duration_sec'),
		createdAt: createdAt()
	},
	(t) => [index('interviews_study_idx').on(t.studyId)]
);

export const segments = sqliteTable(
	'segments',
	{
		id: id(),
		interviewId: text('interview_id')
			.notNull()
			.references(() => interviews.id, { onDelete: 'cascade' }),
		idx: integer('idx').notNull(),
		speaker: text('speaker').notNull(),
		role: text('role', { enum: ['interviewer', 'participant', 'observer', 'unknown'] }).notNull(),
		text: text('text').notNull(),
		startMs: integer('start_ms'),
		endMs: integer('end_ms')
	},
	(t) => [index('segments_interview_idx').on(t.interviewId, t.idx)]
);

export const reflections = sqliteTable(
	'reflections',
	{
		id: id(),
		interviewId: text('interview_id')
			.notNull()
			.references(() => interviews.id, { onDelete: 'cascade' }),
		status: text('status', { enum: ['queued', 'running', 'done', 'error'] })
			.notNull()
			.default('queued'),
		stage: text('stage').notNull().default(''),
		config: text('config', { mode: 'json' }).$type<ReflectionConfig>().notNull(),
		result: text('result', { mode: 'json' }).$type<ReflectionResult>(),
		warnings: text('warnings', { mode: 'json' }).$type<string[]>().notNull().default([]),
		provider: text('provider').notNull(),
		model: text('model').notNull(),
		usage: text('usage', { mode: 'json' }).$type<TokenUsage>(),
		error: text('error'),
		createdAt: createdAt(),
		finishedAt: text('finished_at')
	},
	(t) => [index('reflections_interview_idx').on(t.interviewId)]
);

export const guideItems = sqliteTable(
	'guide_items',
	{
		id: id(),
		studyId: text('study_id')
			.notNull()
			.references(() => studies.id, { onDelete: 'cascade' }),
		text: text('text').notNull(),
		rationale: text('rationale').notNull().default(''),
		probeType: text('probe_type').$type<GuideItem['probeType']>().notNull().default('manual'),
		targets: text('targets', { mode: 'json' }).$type<string[]>().notNull().default([]),
		status: text('status', { enum: ['active', 'asked', 'archived'] })
			.notNull()
			.default('active'),
		sourceReflectionId: text('source_reflection_id'),
		position: integer('position').notNull().default(0),
		createdAt: createdAt()
	},
	(t) => [index('guide_study_idx').on(t.studyId)]
);

/**
 * What researchers do with each suggestion. Kept for reflection on the tool
 * itself (which probes get used?) and as a source of real eval cases.
 */
export const probeFeedback = sqliteTable('probe_feedback', {
	id: id(),
	reflectionId: text('reflection_id')
		.notNull()
		.references(() => reflections.id, { onDelete: 'cascade' }),
	probeId: text('probe_id').notNull(),
	action: text('action', {
		enum: ['added_to_guide', 'dismissed', 'edited', 'refined', 'helpful', 'not_helpful']
	}).notNull(),
	payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>(),
	createdAt: createdAt()
});
