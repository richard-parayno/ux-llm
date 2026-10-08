<script lang="ts">
	import { enhance } from '$app/forms';

	interface Values {
		title: string;
		goal: string;
		researchQuestions: string;
		hypotheses: string;
		topic: string;
		participantProfile: string;
		interviewLanguage: string;
		outputLanguage: string;
		sessionMinutes: string;
	}

	let {
		values,
		errors = {},
		submitLabel
	}: { values: Values; errors?: Record<string, string>; submitLabel: string } = $props();
	let busy = $state(false);
</script>

<form
	method="POST"
	class="space-y-8"
	use:enhance={() => {
		busy = true;
		return async ({ update }) => {
			await update({ reset: false });
			busy = false;
		};
	}}
>
	<fieldset class="card space-y-5">
		<legend class="eyebrow px-1">Research plan</legend>
		<div>
			<label class="label" for="title">Study title</label>
			<input class="input" id="title" name="title" value={values.title} required maxlength="200" />
			{#if errors.title}<p class="hint text-bad">{errors.title}</p>{/if}
		</div>
		<div>
			<label class="label" for="goal">Research goal</label>
			<textarea class="input min-h-24" id="goal" name="goal" required>{values.goal}</textarea>
			{#if errors.goal}<p class="hint text-bad">{errors.goal}</p>{/if}
		</div>
		<div>
			<label class="label" for="rqs"
				>Research questions <span class="text-muted">— one per line</span></label
			>
			<textarea
				class="input min-h-28"
				id="rqs"
				name="researchQuestions"
				placeholder="How do commuters decide on their route?"
				required>{values.researchQuestions}</textarea
			>
			<p class="hint">Each becomes RQ1, RQ2… so probes and coverage can point back to it.</p>
			{#if errors.researchQuestions}<p class="hint text-bad">{errors.researchQuestions}</p>{/if}
		</div>
		<div>
			<label class="label" for="hyp"
				>Hypotheses or assumptions <span class="text-muted">— optional, one per line</span></label
			>
			<textarea class="input min-h-24" id="hyp" name="hypotheses">{values.hypotheses}</textarea>
			<p class="hint">
				intavue reports evidence for <em>and against</em> each one, and avoids leading probes that assume
				them.
			</p>
		</div>
	</fieldset>

	<fieldset class="card grid gap-5 sm:grid-cols-2">
		<legend class="eyebrow px-1">Participants &amp; context</legend>
		<div class="sm:col-span-2">
			<label class="label" for="topic">Topic in plain words</label>
			<input
				class="input"
				id="topic"
				name="topic"
				value={values.topic}
				placeholder="Daily commuting in Metro Manila"
			/>
		</div>
		<div class="sm:col-span-2">
			<label class="label" for="pp">Who are the participants?</label>
			<input
				class="input"
				id="pp"
				name="participantProfile"
				value={values.participantProfile}
				placeholder="Office workers in Manila who commute by bus and ride-hailing"
			/>
			<p class="hint">
				Used to adapt wording and flag cultural assumptions — e.g. when the interviewer and
				participant come from different places.
			</p>
		</div>
		<div>
			<label class="label" for="lang">Interview language</label>
			<input
				class="input"
				id="lang"
				name="interviewLanguage"
				value={values.interviewLanguage}
				placeholder="English, or e.g. Taglish (Filipino–English)"
			/>
		</div>
		<div>
			<label class="label" for="olang">Write suggestions in</label>
			<input
				class="input"
				id="olang"
				name="outputLanguage"
				value={values.outputLanguage}
				placeholder="Same as the interview"
			/>
		</div>
		<div>
			<label class="label" for="mins">Typical session length (minutes)</label>
			<input
				class="input"
				id="mins"
				name="sessionMinutes"
				type="number"
				min="5"
				max="240"
				value={values.sessionMinutes}
			/>
			<p class="hint">
				Sets the default number of probes (3 for short sessions, up to 10 for long ones).
			</p>
		</div>
	</fieldset>

	<div class="flex justify-end">
		<button class="btn btn-primary" disabled={busy}>{busy ? 'Saving…' : submitLabel}</button>
	</div>
</form>
