<script lang="ts">
	import { enhance } from '$app/forms';
	import { page } from '$app/state';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	type Mode = 'text' | 'audio' | 'live';
	let mode = $state<Mode>('text');
	$effect.pre(() => {
		if (form?.mode) mode = form.mode as Mode;
	});
	let transcript = $state('');
	const transcriptPlaceholder =
		'Interviewer: How did you get to work today?\nParticipant: I took the bus, then a jeepney…';
	let fromFile = $state(false);
	let busy = $state(false);
	const caps = $derived(page.data.caps);

	async function loadFile(e: Event) {
		const file = (e.currentTarget as HTMLInputElement).files?.[0];
		if (!file) return;
		transcript = await file.text();
		fromFile = true;
	}

	const tabs: { id: Mode; title: string; body: string }[] = [
		{
			id: 'text',
			title: 'Transcript',
			body: 'Paste text or upload .txt / .vtt / .srt from Zoom, Teams or Meet.'
		},
		{
			id: 'audio',
			title: 'Recording',
			body: 'Upload audio or video — transcribed with speaker diarization.'
		},
		{
			id: 'live',
			title: 'Live session',
			body: 'Transcribe as you talk, with calm, glanceable probe nudges.'
		}
	];
	const submit = () => {
		busy = true;
		return async ({ update }: { update: () => Promise<void> }) => {
			await update();
			busy = false;
		};
	};
</script>

<div class="mx-auto max-w-4xl px-4 py-10 sm:px-6">
	<p class="eyebrow">
		<a href="/" class="hover:text-fg">Studies</a> /
		<a href={`/studies/${data.study.id}`} class="hover:text-fg">{data.study.title}</a> / New interview
	</p>
	<h1 class="mt-2 mb-8 text-4xl">Add an interview</h1>

	<div class="grid gap-3 sm:grid-cols-3" role="tablist">
		{#each tabs as t (t.id)}
			<button
				role="tab"
				aria-selected={mode === t.id}
				class={`card text-left transition-colors ${mode === t.id ? 'border-brand bg-brand-wash' : 'hover:border-line-strong'}`}
				onclick={() => (mode = t.id)}
			>
				<span class="block font-display text-xl">{t.title}</span>
				<span class="mt-1 block text-xs text-muted">{t.body}</span>
			</button>
		{/each}
	</div>

	{#snippet metaFields()}
		<div class="grid gap-4 sm:grid-cols-[160px_1fr]">
			<div>
				<label class="label" for="label">Label</label>
				<input class="input" id="label" name="label" value={data.suggestedLabel} required />
			</div>
			<div>
				<label class="label" for="note"
					>About this participant <span class="text-muted">— optional</span></label
				>
				<input
					class="input"
					id="note"
					name="participantNote"
					placeholder="e.g. Accountant, commutes daily from Parañaque; first-time user"
				/>
			</div>
		</div>
	{/snippet}

	{#if form?.error}
		<p class="mt-6 rounded-lg border border-bad/50 bg-bad-wash px-4 py-3 text-sm" role="alert">
			{form.error}
		</p>
	{/if}

	{#if mode === 'text'}
		<form method="POST" action="?/text" class="card mt-6 space-y-5" use:enhance={submit}>
			{@render metaFields()}
			<input type="hidden" name="fromFile" value={fromFile ? '1' : '0'} />
			<div>
				<div class="mb-1.5 flex items-center justify-between">
					<label class="label mb-0" for="transcript">Transcript</label>
					<label class="btn btn-sm cursor-pointer">
						Upload file
						<input
							type="file"
							accept=".txt,.vtt,.srt,text/plain,text/vtt"
							class="sr-only"
							onchange={loadFile}
						/>
					</label>
				</div>
				<textarea
					id="transcript"
					name="transcript"
					class="input min-h-80 font-mono text-xs"
					bind:value={transcript}
					placeholder={transcriptPlaceholder}></textarea>
				<p class="hint">
					Speaker labels like "I:", "Interviewer (I):", "Speaker 1:" or Zoom/Teams captions are
					detected automatically. You can fix who is who on the next screen.
				</p>
			</div>
			<div class="flex justify-end">
				<button class="btn btn-primary" disabled={busy} data-testid="import-transcript">
					{busy ? 'Importing…' : 'Import transcript'}
				</button>
			</div>
		</form>
	{:else if mode === 'audio'}
		<form
			method="POST"
			action="?/audio"
			enctype="multipart/form-data"
			class="card mt-6 space-y-5"
			use:enhance={submit}
		>
			{#if !caps.stt}
				<p class="rounded-lg border border-warn/50 bg-warn-wash px-4 py-3 text-sm">
					Audio transcription is off on this server. Set <code>DEEPGRAM_API_KEY</code> to enable it, or
					export a transcript from your meeting tool and use the Transcript tab.
				</p>
			{/if}
			{@render metaFields()}
			<div class="grid gap-4 sm:grid-cols-2">
				<div>
					<label class="label" for="audio">Recording</label>
					<input
						class="input"
						id="audio"
						name="audio"
						type="file"
						accept="audio/*,video/*"
						required
						disabled={!caps.stt}
					/>
				</div>
				<div>
					<label class="label" for="language">Spoken language</label>
					<select class="input" id="language" name="language" disabled={!caps.stt}>
						{#each data.languages as l (l.value)}<option value={l.value}>{l.label}</option>{/each}
					</select>
				</div>
			</div>
			<label class="flex items-start gap-2 text-sm text-fg-2">
				<input
					type="checkbox"
					name="redactPii"
					class="mt-0.5 rounded border-line bg-ink text-brand"
					disabled={!caps.stt}
				/>
				<span
					>Redact personal data (names, numbers, emails) during transcription <span
						class="text-muted">— English only</span
					></span
				>
			</label>
			<p class="hint">
				The recording is sent to Deepgram ({caps.sttModel}) for transcription and is not stored by
				intavue.
			</p>
			<div class="flex justify-end">
				<button class="btn btn-primary" disabled={busy || !caps.stt}>
					{busy ? 'Transcribing… this can take a minute' : 'Transcribe'}
				</button>
			</div>
		</form>
	{:else}
		<form method="POST" action="?/live" class="card mt-6 space-y-5" use:enhance={submit}>
			{@render metaFields()}
			<div class="space-y-2 text-sm text-fg-2">
				<p>
					Live mode is <strong>optional</strong>. Our study found that support during the interview
					can add cognitive load, so the live screen is deliberately quiet: coverage at a glance,
					your guide checklist, and at most two nudges at a time — which you can pause.
				</p>
				{#if !caps.stt}
					<p class="text-warn">
						Without <code>DEEPGRAM_API_KEY</code> you can still try it by replaying a transcript as a
						simulated session.
					</p>
				{/if}
			</div>
			<div class="flex justify-end">
				<button class="btn btn-primary" disabled={busy} data-testid="start-live"
					>Open live session</button
				>
			</div>
		</form>
	{/if}
</div>
