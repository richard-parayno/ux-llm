import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import * as schema from './schema';

export type DB = LibSQLDatabase<typeof schema> & { $client: Client };

/**
 * Open (and migrate) a database. `url` is a libSQL URL: `file:data/app.db`,
 * `:memory:` for tests, or a remote `libsql://` URL for hosted deployments.
 */
export async function openDatabase(url: string, migrationsFolder = 'drizzle'): Promise<DB> {
	if (url.startsWith('file:')) {
		const path = url.slice('file:'.length);
		mkdirSync(dirname(path), { recursive: true });
	}
	const client = createClient({ url });
	const db = drizzle(client, { schema }) as DB;
	await client.execute('PRAGMA foreign_keys = ON');
	await migrate(db, { migrationsFolder });
	return db;
}

export { schema };
