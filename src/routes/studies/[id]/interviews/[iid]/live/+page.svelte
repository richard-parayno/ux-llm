<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { onDestroy, tick } from 'svelte';
	import { SvelteMap, SvelteSet } from 'svelte/reactivity';
	import Transcript from '#lib/components/Transcript.svelte';
	import CoverageDot from '#lib/components/CoverageDot.svelte';
	import { LiveTranscriber, type CaptureMode } from '#lib/live/deepgram-client.js';
	import type { CoverageStatus, LiveNudge, Segment, SpeakerRole } from '#lib/domain.js';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	const study = $derived(data.study);
	const caps = $derived(page.data.caps);

	// ---- session setup -------------------------------------------------------
	type Source = CaptureMode | 'simulate';
	let source = $state<Source>('simulate');
	$effect.pre(() => {
		if (caps.stt && source === 'simulate' && !started) source = 'mic';
	});
	let language = $state('multi');
	let simText = $state('');
	let speed = $state(4);

	// ---- live state ------------------------------------------------------------
	let segments = $state<Segment[]>([]);
	$effect.pre(() => {
		if (segments.length === 0 && data.segments.length) segments = [...data.segments];
	});
	let interim = $state('');
	let started = $state(false);
	let status = $state<string>('');
	let startedAt = $state(0);
	let now = $state(Date.now());
	const roles = new SvelteMap<string, SpeakerRole>();
	let paused = $state(false);
	let inflight = $state(false);
	let lastAssistAt = 0;
	let lastAssistIdx = 0;
	const coverage = new SvelteMap<string, CoverageStatus>();
	let nudges = $state<(LiveNudge & { id: number; at: number })[]>([]);
	let nudgeSeq = 0;
	const asked = new SvelteSet<string>();
	let assistError = $state('');
	let transcriber: LiveTranscriber | null = null;
	let simTimer: ReturnType<typeof setTimeout> | null = null;
	let clock: ReturnType<typeof setInterval> | null = null;
	let scroller: HTMLDivElement | undefined = $state();

	const elapsed = $derived(started ? Math.max(0, Math.floor((now - startedAt) / 1000)) : 0);
	const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	const speakers = $derived([...new Set(segments.map((s) => s.speaker))]);

	// ---- persistence -----------------------------------------------------------
	async function addSegment(seg: Omit<Segment, 'idx'>) {
		segments.push({ ...seg, idx: segments.length });
		await tick();
		scroller?.scrollTo({ top: scroller.scrollHeight, behavior: 'smooth' });
		await fetch(`/api/interviews/${data.interview.id}/segments`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ segments: [seg] })
		});
		maybeAssist();
	}

	function roleFor(speaker: string): SpeakerRole {
		if (!roles.has(speaker)) roles.set(speaker, roles.size === 0 ? 'interviewer' : 'participant');
		return roles.get(speaker)!;
	}

	async function setRole(speaker: string, role: SpeakerRole) {
		roles.set(speaker, role);
		for (const s of segments) if (s.speaker === speaker) s.role = role;
		await fetch(`/api/interviews/${data.interview.id}/roles`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ map: { [speaker]: role } })
		});
	}

	// ---- co-pilot ----------------------------------------------------------------
	function participantWordsSince(idx: number) {
		return segments
			.slice(idx)
			.filter((s) => s.role === 'participant')
			.reduce((n, s) => n + s.text.split(/\s+/).length, 0);
	}

	function maybeAssist() {
		if (paused || inflight) return;
		const enoughTalk = participantWordsSince(lastAssistIdx) >= 35;
		const quietPeriod = Date.now() - lastAssistAt >= (source === 'simulate' ? 6000 : 20000);
		if (enoughTalk && quietPeriod) void assist();
	}

	async function assist() {
		inflight = true;
		assistError = '';
		const recentFrom = Math.max(0, lastAssistIdx - 2);
		lastAssistAt = Date.now();
		lastAssistIdx = segments.length;
		try {
			const res = await fetch(`/api/interviews/${data.interview.id}/assist`, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ recentFrom })
			});
			if (!res.ok)
				throw new Error((await res.json().catch(() => null))?.message ?? 'Co-pilot unavailable');
			const out = (await res.json()) as {
				coverage: { rqId: string; status: CoverageStatus }[];
				nudges: LiveNudge[];
				askedGuideItemIds: string[];
			};
			for (const c of out.coverage) coverage.set(c.rqId, c.status);
			for (const id of out.askedGuideItemIds) asked.add(id);
			if (out.nudges.length) {
				const fresh = out.nudges.map((n) => ({ ...n, id: ++nudgeSeq, at: Date.now() }));
				nudges = [...fresh, ...nudges].slice(0, 2);
			}
		} catch (e) {
			assistError = e instanceof Error ? e.message : 'Co-pilot unavailable';
		} finally {
			inflight = false;
		}
	}

	async function saveNudge(n: LiveNudge & { id: number }) {
		await fetch(`/api/studies/${study.id}/guide`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ text: n.probe, rationale: n.why })
		});
		nudges = nudges.filter((x) => x.id !== n.id);
	}

	async function toggleAsked(id: string) {
		if (asked.has(id)) asked.delete(id);
		else asked.add(id);
	}

	// ---- start / stop ------------------------------------------------------------
	async function start() {
		started = true;
		startedAt = Date.now();
		clock = setInterval(() => (now = Date.now()), 1000);
		for (const s of segments) roles.set(s.speaker, s.role);
		if (source === 'simulate') return startSimulation();
		transcriber = new LiveTranscriber({
			onUtterance: (u) => {
				const speaker = `Speaker ${u.speaker + 1}`;
				void addSegment({
					speaker,
					role: roleFor(speaker),
					text: u.text,
					startMs: u.startMs,
					endMs: u.endMs
				});
			},
			onInterim: (t) => (interim = t),
			onStatus: (s, detail) => (status = detail ?? s)
		});
		try {
			await transcriber.start({ language, capture: source });
		} catch (e) {
			status = e instanceof Error ? e.message : 'Could not start';
			transcriber.stop();
			started = false;
		}
	}

	async function startSimulation() {
		let script = data.demoSegments;
		if (simText.trim()) {
			const res = await fetch('/api/transcript/parse', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ text: simText })
			});
			if (res.ok) script = (await res.json()).segments;
		}
		status = 'simulating';
		let i = 0;
		const next = () => {
			if (i >= script.length) {
				status = 'simulation finished';
				return;
			}
			const s = script[i++];
			roles.set(s.speaker, s.role);
			void addSegment({ ...s, startMs: Date.now() - startedAt, endMs: null });
			const words = s.text.split(/\s+/).length;
			simTimer = setTimeout(next, Math.max(700, words * 320) / speed);
		};
		next();
	}

	async function finish() {
		transcriber?.stop();
		if (simTimer) clearTimeout(simTimer);
		if (clock) clearInterval(clock);
		await fetch(`/api/interviews/${data.interview.id}/finish`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ durationSec: started ? elapsed : null, askedGuideItemIds: [...asked] })
		});
		await goto(`/studies/${study.id}/interviews/${data.interview.id}`);
	}

	onDestroy(() => {
		transcriber?.stop();
		if (simTimer) clearTimeout(simTimer);
		if (clock) clearInterval(clock);
	});

	const kindLabel = { follow_up: 'Follow up', gap: 'Not covered yet', clarify: 'Clarify' } as const;
