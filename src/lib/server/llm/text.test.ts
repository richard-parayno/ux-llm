import { describe, expect, it } from 'vitest';
import { extractQuestions, isClosedQuestion, normalize, questionSimilarity } from './text';
import { REPEAT_THRESHOLD } from './verify';

describe('text utilities', () => {
	it('normalizes punctuation, case and diacritics', () => {
		expect(normalize('“Parañaque”—it’s FAR!')).toBe("paranaque - it's far".replace(' - ', ' '));
	});

	it('detects closed questions but not open ones', () => {
		expect(isClosedQuestion('Do you use Google Maps?')).toBe(true);
		expect(isClosedQuestion('Is it faster?')).toBe(true);
		expect(isClosedQuestion('Can you walk me through the last trip?')).toBe(false);
		expect(isClosedQuestion('Could you elaborate on that?')).toBe(false);
		expect(isClosedQuestion('How do you decide?')).toBe(false);
		expect(isClosedQuestion('Why does that matter to you?')).toBe(false);
	});

	it('extracts questions from an interviewer turn', () => {
		expect(
			extractQuestions('Okay, thanks. So how did you plan it? And was it the usual route? Great.')
		).toEqual(['So how did you plan it?', 'And was it the usual route?']);
		expect(extractQuestions('Ano po profession niyo?')).toEqual(['Ano po profession niyo?']);
	});

	it('scores rewordings of an asked question as repeats, and new probes as distinct', () => {
		const asked = 'How did you formulate this route?';
		expect(questionSimilarity(asked, 'How did you formulate that route?')).toBeGreaterThanOrEqual(
			REPEAT_THRESHOLD
		);
		expect(
			questionSimilarity(asked, 'How did you go about formulating this route?')
		).toBeGreaterThanOrEqual(REPEAT_THRESHOLD);
		expect(
			questionSimilarity(asked, 'When Grab shows heavy traffic, what do you do differently?')
		).toBeLessThan(REPEAT_THRESHOLD);
		expect(
			questionSimilarity(asked, 'Walk me through the last time a route you planned went wrong.')
		).toBeLessThan(REPEAT_THRESHOLD);
	});
});
