/**
 * Application wiring: the only server module that reads environment
 * variables. Everything else receives its dependencies explicitly.
 */
import {
	ANTHROPIC_API_KEY,
	DATABASE_URL,
	DEEPGRAM_API_KEY,
	DEEPGRAM_MODEL,
	INTAVUE_EFFORT,
	INTAVUE_LIVE_MODEL,
	INTAVUE_LLM_PROVIDER,
	INTAVUE_MODEL
} from '$app/env/private';
import { openDatabase, type DB } from './db';
import { ClaudeProvider } from './llm/claude';
import { MockProvider } from './llm/mock';
import type { LLMProvider } from './llm/provider';
import { DeepgramTranscriber } from './stt/deepgram';
import { runReflection } from './reflect';
import * as repo from './repo';
import { reflections } from './db/schema';
import { inArray } from 'drizzle-orm';

let dbPromise: Promise<DB> | null = null;

export function getDb(): Promise<DB> {
	dbPromise ??= openDatabase(DATABASE_URL).then(async (db) => {
		// Runs that were in flight when the server stopped will never finish.
		await db
			.update(reflections)
			.set({
				status: 'error',
				stage: 'Interrupted',
				error: 'The server restarted during this run.'
			})
			.where(inArray(reflections.status, ['queued', 'running']));
		return db;
	});
	return dbPromise;
}

function hasClaudeCredentials() {
	return Boolean(ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

let provider: LLMProvider | null = null;
export function getProvider(): LLMProvider {
	if (provider) return provider;
	const kind = INTAVUE_LLM_PROVIDER ?? (hasClaudeCredentials() ? 'claude' : 'mock');
	provider =
		kind === 'claude'
			? new ClaudeProvider({
					apiKey: ANTHROPIC_API_KEY,
					model: INTAVUE_MODEL,
					liveModel: INTAVUE_LIVE_MODEL,
					effort: INTAVUE_EFFORT
				})
			: new MockProvider({ delayMs: 700 });
	return provider;
}

let transcriber: DeepgramTranscriber | null | undefined;
export function getTranscriber(): DeepgramTranscriber | null {
	if (transcriber === undefined)
		transcriber = DEEPGRAM_API_KEY
			? new DeepgramTranscriber({ apiKey: DEEPGRAM_API_KEY, model: DEEPGRAM_MODEL })
			: null;
	return transcriber;
}

export function capabilities() {
	const p = getProvider();
	return {
		llm: p.name,
		model: p.model,
		demoMode: p.name === 'mock',
		stt: getTranscriber() ? 'deepgram' : null,
		sttModel: DEEPGRAM_MODEL
	};
}
export type Capabilities = ReturnType<typeof capabilities>;

// ---------------------------------------------------------------------------
// Background reflection jobs (in-process; a single Node server is the target).
// ---------------------------------------------------------------------------

const running = new Map<string, AbortController>();

export function startReflection(db: DB, reflectionId: string) {
	const controller = new AbortController();
	running.set(reflectionId, controller);
	void runReflection(db, getProvider(), reflectionId, { signal: controller.signal }).finally(() =>
		running.delete(reflectionId)
	);
}

export async function cancelReflection(db: DB, reflectionId: string) {
	running.get(reflectionId)?.abort(new Error('Cancelled by the researcher.'));
	running.delete(reflectionId);
	await repo.updateReflection(db, reflectionId, {
		status: 'error',
		stage: 'Cancelled',
		error: 'Cancelled by the researcher.',
		finishedAt: new Date().toISOString()
	});
}
