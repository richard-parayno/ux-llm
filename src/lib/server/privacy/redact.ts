/**
 * Lightweight, deterministic PII redaction applied to transcript text *before*
 * it leaves the server for an LLM. It is a safety net, not a guarantee: names
 * in free speech are only caught if the researcher lists them.
 *
 * Placeholders are stable within one transcript ("[EMAIL_1]" always refers to
 * the same address) so the model can still reason about references.
 */
import type { Segment } from '#lib/domain.js';

const PATTERNS: { kind: string; re: RegExp }[] = [
	{ kind: 'EMAIL', re: /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.[\p{L}]{2,}/gu },
	{ kind: 'URL', re: /\bhttps?:\/\/[^\s)]+/gi },
	// Phone numbers: +63 917 123 4567, (555) 123-4567, 0917-123-4567 …
	{
		kind: 'PHONE',
		re: /(?<!\w)(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{2,4}\)[\s.-]?)?\d{3,4}[\s.-]\d{3,4}(?:[\s.-]\d{2,4})?(?!\w)/g
	},
	{ kind: 'ID_NUMBER', re: /\b\d{9,}\b/g }
];

export interface RedactionOptions {
	/** Extra literal strings to mask, e.g. participant and colleague names. */
	names?: string[];
}

export function redactSegments<T extends Pick<Segment, 'text'>>(
	segs: T[],
	opts: RedactionOptions = {}
): { segments: T[]; count: number } {
	const seen = new Map<string, string>();
	const counters = new Map<string, number>();
	let count = 0;
	const placeholder = (kind: string, value: string) => {
		const key = `${kind}:${value.toLowerCase()}`;
		let p = seen.get(key);
		if (!p) {
			const n = (counters.get(kind) ?? 0) + 1;
			counters.set(kind, n);
			p = `[${kind}_${n}]`;
			seen.set(key, p);
		}
		count++;
		return p;
	};

	const names = (opts.names ?? []).map((n) => n.trim()).filter((n) => n.length >= 2);
	const nameRe = names.length ? new RegExp(`\\b(${names.map(escapeRe).join('|')})\\b`, 'gi') : null;

	const segments = segs.map((s) => {
		let text = s.text;
		for (const { kind, re } of PATTERNS) text = text.replace(re, (m) => placeholder(kind, m));
		if (nameRe) text = text.replace(nameRe, (m) => placeholder('NAME', m));
		return { ...s, text };
	});
	return { segments, count };
}

function escapeRe(s: string) {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
