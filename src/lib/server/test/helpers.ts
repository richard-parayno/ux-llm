import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../db';
import type { Segment, Study } from '#lib/domain.js';
import { DEFAULT_CONTEXT } from '#lib/domain.js';

/** A fresh, migrated database in a temp file (libSQL :memory: doesn't survive transactions). */
export async function testDb() {
	const dir = mkdtempSync(join(tmpdir(), 'intavue-test-'));
	return openDatabase(`file:${join(dir, 'test.db')}`, 'drizzle');
}

export function seg(idx: number, role: Segment['role'], text: string, speaker?: string): Segment {
	return {
		idx,
		role,
		text,
		speaker: speaker ?? (role === 'interviewer' ? 'I' : 'R'),
		startMs: null,
		endMs: null
	};
}

export function study(overrides: Partial<Study> = {}): Study {
	return {
		id: 's1',
		title: 'Commuting',
		goal: 'Understand how commuters plan routes.',
		researchQuestions: [
			{ id: 'RQ1', text: 'How do commuters plan their routes?' },
			{ id: 'RQ2', text: 'How do they adapt to unforeseen circumstances like floods?' }
		],
		hypotheses: [{ id: 'H1', text: 'Commuters rely on word of mouth.' }],
		context: { ...DEFAULT_CONTEXT, topic: 'commuting' },
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		...overrides
	};
}

export const SEGMENTS: Segment[] = [
	seg(0, 'interviewer', 'How did you get to work today?'),
	seg(
		1,
		'participant',
		'I took the bus to Alabang, then a jeepney. When it floods I check the Facebook group first because the drivers post updates there.'
	),
	seg(2, 'interviewer', 'Do you use Google Maps?'),
	seg(
		3,
		'participant',
		'Sometimes, but Grab is easier when I have many stops. My sister told me about the shortcut through Sucat.'
	),
	seg(4, 'interviewer', 'Okay, thank you so much.')
];
