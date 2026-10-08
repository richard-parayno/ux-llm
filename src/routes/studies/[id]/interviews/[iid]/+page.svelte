<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto, refreshAll } from '$app/navigation';
	import { page } from '$app/state';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import Transcript from '#lib/components/Transcript.svelte';
	import ProbeCard from '#lib/components/ProbeCard.svelte';
	import CoverageDot from '#lib/components/CoverageDot.svelte';
	import type { ProbeState } from '#lib/ui.js';
	import type { VerifiedProbe } from '#lib/domain.js';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();

	const study = $derived(data.study);
	const interview = $derived(data.interview);
	const run = $derived(data.reflection);
	const result = $derived(run?.status === 'done' ? run.result : null);
	const caps = $derived(page.data.caps);

	// ---- transcript focus / highlight ------------------------------------
	let focus = $state<number | null>(null);
	const highlighted = $derived(
		new Set((result?.probes ?? []).flatMap((p) => p.anchors.map((a) => a.seg)))
	);
	function focusSeg(seg: number) {
		focus = seg;
		document
			.getElementById('transcript-pane')
			?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
	}

	// ---- speaker roles ----------------------------------------------------
	const needsRoles = $derived(
		!data.speakers.some((s) => s.role === 'interviewer') ||
			data.speakers.some((s) => s.role === 'unknown')
	);

	// ---- reflection config ------------------------------------------------
	let probeCount = $state(0);
	$effect.pre(() => {
		if (probeCount === 0) probeCount = run?.config.probeCount ?? data.defaults.probeCount;
	});
	let submitting = $state(false);

	// ---- polling a running reflection --------------------------------------
	let liveStage = $state<string | null>(null);
	$effect(() => {
		const id = run && (run.status === 'queued' || run.status === 'running') ? run.id : null;
		if (!id) return;
		let stopped = false;
		const tick = async () => {
			if (stopped) return;
			const res = await fetch(`/api/reflections/${id}`);
			if (res.ok) {
				const s = await res.json();
				liveStage = s.stage;
				if (s.status === 'done' || s.status === 'error') {
					await refreshAll();
					return;
				}
			}
			setTimeout(tick, 1200);
		};
		tick();
		return () => {
			stopped = true;
		};
	});

	async function cancel() {
		if (!run) return;
		await fetch(`/api/reflections/${run.id}/cancel`, { method: 'POST' });
		await refreshAll();
	}

	// ---- per-probe state, seeded from stored feedback ------------------------
	const states = new SvelteMap<string, ProbeState>();
	$effect.pre(() => {
		if (!result || !run) return;
		states.clear();
		const guideTexts = new Set(
			data.guide.filter((g) => g.sourceReflectionId === run.id).map((g) => g.text)
		);
		for (const p of [...result.probes, ...result.rejected]) {
			const s: ProbeState = {
				question: p.question,
				dismissed: false,
				inGuide: guideTexts.has(p.question),
				rating: null
			};
			for (const f of data.feedback.filter((f) => f.probeId === p.id)) {
				if (f.action === 'dismissed') s.dismissed = !(f.payload as { undo?: boolean } | null)?.undo;
				if (f.action === 'added_to_guide') s.inGuide = true;
				if (f.action === 'edited') s.question = String((f.payload as { to: string }).to);
				if (f.action === 'helpful' || f.action === 'not_helpful') s.rating = f.action;
			}
			if (guideTexts.has(s.question)) s.inGuide = true;
			states.set(p.id, s);
		}
	});

	async function feedback(probeId: string, action: string, payload?: Record<string, unknown>) {
		if (!run) return;
		await fetch(`/api/reflections/${run.id}/feedback`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ probeId, action, payload })
		});
	}

	async function onAction(p: VerifiedProbe, action: string, value?: string) {
		const s = states.get(p.id)!;
		if (action === 'guide') {
			const res = await fetch(`/api/studies/${study.id}/guide`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					text: s.question,
					rationale: p.rationale,
					probeType: p.probeType,
					targets: p.targets,
					sourceReflectionId: run!.id,
					probeId: p.id
				})
			});
			if (res.ok) states.set(p.id, { ...s, inGuide: true });
		} else if (action === 'dismiss' || action === 'undismiss') {
			states.set(p.id, { ...s, dismissed: action === 'dismiss' });
			await feedback(p.id, 'dismissed', action === 'undismiss' ? { undo: true } : undefined);
		} else if (action === 'helpful' || action === 'not_helpful') {
			states.set(p.id, { ...s, rating: s.rating === action ? null : action });
			await feedback(p.id, action);
		} else if (action === 'edit' && value) {
			states.set(p.id, { ...s, question: value });
			await feedback(p.id, 'edited', { from: s.question, to: value });
		}
	}

	async function onRefine(p: VerifiedProbe, preset: string | null, instruction?: string) {
		const res = await fetch(`/api/reflections/${run!.id}/refine`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				probeId: p.id,
				question: states.get(p.id)!.question,
				preset,
				instruction
			})
		});
		if (!res.ok) {
			alert((await res.json().catch(() => null))?.message ?? 'Could not refine this probe.');
			return null;
		}
		return res.json();
	}

	// ---- results tabs --------------------------------------------------------
	type Tab = 'probes' | 'coverage' | 'craft' | 'themes';
	let tab = $state<Tab>('probes');
	const showRejected = new SvelteSet<string>();
	let editingMeta = $state(false);
	let editingTranscript = $state(false);
	const rqText = (id: string) => study.researchQuestions.find((r) => r.id === id)?.text ?? id;
	const hText = (id: string) => study.hypotheses.find((h) => h.id === id)?.text ?? id;
	const signalStyle = {
		supports: 'text-ok border-ok/50',
		challenges: 'text-bad border-bad/50',
		mixed: 'text-warn border-warn/50',
		no_evidence: 'text-muted'
	} as const;
	const issueLabel = {
		leading: 'Leading',
		closed: 'Closed (yes/no)',
		double_barreled: 'Double-barreled',
		jargon: 'Jargon',
		assumptive: 'Assumptive',
		too_long: 'Too long'
	} as const;
	const fmtDate = (iso: string) =>
		new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
	const transcriptText = $derived(data.segments.map((s) => `${s.speaker}: ${s.text}`).join('\n'));
