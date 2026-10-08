<script lang="ts">
	import StudyForm from '#lib/components/StudyForm.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const s = $derived(data.study);
	const values = $derived(
		form?.values ?? {
			title: s.title,
			goal: s.goal,
			researchQuestions: s.researchQuestions.map((r) => r.text).join('\n'),
			hypotheses: s.hypotheses.map((h) => h.text).join('\n'),
			topic: s.context.topic,
			participantProfile: s.context.participantProfile,
			interviewLanguage: s.context.interviewLanguage,
			outputLanguage: s.context.outputLanguage,
			sessionMinutes: String(s.context.sessionMinutes)
		}
	);
</script>

<div class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
	<p class="eyebrow">
		<a href="/" class="hover:text-fg">Studies</a> /
		<a href={`/studies/${s.id}`} class="hover:text-fg">{s.title}</a> / Edit
	</p>
	<h1 class="mt-2 mb-8 text-4xl">Edit research plan</h1>
	<StudyForm {values} errors={form?.errors} submitLabel="Save changes" />

	<form
		method="POST"
		action="?/delete"
		class="mt-12 border-t border-line pt-6"
		onsubmit={(e) => {
			if (!confirm('Delete this study, all its interviews, transcripts and reflections?'))
				e.preventDefault();
		}}
	>
		<p class="mb-3 text-sm text-muted">
			Deleting removes every transcript, recording reference and AI output for this study from this
			server.
		</p>
		<button class="btn btn-danger">Delete study</button>
	</form>
</div>
