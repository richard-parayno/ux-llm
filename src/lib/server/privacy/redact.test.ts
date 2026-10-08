import { describe, expect, it } from 'vitest';
import { redactSegments } from './redact';

describe('redactSegments', () => {
	it('masks emails, phones and listed names with stable placeholders', () => {
		const { segments, count } = redactSegments(
			[
				{ text: 'Email me at maria.santos@example.com or call +63 917 123 4567.' },
				{ text: 'Maria said maria.santos@example.com is best.' }
			],
			{ names: ['Maria'] }
		);
		expect(segments[0].text).toBe('Email me at [EMAIL_1] or call [PHONE_1].');
		expect(segments[1].text).toBe('[NAME_1] said [EMAIL_1] is best.');
		expect(count).toBe(4);
	});

	it('leaves ordinary numbers alone', () => {
		const { segments } = redactSegments([{ text: 'It takes 45 minutes and costs 20 pesos.' }]);
		expect(segments[0].text).toBe('It takes 45 minutes and costs 20 pesos.');
	});
});
