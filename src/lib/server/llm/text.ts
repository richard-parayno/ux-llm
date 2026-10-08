/** Small, dependency-free text utilities used by the verifier and the mock provider. */

export function normalize(s: string): string {
	return s
		.normalize('NFKD')
		.replace(/[̀-ͯ]/g, '')
		.toLowerCase()
		.replace(/[‘’‚‛′]/g, "'")
		.replace(/[“”„″]/g, '"')
		.replace(/[–—−]/g, '-')
		.replace(/[^\p{L}\p{N}'\s]/gu, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

/** English + common Filipino function words (the paper's interviews were Taglish). */
const STOPWORDS = new Set(
	`a an the and or but so if then than that this these those to of in on at by for from with about as into
	 is are was were be been being am do does did done have has had having can could would will should shall may might must
	 i me my mine we us our you your yours he him his she her they them their it its what which who whom whose when where why how
	 there here just really very also too not no yes ok okay like um uh yeah oh well kind sort lot any some more most
	 actually normally usually basically probably maybe always never sometimes something thing things going get got go ever even still much many one two
	 po ba ng na sa ang mga yung yun ko mo niyo nila siya kayo ako ka din rin lang naman pa ano kasi tapos pag para
	 hindi pero kung iyon iyan doon dito eh talaga ganun ganon parang mismo sila kami namin natin nga ito yan oo opo ngayon may wala meron mayroon nung nang si ni kay`
		.split(/\s+/)
		.filter(Boolean)
);

export function contentTokens(s: string): string[] {
	return normalize(s)
		.split(' ')
		.filter((t) => t.length > 1 && !STOPWORDS.has(t));
}

export function tokens(s: string): string[] {
	return normalize(s).split(' ').filter(Boolean);
}

/** Crude suffix stripping so "formulating" ≈ "formulate" and "routes" ≈ "route". */
export function stem(t: string): string {
	if (t.length <= 4) return t;
	const stripped = t.replace(/(ings|ing|edly|ed|ies|es|s|ions|ion|ly)$/, '');
	return (stripped.length >= 3 ? stripped : t).replace(/e$/, '');
}

function trigrams(s: string): Map<string, number> {
	const n = ` ${normalize(s)} `;
	const out = new Map<string, number>();
	for (let i = 0; i < n.length - 2; i++) {
		const g = n.slice(i, i + 3);
		out.set(g, (out.get(g) ?? 0) + 1);
	}
	return out;
}

function dice(a: Map<string, number>, b: Map<string, number>): number {
	let inter = 0;
	let total = 0;
	for (const [g, c] of a) {
		inter += Math.min(c, b.get(g) ?? 0);
		total += c;
	}
	for (const c of b.values()) total += c;
	return total === 0 ? 0 : (2 * inter) / total;
}

/**
 * Similarity of two questions in [0, 1]: the mean of content-word Jaccard and
 * character-trigram Dice. Robust to small rewordings, cheap, deterministic.
 */
export function questionSimilarity(a: string, b: string): number {
	const ta = new Set(contentTokens(a).map(stem));
	const tb = new Set(contentTokens(b).map(stem));
	let inter = 0;
	for (const t of ta) if (tb.has(t)) inter++;
	const union = ta.size + tb.size - inter;
	const jaccard = union === 0 ? 0 : inter / union;
	return 0.5 * jaccard + 0.5 * dice(trigrams(a), trigrams(b));
}

const QUESTION_WORD =
	/^(so|and|but|okay|ok|um|uh|alright)?[\s,]*(what|how|why|when|where|who|which|whose|can|could|would|do|does|did|is|are|was|were|have|has|had|will|should|tell me|walk me|describe|ano|paano|bakit|saan|kailan|sino|gaano)\b/i;

/** Pull the individual questions out of an interviewer turn. */
export function extractQuestions(text: string): string[] {
	const sentences = text
		.replace(/\s+/g, ' ')
		.split(/(?<=[?.!])\s+/)
		.map((s) => s.trim())
		.filter(Boolean);
	return sentences.filter((s) => s.endsWith('?') || QUESTION_WORD.test(s));
}

const CLOSED_START =
	/^(so\s+|and\s+|but\s+)?(do|does|did|is|are|was|were|have|has|had|can|could|would|will|should|shall|may|might|must|isn't|aren't|didn't|don't|doesn't|wasn't|weren't|haven't|hasn't)\b/i;
const OPENER =
	/\b(how|why|what|which|tell me|walk me|describe|elaborate|explain|share|in what way)\b/i;

/** Yes/no questions ("Do you use Google Maps?") — the paper asked the model to avoid these. */
export function isClosedQuestion(q: string): boolean {
	const first = q.trim().split(/(?<=[?.!])\s+/)[0] ?? q;
	return CLOSED_START.test(first.trim()) && !OPENER.test(first);
}

export function countQuestions(q: string): number {
	return (q.match(/\?/g) ?? []).length;
}

export function wordCount(s: string): number {
	return s.split(/\s+/).filter(Boolean).length;
}
