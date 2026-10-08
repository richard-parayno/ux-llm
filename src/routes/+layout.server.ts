import { capabilities } from '#lib/server/app.js';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = () => ({ caps: capabilities() });
