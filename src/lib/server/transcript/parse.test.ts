import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { inferRoles, parseTranscript } from './parse';

describe('parseTranscript', () => {
	it('parses the 2022 study transcript: aliases, header lines and wrapped turns', () => {
		const text = readFileSync('src/lib/server/demo/commute-p01-taglish.txt', 'utf8');
		const r = parseTranscript(text);
		expect(r.format).toBe('labelled');
		expect(r.header).toEqual(['Respondent No: 1', 'Date Interviewed: October 2, 2022']);
		expect(r.speakers.map((s) => [s.speaker, s.role])).toEqual([
			['Interviewer', 'interviewer'],
			['Respondent', 'participant']
		]);
		// "I:" and "R:" are folded into the "Interviewer (I)" / "Respondent (R)" speakers.
		expect(r.segments[2].speaker).toBe('Interviewer');
		// Wrapped lines are joined into one turn.
		expect(r.segments[2].text).toBe(
			'Since you commute, what do you typically use? What kinds of public transportation?'
		);
	});

	it('parses WebVTT with Teams voice tags and timestamps', () => {
		const vtt = `WEBVTT

00:00:01.000 --> 00:00:03.500
<v Ana Reyes>How do you usually get to the office?</v>

00:00:04.000 --> 00:00:09.000
<v Ben Cruz>Mostly by bus, unless it rains.</v>

00:00:09.500 --> 00:00:11.000
<v Ben Cruz>Then I book a Grab.</v>`;
		const r = parseTranscript(vtt);
		expect(r.format).toBe('vtt');
		expect(r.segments).toHaveLength(2); // consecutive Ben cues merged
		expect(r.segments[1]).toMatchObject({
			speaker: 'Ben Cruz',
			text: 'Mostly by bus, unless it rains. Then I book a Grab.',
			startMs: 4000,
			endMs: 11000
		});
		expect(r.segments[0].role).toBe('interviewer');
		expect(r.segments[1].role).toBe('participant');
	});

	it('parses Zoom-style VTT with "Name: text" lines', () => {
		const vtt = `WEBVTT

1
00:00:01.000 --> 00:00:02.000
Moderator: What tools do you use to plan a trip?

2
00:00:02.500 --> 00:00:06.000
Participant 1: Waze, and sometimes I ask the guard.`;
		const r = parseTranscript(vtt);
		expect(r.segments.map((s) => s.role)).toEqual(['interviewer', 'participant']);
	});

	it('parses SRT', () => {
		const srt = `1
00:00:01,000 --> 00:00:02,000
Interviewer: Tell me about your commute.

2
00:00:02,500 --> 00:00:05,000
Participant: It takes two hours each way.`;
		const r = parseTranscript(srt);
		expect(r.format).toBe('srt');
		expect(r.segments[1]).toMatchObject({ role: 'participant', startMs: 2500 });
	});

	it('falls back to paragraphs for unlabelled text', () => {
		const r = parseTranscript('First paragraph about buses.\n\nSecond paragraph about trains.');
		expect(r.format).toBe('unlabelled');
		expect(r.segments).toHaveLength(2);
		expect(r.segments[0].role).toBe('unknown');
	});

	it('handles timestamps before labels', () => {
		const r = parseTranscript(
			'[00:01] Q: How was it?\n[00:05] Maria: It was fine.\n[00:09] Q: Why?\n[00:12] Maria: Because the bus was early.'
		);
		expect(r.segments[1]).toMatchObject({ speaker: 'Maria', role: 'participant', startMs: 5000 });
	});
});

describe('inferRoles', () => {
	it('picks the question-asker as interviewer for diarized speakers', () => {
		const roles = inferRoles([
			{ speaker: 'Speaker 1', text: 'How do you plan your route?' },
			{
				speaker: 'Speaker 2',
				text: 'I usually check the app, then I ask friends who live nearby and know the area well.'
			},
			{ speaker: 'Speaker 1', text: 'Why friends?' },
			{
				speaker: 'Speaker 2',
				text: 'They know shortcuts the app does not show, especially during rush hour traffic.'
			}
		]);
		expect(roles.get('Speaker 1')).toBe('interviewer');
		expect(roles.get('Speaker 2')).toBe('participant');
	});

	it('marks a barely-speaking third party as observer', () => {
		const roles = inferRoles([
			{ speaker: 'A1', text: 'What happened next?' },
			{
				speaker: 'B1',
				text: 'I missed the bus and had to walk all the way to the station in the rain.'
			},
			{ speaker: 'A1', text: 'How did that feel?' },
			{
				speaker: 'B1',
				text: 'Honestly pretty frustrating because nobody told me the schedule had changed.'
			},
			{ speaker: 'C1', text: 'Sorry, I joined late.' }
		]);
		expect(roles.get('A1')).toBe('interviewer');
		expect(roles.get('C1')).toBe('observer');
	});
});