</script>

<svelte:head><title>{interview.label} · {study.title} · intavue</title></svelte:head>

<div class="mx-auto max-w-[1500px] px-4 py-8 sm:px-6">
	<p class="eyebrow">
		<a href="/" class="hover:text-fg">Studies</a> /
		<a href={`/studies/${study.id}`} class="hover:text-fg">{study.title}</a>
	</p>
	<div class="mt-2 flex flex-wrap items-start justify-between gap-4">
		{#if editingMeta}
			<form
				method="POST"
				action="?/meta"
				class="flex flex-1 flex-wrap gap-2"
				use:enhance={() =>
					async ({ update }) => {
						await update();
						editingMeta = false;
					}}
			>
				<input class="input max-w-40" name="label" value={interview.label} />
				<input
					class="input max-w-xl"
					name="participantNote"
					value={interview.participantNote}
					placeholder="About this participant"
				/>
				<button class="btn btn-primary btn-sm">Save</button>
				<button type="button" class="btn btn-sm" onclick={() => (editingMeta = false)}
					>Cancel</button
				>
			</form>
		{:else}
			<div>
				<h1 class="text-4xl">
					{interview.label}
					<button class="btn-ghost btn btn-sm align-middle" onclick={() => (editingMeta = true)}
						>Edit</button
					>
				</h1>
				{#if interview.participantNote}<p class="mt-1 text-sm text-muted">
						{interview.participantNote}
					</p>{/if}
			</div>
		{/if}
		<div class="flex flex-wrap gap-2 text-xs">
			<span class="chip">{data.segments.length} turns</span>
			<span class="chip">{interview.source}</span>
			{#if interview.durationSec}<span class="chip"
					>{Math.round(interview.durationSec / 60)} min</span
				>{/if}
		</div>
	</div>

	{#if data.imported}
		<p class="mt-4 text-sm text-ok" role="status">
			Imported {data.imported === 'audio'
				? 'and transcribed the recording'
				: `a ${data.imported} transcript`} —
			{data.speakers.length} speaker{data.speakers.length === 1 ? '' : 's'} detected. Check who is who
			below.
		</p>
	{/if}

	<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
		<!-- Transcript ------------------------------------------------------>
		<section
			id="transcript-pane"
			class="card lg:sticky lg:top-20 lg:max-h-[calc(100vh-6.5rem)] lg:overflow-y-auto"
			aria-label="Transcript"
		>
			<div class="mb-3 flex items-center justify-between">
				<h2 class="text-xl">Transcript</h2>
				<button
					class="btn-ghost btn btn-sm"
					onclick={() => (editingTranscript = !editingTranscript)}
				>
					{editingTranscript ? 'Close editor' : 'Edit text'}
				</button>
			</div>
			{#if editingTranscript}
				<form
					method="POST"
					action="?/transcript"
					use:enhance={() =>
						async ({ update }) => {
							await update();
							editingTranscript = false;
						}}
				>
					<textarea name="transcript" class="input min-h-96 font-mono text-xs"
						>{transcriptText}</textarea
					>
					<p class="hint">
						Fix transcription errors or speaker labels. Saving re-splits the turns; existing
						reflections keep their own copy of the quotes.
					</p>
					<div class="mt-2 flex justify-end">
						<button class="btn btn-primary btn-sm">Save transcript</button>
					</div>
				</form>
			{:else}
				<Transcript segments={data.segments} {highlighted} {focus} />
			{/if}
		</section>

		<!-- Reflection ------------------------------------------------------->
		<div class="space-y-6">
			<!-- Who is who -->
			<details class="card" open={needsRoles}>
				<summary class="cursor-pointer text-sm font-medium">
					Who is who? <span class="text-muted"
						>— {data.speakers.map((s) => `${s.speaker}: ${s.role}`).join(', ')}</span
					>
				</summary>
				<form method="POST" action="?/roles" class="mt-4 space-y-2" use:enhance>
					{#each data.speakers as sp (sp.speaker)}
						<div class="flex items-center gap-3 text-sm">
							<span class="w-40 truncate">{sp.speaker}</span>
							<span class="w-28 text-xs text-muted">{sp.turns} turns · {sp.words} words</span>
							<select name={`role:${sp.speaker}`} class="input max-w-40 py-1" value={sp.role}>
								<option value="interviewer">Interviewer</option>
								<option value="participant">Participant</option>
								<option value="observer">Observer</option>
								<option value="unknown">Unknown</option>
							</select>
						</div>
					{/each}
					<p class="hint">
						Roles matter: intavue never suggests a question the interviewer already asked, and only
						quotes participants as evidence.
					</p>
					<div class="flex justify-end"><button class="btn btn-sm">Save roles</button></div>
				</form>
			</details>

			<!-- Consent gate -->
			{#if !interview.consentAt}
				<form method="POST" action="?/consent" class="card border-warn/50" use:enhance>
					<h2 class="text-xl">Before any AI sees this interview</h2>
					<p class="mt-2 text-sm text-fg-2">
						{#if caps.demoMode}
							Demo mode: nothing leaves this server. With an API key configured, the transcript text
							is sent to Anthropic's Claude API to generate suggestions.
						{:else}
							The transcript text (optionally with personal data masked) is sent to Anthropic's
							Claude API ({caps.model}) to generate suggestions. Check this is covered by your
							consent form and your organisation's data agreement.
						{/if}
					</p>
					<label class="mt-4 flex items-start gap-2 text-sm">
						<input
							type="checkbox"
							name="consent"
							required
							class="mt-0.5 rounded border-line bg-ink text-brand"
						/>
						<span>The participant agreed to their interview being processed with AI tools.</span>
					</label>
					<div class="mt-4 flex justify-end">
						<button class="btn btn-primary btn-sm" data-testid="confirm-consent">Confirm</button>
					</div>
				</form>
			{:else}
				<!-- Config -->
				<form
					method="POST"
					action="?/reflect"
					class="card space-y-5"
					data-testid="reflect-form"
					use:enhance={() => {
						submitting = true;
						return async ({ result: r, update }) => {
							submitting = false;
							if (r.type === 'success' && r.data?.started) {
								await goto(`?r=${r.data.started}`, { refreshAll: true, reset: false });
							} else await update({ reset: false });
						};
					}}
				>
					<div class="flex items-baseline justify-between gap-4">
						<h2 class="text-2xl">Reflect &amp; prepare probes</h2>
						<span class="text-xs text-muted">using {data.providerLabel}</span>
					</div>

					<details class="rounded-lg border border-line p-3" open={!run}>
						<summary class="cursor-pointer text-sm">
							<span class="font-medium">Before you look:</span>
							<span class="text-fg-2">what would <em>you</em> ask next?</span>
							<span class="text-muted">(optional)</span>
						</summary>
						<textarea
							name="ownFollowUps"
							class="input mt-3 min-h-20"
							placeholder="One question per line"></textarea>
						<p class="hint">
							"The system forces me to think about my own questions. Even if none of the questions
							it gives me are useful, it still makes my interviews better." — study participant.
							Your questions are kept separate and never duplicated by the suggestions.
						</p>
					</details>

					<div class="grid gap-5 sm:grid-cols-2">
						<div>
							<label class="label" for="pc"
								>How many probes? <span class="text-brand tabular-nums">{probeCount}</span></label
							>
							<input
								id="pc"
								name="probeCount"
								type="range"
								min="1"
								max={data.defaults.maxProbes}
								bind:value={probeCount}
								class="w-full accent-brand"
							/>
							<p class="hint">
								Default {data.defaults.probeCount} for {study.context.sessionMinutes}-minute
								sessions.
							</p>
						</div>
						<fieldset>
							<legend class="label">Focus</legend>
							<div class="flex flex-wrap gap-3 text-sm">
								{#each [['balanced', 'Balanced'], ['depth', 'Go deeper'], ['coverage', 'Fill gaps']] as [v, l] (v)}
									<label class="flex items-center gap-1.5">
										<input
											type="radio"
											name="focus"
											value={v}
											checked={(run?.config.focus ?? 'balanced') === v}
											class="border-line bg-ink text-brand"
										/>{l}
									</label>
								{/each}
							</div>
						</fieldset>
					</div>
					<div>
						<label class="label" for="note"
							>Anything else? <span class="text-muted">— optional</span></label
						>
						<input
							id="note"
							name="note"
							class="input"
							placeholder="e.g. Next session is only 15 minutes; focus on RQ2"
						/>
					</div>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<label class="flex items-center gap-2 text-sm text-fg-2">
							<input
								type="checkbox"
								name="redactPii"
								checked={run?.config.redactPii ?? true}
								class="rounded border-line bg-ink text-brand"
							/>
							Mask emails, phone numbers and the participant's name before sending
						</label>
						<button
							class="btn btn-primary"
							disabled={submitting || run?.status === 'running' || run?.status === 'queued'}
							data-testid="run-reflection"
						>
							{submitting ? 'Starting…' : run ? 'Run again' : 'Reflect on this interview'}
						</button>
					</div>
					{#if form?.reflectError}<p class="text-sm text-bad" role="alert">
							{form.reflectError}
						</p>{/if}
				</form>
			{/if}

			<!-- Results -->
			{#if run}
				<section class="card" aria-live="polite" data-testid="reflection">
					{#if data.runs.length > 1}
						<div class="mb-4 flex items-center gap-2 text-xs text-muted">
							<label for="runs">Run</label>
							<select
								id="runs"
								class="input max-w-64 py-1 text-xs"
								value={run.id}
								onchange={(e) => goto(`?r=${e.currentTarget.value}`, { reset: false })}
							>
								{#each data.runs as r (r.id)}
									<option value={r.id}
										>{fmtDate(r.createdAt)} · {r.probeCount} probes · {r.status}</option
									>
								{/each}
							</select>
						</div>
					{/if}

					{#if run.status === 'queued' || run.status === 'running'}
						<div class="flex items-center gap-4 py-6">
							<span
								class="size-5 animate-spin rounded-full border-2 border-brand border-t-transparent"
								aria-hidden="true"
							></span>
							<div class="flex-1">
								<p class="font-display text-xl">{liveStage ?? run.stage ?? 'Starting'}…</p>
								<p class="mt-1 text-xs text-muted">
									While you wait: reflect on the language and terms your participant used —
									mirroring them builds rapport.
								</p>
							</div>
							<button class="btn btn-sm" onclick={cancel}>Cancel</button>
						</div>
					{:else if run.status === 'error'}
						<p class="text-sm text-bad" role="alert">This run failed: {run.error}</p>
					{:else if result}
						{#each run.warnings as w (w)}
							<p class="mb-3 rounded-lg border border-warn/40 bg-warn-wash px-3 py-2 text-sm">
								{w}
							</p>
						{/each}
						<p class="text-fg-2" data-testid="summary">{result.summary}</p>

						<div class="mt-5 flex gap-1 border-b border-line text-sm" role="tablist">
							{#each [['probes', `Probes (${result.probes.length})`], ['coverage', 'Coverage & hypotheses'], ['craft', 'Your interviewing'], ['themes', 'Themes']] as [id, label] (id)}
								<button
									role="tab"
									aria-selected={tab === id}
									class={`-mb-px border-b-2 px-3 py-2 ${tab === id ? 'border-brand text-fg' : 'border-transparent text-muted hover:text-fg'}`}
									onclick={() => (tab = id as Tab)}>{label}</button
								>
							{/each}
						</div>

						<div class="mt-5">
							{#if tab === 'probes'}
								<div class="space-y-3">
									{#each result.probes as p, i (p.id)}
										{@const s = states.get(p.id)}
										{#if s}
											<ProbeCard
												probe={p}
												index={i}
												state={s}
												items={[...study.researchQuestions, ...study.hypotheses]}
												onfocus={focusSeg}
												onaction={(a, v) => onAction(p, a, v)}
												onrefine={(preset, instr) => onRefine(p, preset, instr)}
											/>
										{/if}
									{/each}
								</div>
								{#if result.adaptationNotes.length}
									<div class="mt-5 rounded-lg border border-info/40 bg-info-wash/50 p-3 text-sm">
										<p class="eyebrow mb-1">Adapting to this participant</p>
										<ul class="list-disc space-y-1 pl-5 text-fg-2">
											{#each result.adaptationNotes as n (n)}<li>{n}</li>{/each}
										</ul>
									</div>
								{/if}
								{#if result.rejected.length}
									<details
										class="mt-5 text-sm"
										ontoggle={(e) =>
											e.currentTarget.open ? showRejected.add(run.id) : showRejected.delete(run.id)}
									>
										<summary class="cursor-pointer text-muted hover:text-fg"
											>Filtered out by verification ({result.rejected.length})</summary
										>
										{#if showRejected.has(run.id)}
											<div class="mt-3 space-y-3">
												{#each result.rejected as p, i (p.id)}
													<ProbeCard
														probe={p}
														index={i}
														rejected
														state={{
															question: p.question,
															dismissed: false,
															inGuide: false,
															rating: null
														}}
														items={study.researchQuestions}
														onfocus={focusSeg}
													/>
												{/each}
											</div>
										{/if}
									</details>
								{/if}
							{:else if tab === 'coverage'}
								<ul class="space-y-4">
									{#each result.coverage as c (c.rqId)}
										<li>
											<div class="flex items-start gap-2">
												<span class="mt-1"><CoverageDot status={c.status} /></span>
												<div>
													<p class="text-sm">
														<span class="mr-1 text-xs text-brand">{c.rqId}</span>{rqText(c.rqId)}
													</p>
													<p class="mt-1 text-sm text-fg-2">{c.note}</p>
													{#each c.evidence as e, i (i)}
														<button
															class="mt-1 block text-left text-xs text-muted italic hover:text-fg"
															onclick={() => focusSeg(e.seg)}>“{e.quote}” [{e.seg}]</button
														>
													{/each}
												</div>
											</div>
										</li>
									{/each}
								</ul>
								{#if result.hypotheses.length}
									<h3 class="mt-8 mb-3 text-xl">Hypotheses</h3>
									<ul class="space-y-4">
										{#each result.hypotheses as h (h.hId)}
											<li>
												<p class="text-sm">
													<span class="mr-1 text-xs text-brand">{h.hId}</span>{hText(h.hId)}
												</p>
												<p class="mt-1 flex items-start gap-2 text-sm text-fg-2">
													<span class={`chip ${signalStyle[h.signal]}`}
														>{h.signal.replace('_', ' ')}</span
													>{h.note}
												</p>
												{#each h.evidence as e, i (i)}
													<button
														class="mt-1 block text-left text-xs text-muted italic hover:text-fg"
														onclick={() => focusSeg(e.seg)}>“{e.quote}” [{e.seg}]</button
													>
												{/each}
											</li>
										{/each}
									</ul>
								{/if}
							{:else if tab === 'craft'}
								<p class="mb-4 text-sm text-muted">
									Private feedback to sharpen your probing — nobody else sees this.
								</p>
								{#if result.missedOpportunities.length}
									<h3 class="mb-3 text-xl">Doors left open</h3>
									<ul class="mb-8 space-y-3">
										{#each result.missedOpportunities as m, i (i)}
											<li class="rounded-lg border border-line p-3 text-sm">
												<button
													class="text-left text-muted italic hover:text-fg"
													onclick={() => focusSeg(m.seg)}>“{m.quote}” [{m.seg}]</button
												>
												<p class="mt-1 text-fg-2">{m.whatWasMissed}</p>
												<p class="mt-2 font-display text-lg">{m.suggestedProbe}</p>
											</li>
										{/each}
									</ul>
								{/if}
								{#if result.questionCraft.length}
									<h3 class="mb-3 text-xl">Question craft</h3>
									<ul class="space-y-3">
										{#each result.questionCraft as q, i (i)}
											<li class="rounded-lg border border-line p-3 text-sm">
												<div class="flex items-start justify-between gap-2">
													<button
														class="text-left italic hover:text-fg"
														onclick={() => focusSeg(q.seg)}>“{q.quote}”</button
													>
													<span class="chip shrink-0">{issueLabel[q.issue]}</span>
												</div>
												<p class="mt-2 text-fg-2">{q.suggestion}</p>
											</li>
										{/each}
									</ul>
								{/if}
								{#if !result.missedOpportunities.length && !result.questionCraft.length}
									<p class="text-sm text-fg-2">Nothing stood out — nicely done.</p>
								{/if}
							{:else}
								{#if result.emergentThemes.length === 0}
									<p class="text-sm text-fg-2">
										No themes outside your research questions stood out.
									</p>
								{/if}
								<ul class="space-y-4">
									{#each result.emergentThemes as t, i (i)}
										<li>
											<p class="font-display text-lg">{t.theme}</p>
											<p class="text-sm text-fg-2">{t.note}</p>
											{#each t.evidence as e, j (j)}
												<button
													class="mt-1 block text-left text-xs text-muted italic hover:text-fg"
													onclick={() => focusSeg(e.seg)}>“{e.quote}” [{e.seg}]</button
												>
											{/each}
										</li>
									{/each}
								</ul>
							{/if}
						</div>

						<p class="mt-6 border-t border-line pt-3 text-[11px] text-faint">
							{run.provider === 'mock' ? 'Demo heuristic' : run.model} · {fmtDate(run.createdAt)}
							{#if run.usage && run.provider !== 'mock'}
								· {run.usage.calls} call{run.usage.calls === 1 ? '' : 's'} · {(
									run.usage.inputTokens +
									run.usage.cacheReadTokens +
									run.usage.cacheWriteTokens
								).toLocaleString()} input / {run.usage.outputTokens.toLocaleString()} output tokens ({run.usage.cacheReadTokens.toLocaleString()}
								cached)
							{/if}
							{#if run.config.redactPii}
								· personal data masked{/if}
						</p>
					{/if}
				</section>
			{/if}

			<form
				method="POST"
				action="?/delete"
				class="text-right"
				onsubmit={(e) => {
					if (!confirm('Delete this interview and all its reflections?')) e.preventDefault();
				}}
			>
				<button class="btn-ghost btn btn-sm text-bad">Delete interview</button>
			</form>
		</div>
	</div>
</div>
