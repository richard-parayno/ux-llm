<script lang="ts">
	const changes = [
		{
			finding:
				'GPT-3.5 with a 16K window forced chunking, map-reduce prompts and a vector store; outputs were free text the UI displayed raw.',
			now: 'Claude with a 1M-token window reads the whole interview — and every earlier interview in the study — in one pass. Output is schema-validated JSON (structured outputs), so every probe, quote and coverage judgement is a typed object the UI can link, filter and verify.'
		},
		{
			finding:
				'Transcripts had to be produced by a moderator and pasted in by hand; speech-to-text was not reliable enough.',
			now: 'Upload a recording or run the session live: Deepgram Nova-3 transcribes with speaker diarization (including code-switched speech), and Zoom/Teams/Meet caption files are parsed directly.'
		},
		{
			finding:
				'With short transcripts the model sometimes returned a question the interviewer had already asked (§6).',
			now: 'A deterministic verifier compares every suggestion against every question already asked, against your guide and against your own follow-ups, and rejects repeats. Rejected probes are regenerated once with the reasons, and anything still failing is shown — never silently dropped.'
		},
		{
			finding:
				'Participants questioned the reliability of outputs and checked them against their expectations (P03, P12).',
			now: 'Every anchor quote is located in the transcript and marked “verified” or “close match”; unverifiable ones are removed. Click any quote to jump to it. Hypotheses get evidence for and against, and are never assumed true.'
		},
		{
			finding:
				'Five probes (“the quintet”) was too few for 45+ minute interviews; participants wanted to choose up to ten (P02–P12).',
			now: 'Choose 1–15 probes; the default scales with session length. Pick a focus — go deeper on what was said, or fill research-question gaps.'
		},
		{
			finding:
				'Real-time feedback risked cognitive load, so the tool was post-interview only; real-time detection of pain points and themes was future work.',
			now: 'Post-interview reflection is still the main mode. An optional live mode is designed for glanceability: coverage dots, your guide as a checklist, at most two short nudges, rate-limited and pausable.'
		},
		{
			finding:
				'Interviewers from a different culture than the participant had to rework their scripts themselves (P03, P08).',
			now: 'Describe your participants and interview language; probes use the participant’s own terms and language mix (e.g. Taglish), adaptation notes flag cultural assumptions, and one-click refinements rephrase for non-native speakers.'
		},
		{
			finding:
				'Participants wanted agency over AI output and raised consent and data concerns (P05, P06, P10).',
			now: 'Write your own follow-ups first if you like; edit, refine, dismiss or rate any suggestion; only what you keep enters the guide. Processing requires a consent confirmation, personal data can be masked before anything leaves the server, and audio is never stored.'
		},
		{
			finding: 'Each interview was handled in isolation.',
			now: 'Studies hold many interviews. Coverage is tracked per research question across sessions, and the guide you build carries into the next interview — including live mode, which ticks questions off as you ask them.'
		}
	];
</script>

<svelte:head><title>How it works · intavue</title></svelte:head>

<div class="mx-auto max-w-4xl px-4 py-12 sm:px-6">
	<p class="eyebrow">How it works</p>
	<h1 class="mt-2 text-5xl">From the 2023 prototype to now</h1>
	<p class="mt-5 text-fg-2">
		intavue.ai began as a research prototype for <em
			>The Probing Machine: Can Using GenAI Tools Help With Better Reflections During User
			Interviews</em
		>. Validation (n=6) and between-subject (n=12) studies found it useful for reflecting between
		interviews — and surfaced clear limitations. This version is a rebuild around those findings.
	</p>

	<ol class="mt-10 space-y-5">
		{#each changes as c, i (i)}
			<li class="card grid gap-4 sm:grid-cols-2">
				<div>
					<p class="eyebrow mb-1">What the study found</p>
					<p class="text-sm text-fg-2">{c.finding}</p>
				</div>
				<div>
					<p class="eyebrow mb-1 text-brand">What intavue does now</p>
					<p class="text-sm">{c.now}</p>
				</div>
			</li>
		{/each}
	</ol>

	<section class="mt-12">
		<h2 class="text-3xl">The reflection pipeline</h2>
		<ol class="mt-4 list-decimal space-y-2 pl-5 text-sm text-fg-2">
			<li>
				<strong class="text-fg">Context.</strong> Study goal, research questions, hypotheses, participant
				profile, your guide and earlier interviews form a cached prefix.
			</li>
			<li>
				<strong class="text-fg">Generate.</strong> The model reflects on the full transcript and drafts
				a few more probes than you asked for, each tied to quotes and research questions.
			</li>
			<li>
				<strong class="text-fg">Verify.</strong> Code — not the model — checks every quote against the
				transcript, rejects repeats of asked questions, duplicates, yes/no and double-barreled questions.
			</li>
			<li>
				<strong class="text-fg">Repair.</strong> Rejected probes go back to the model once with the reasons.
				The best verified probes are kept.
			</li>
			<li>
				<strong class="text-fg">Decide.</strong> You keep, edit, refine or dismiss. What you keep becomes
				the guide for the next session.
			</li>
		</ol>
	</section>
</div>
