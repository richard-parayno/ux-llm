<script lang="ts">
	import StudyForm from '#lib/components/StudyForm.svelte';
	import type { PageProps } from './$types';

	let { form }: PageProps = $props();
	const empty = {
		title: '',
		goal: '',
		researchQuestions: '',
		hypotheses: '',
		topic: '',
		participantProfile: '',
		interviewLanguage: 'English',
		outputLanguage: '',
		sessionMinutes: '30'
	};
</script>

<div class="mx-auto max-w-3xl px-4 py-10 sm:px-6">
	<p class="eyebrow"><a href="/" class="hover:text-fg">Studies</a> / New</p>
	<h1 class="mt-2 mb-2 text-4xl">Tell us about your research</h1>
	<p class="mb-8 text-fg-2">
		This context is what makes suggestions specific instead of generic. You can edit it any time.
	</p>
	<StudyForm values={form?.values ?? empty} errors={form?.errors} submitLabel="Create study" />
</div>