</script>

<svelte:head><title>Live · {data.interview.label} · intavue</title></svelte:head>

<div class="mx-auto max-w-[1500px] px-4 py-6 sm:px-6">
	<div class="flex flex-wrap items-center justify-between gap-4">
		<div>
			<p class="eyebrow">
				<a href={`/studies/${study.id}`} class="hover:text-fg">{study.title}</a> / live session
			</p>
			<h1 class="mt-1 text-3xl">{data.interview.label}</h1>
		</div>
		<div class="flex items-center gap-3">
			{#if started}
				<span class="flex items-center gap-2 text-sm tabular-nums" aria-live="off">
					<span class="size-2 animate-pulse rounded-full bg-bad"></span>{mmss(elapsed)}
				</span>
				<span class="text-xs text-muted">{status}</span>
			{/if}
			<button class="btn btn-primary" onclick={finish} data-testid="finish-live">
				{started ? 'End & reflect' : 'Done'}
			</button>
		</div>
	</div>

	{#if !data.interview.consentAt}
		<form method="POST" action="?/consent" class="card mt-6 max-w-2xl" use:enhance>
			<h2 class="text-xl">Consent first</h2>
			<p class="mt-2 text-sm text-fg-2">
				Live mode sends audio to Deepgram for transcription and the running transcript to the
				co-pilot model. Make sure your participant agreed to this.
			</p>
			<label class="mt-4 flex items-start gap-2 text-sm">
				<input type="checkbox" required class="mt-0.5 rounded border-line bg-ink text-brand" />
				<span>The participant agreed to live AI transcription and assistance.</span>
			</label>
			<div class="mt-4 flex justify-end">
				<button class="btn btn-primary btn-sm" data-testid="live-consent">Confirm</button>
			</div>
		</form>
	{:else if !started}
		<section class="card mt-6 max-w-2xl space-y-5" data-testid="live-setup">
			<h2 class="text-2xl">Set up</h2>
			<fieldset class="space-y-2 text-sm">
				<legend class="label">Audio</legend>
				<label class="flex items-center gap-2" class:opacity-50={!caps.stt}>
					<input
						type="radio"
						bind:group={source}
						value="mic"
						disabled={!caps.stt}
						class="border-line bg-ink text-brand"
					/>
					In person — microphone
				</label>
				<label class="flex items-center gap-2" class:opacity-50={!caps.stt}>
					<input
						type="radio"
						bind:group={source}
						value="mic+tab"
						disabled={!caps.stt}
						class="border-line bg-ink text-brand"
					/>
					Remote — microphone + meeting tab audio (Zoom/Meet/Teams in the browser)
				</label>
				<label class="flex items-center gap-2">
					<input
						type="radio"
						bind:group={source}
						value="simulate"
						class="border-line bg-ink text-brand"
					/>
					Simulate — replay a transcript (for practice or demos)
				</label>
				{#if !caps.stt}<p class="hint">Set DEEPGRAM_API_KEY to transcribe real audio.</p>{/if}
			</fieldset>
			{#if source === 'simulate'}
				<div>
					<label class="label" for="sim"
						>Transcript to replay <span class="text-muted">— empty uses the demo interview</span
						></label
					>
					<textarea id="sim" class="input min-h-28 font-mono text-xs" bind:value={simText}
					></textarea>
					<label class="label mt-3" for="speed">Speed: {speed}×</label>
					<input
						id="speed"
						type="range"
						min="1"
						max="20"
						bind:value={speed}
						class="w-full accent-brand"
					/>
				</div>
			{:else}
				<div>
					<label class="label" for="lang">Spoken language</label>
					<select id="lang" class="input" bind:value={language}>
						{#each data.languages as l (l.value)}<option value={l.value}>{l.label}</option>{/each}
					</select>
				</div>
			{/if}
			<p class="text-xs text-muted">
				The co-pilot stays quiet unless something is worth probing: at most two nudges at a time,
				and you can pause it. Your full reflection happens after the session.
			</p>
			<div class="flex justify-end">
				<button class="btn btn-primary" onclick={start} data-testid="start-session">Start</button>
			</div>
			{#if status}<p class="text-sm text-bad" role="alert">{status}</p>{/if}
		</section>
	{/if}

	{#if started || segments.length}
		<div class="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(320px,2fr)]">
			<section class="card flex max-h-[calc(100vh-11rem)] flex-col" aria-label="Live transcript">
				<div class="mb-3 flex flex-wrap items-center gap-2 text-xs">
					<span class="text-muted">Speakers:</span>
					{#each speakers as sp (sp)}
						<label class="chip gap-1.5">
							{sp}
							<select
								class="rounded border-none bg-transparent p-0 pr-5 text-xs text-fg focus:ring-0"
								value={roles.get(sp) ?? 'unknown'}
								onchange={(e) => setRole(sp, e.currentTarget.value as SpeakerRole)}
							>
								<option value="interviewer">interviewer</option>
								<option value="participant">participant</option>
								<option value="observer">observer</option>
							</select>
						</label>
					{/each}
				</div>
				<div bind:this={scroller} class="-mx-2 flex-1 overflow-y-auto px-2">
					<Transcript {segments} {interim} />
				</div>
			</section>

			<aside class="space-y-5" aria-label="Co-pilot">
				<section class="card" aria-live="polite">
					<div class="flex items-center justify-between">
						<h2 class="text-xl">Nudges</h2>
						<div class="flex gap-1">
							<button
								class="btn btn-sm"
								onclick={() => assist()}
								disabled={inflight || segments.length < 2}
								data-testid="nudge-now"
							>
								{inflight ? 'Thinking…' : 'Nudge me'}
							</button>
							<button
								class="btn-ghost btn btn-sm"
								aria-pressed={paused}
								onclick={() => (paused = !paused)}
							>
								{paused ? 'Resume' : 'Pause'}
							</button>
						</div>
					</div>
					{#if paused}<p class="mt-2 text-xs text-warn">Automatic nudges paused.</p>{/if}
					{#if assistError}<p class="mt-2 text-xs text-bad">{assistError}</p>{/if}
					{#if nudges.length === 0}
						<p class="mt-4 text-sm text-muted">Nothing to suggest — keep listening.</p>
					{/if}
					<ul class="mt-4 space-y-3">
						{#each nudges as n (n.id)}
							<li class="rounded-lg border border-brand/40 bg-brand-wash p-4" data-testid="nudge">
								<p class="eyebrow">{kindLabel[n.kind]}</p>
								<p class="mt-1 font-display text-2xl leading-snug">{n.probe}</p>
								<p class="mt-1 text-xs text-muted">
									{n.why}{#if n.anchor}
										· “{n.anchor.quote}”{/if}
								</p>
								<div class="mt-3 flex gap-1">
									<button
										class="btn-ghost btn btn-sm"
										onclick={() => (nudges = nudges.filter((x) => x.id !== n.id))}>Dismiss</button
									>
									<button class="btn-ghost btn btn-sm" onclick={() => saveNudge(n)}
										>Save for next time</button
									>
								</div>
							</li>
						{/each}
					</ul>
				</section>

				<section class="card">
					<h2 class="text-xl">Coverage so far</h2>
					<ul class="mt-3 space-y-2 text-sm">
						{#each study.researchQuestions as rq (rq.id)}
							<li class="flex items-start gap-2">
								<span class="mt-1"
									><CoverageDot
										status={coverage.get(rq.id) ?? 'not_addressed'}
										label={rq.id}
									/></span
								>
								<span
									><span class="mr-1 text-xs text-brand">{rq.id}</span><span class="text-fg-2"
										>{rq.text}</span
									></span
								>
							</li>
						{/each}
					</ul>
				</section>

				{#if data.guide.length}
					<section class="card">
						<h2 class="text-xl">Your guide</h2>
						<ul class="mt-3 space-y-2 text-sm">
							{#each data.guide as g (g.id)}
								<li>
									<label class="flex items-start gap-2">
										<input
											type="checkbox"
											checked={asked.has(g.id)}
											onchange={() => toggleAsked(g.id)}
											class="mt-0.5 rounded border-line bg-ink text-brand"
										/>
										<span class={asked.has(g.id) ? 'text-muted line-through' : ''}>{g.text}</span>
									</label>
								</li>
							{/each}
						</ul>
					</section>
				{/if}
			</aside>
		</div>
	{/if}
</div>
