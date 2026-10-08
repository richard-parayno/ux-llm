import type { ServerInit } from '@sveltejs/kit/hooks';
import { getDb } from '#lib/server/app.js';

export const init: ServerInit = async () => {
	await getDb();
};
