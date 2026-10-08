<script lang="ts">
	import { enhance } from '$app/forms';
	import CoverageDot from '#lib/components/CoverageDot.svelte';
	import type { PageProps } from './$types';

	let { data, form }: PageProps = $props();
	const study = $derived(data.study);
	const activeGuide = $derived(data.guide.filter((g) => g.status !== 'archived'));
	const archived = $derived(data.guide.filter((g) => g.status === 'archived'));
	let editing = $state<string | null>(null);

	function coverageOf(i: (typeof data.interviews)[number], rqId: string) {
		return i.coverage?.find((c) => c.rqId === rqId)?.status ?? null;
	}
	/** Best status across interviews — a study-level view of what's still open. */
	function studyCoverage(rqId: string) {
		const statuses = data.interviews.map((i) => coverageOf(i, rqId));
		if (statuses.includes('addressed')) return 'addressed';
		if (statuses.includes('partial')) return 'partial';
		if (statuses.includes('not_addressed')) return 'not_addressed';
		return null;
	}
	const fmt = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });
</script>

<svelte:head><title>{study.title} · intavue</title></svelte:head>

<div class="mx-auto max-w-7xl px-4 py-10 sm:px-6">
	<p class="eyebrow"><a href="/" class="hover:text-fg">Studies</a></p>
	<div class="mt-2 flex flex-wrap items-start justify-between gap-4">
		<div class="max-w-3xl">
			<h1 class="text-4xl">{study.title}</h1>
			<p class="mt-3 text-fg-2">{study.goal}</p>
		</div>
		<div class="flex gap-2">
			<a href={`/studies/${study.id}/edit`} class="btn">Edit plan</a>
			<a
				href={`/studies/${study.id}/interviews/new`}
				class="btn btn-primary"
				data-testid="add-interview">Add interview</a
			>
		</div>
	</div>

	<div class="mt-10 grid gap-6 lg:grid-cols-[minmax(0,1fr)_420px]">
		<!-- Coverage across interviews -->
		<section class="card overflow-x-auto">
			<div class="flex items-baseline justify-between gap-4">
				<h2 class="text-2xl">Research questions across interviews</h2>
				<p class="hidden text-xs text-muted sm:flex sm:items-center sm:gap-3">
					<span class="flex items-center gap-1"><CoverageDot status="addressed" /> addressed</span>
					<span class="flex items-center gap-1"><CoverageDot status="partial" /> partly</span>
					<span class="flex items-center gap-1"><CoverageDot status="not_addressed" /> not yet</span
					>
				</p>
			</div>
			<table class="mt-5 w-full text-sm">
				<thead>
					<tr class="text-left text-xs text-muted">
						<th class="pb-2 font-normal">Research question</th>
						{#each data.interviews as i (i.id)}
							<th class="px-2 pb-2 text-center font-normal">
								<a href={`/studies/${study.id}/interviews/${i.id}`} class="hover:text-fg"
									>{i.label}</a
								>
							</th>
						{/each}
						<th class="px-2 pb-2 text-center font-normal">Study</th>
					</tr>
				</thead>
				<tbody>
					{#each study.researchQuestions as rq (rq.id)}
						<tr class="border-t border-line/70 align-top">
							<td class="py-3 pr-4">
								<span class="mr-2 text-xs text-brand">{rq.id}</span>{rq.text}
							</td>
							{#each data.interviews as i (i.id)}
								<td class="px-2 py-3 text-center"
									><CoverageDot status={coverageOf(i, rq.id)} label={`${i.label} · ${rq.id}`} /></td
								>
							{/each}
							<td class="px-2 py-3 text-center"
								><CoverageDot status={studyCoverage(rq.id)} label={rq.id} /></td
							>
						</tr>
					{/each}
				</tbody>
			</table>
			{#if study.hypotheses.length}
				<details class="mt-5 text-sm">
					<summary class="cursor-pointer text-muted hover:text-fg"
						>Hypotheses ({study.hypotheses.length})</summary
					>
					<ul class="mt-2 space-y-1 text-fg-2">
						{#each study.hypotheses as h (h.id)}
							<li><span class="mr-2 text-xs text-brand">{h.id}</span>{h.text}</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>

		<!-- Interview guide carried into the next session -->
		<section class="card" aria-labelledby="guide-h">
			<div class="flex items-baseline justify-between">
				<h2 id="guide-h" class="text-2xl">Next-session guide</h2>
				{#if activeGuide.length}
					<a href={`/studies/${study.id}/guide.md`} class="btn-ghost btn btn-sm" download>Export</a>
				{/if}
			</div>
			<p class="mt-1 text-xs text-muted">
				Probes you keep land here. Live mode ticks them off as you ask them.
			</p>
			{#if activeGuide.length === 0}
				<p class="mt-4 text-sm text-fg-2">
					Nothing yet. Reflect on an interview and add the probes you like, or write your own below.
				</p>
			{/if}
			<ol class="mt-4 space-y-2" data-testid="guide-list">
				{#each activeGuide as g, idx (g.id)}
					<li class="group rounded-lg border border-line bg-ink/40 p-3">
						{#if editing === g.id}
							<form
								method="POST"
								action="?/guideEdit"
								use:enhance={() =>
									async ({ update }) => {
										await update();
										editing = null;
									}}
							>
								<input type="hidden" name="id" value={g.id} />
								<textarea name="text" class="input min-h-16">{g.text}</textarea>
								<div class="mt-2 flex justify-end gap-2">
									<button type="button" class="btn btn-sm" onclick={() => (editing = null)}
										>Cancel</button
									>
									<button class="btn btn-primary btn-sm">Save</button>
								</div>
							</form>
						{:else}
							<div class="flex gap-3">
								<span class="mt-0.5 text-xs text-muted">{idx + 1}</span>
								<div class="min-w-0 flex-1">
									<p class={`text-sm ${g.status === 'asked' ? 'text-muted line-through' : ''}`}>
										{g.text}
									</p>
									<div class="mt-1.5 flex flex-wrap gap-1">
										{#if g.probeType !== 'manual'}<span class="chip">{g.probeType}</span>{/if}
										{#each g.targets as t (t)}<span class="chip text-brand">{t}</span>{/each}
										{#if g.status === 'asked'}<span class="chip border-ok/50 text-ok">asked</span
											>{/if}
									</div>
								</div>
							</div>
							<div class="mt-2 flex flex-wrap gap-1 opacity-70 group-hover:opacity-100">
								<form method="POST" action="?/guideStatus" use:enhance>
									<input type="hidden" name="id" value={g.id} />
									<input
										type="hidden"
										name="status"
										value={g.status === 'asked' ? 'active' : 'asked'}
									/>
									<button class="btn-ghost btn btn-sm"
										>{g.status === 'asked' ? 'Mark not asked' : 'Mark asked'}</button
									>
								</form>
								<button class="btn-ghost btn btn-sm" onclick={() => (editing = g.id)}>Edit</button>
								<form method="POST" action="?/guideMove" use:enhance>
									<input type="hidden" name="id" value={g.id} /><input
										type="hidden"
										name="dir"
										value="up"
									/>
									<button class="btn-ghost btn btn-sm" aria-label="Move up" disabled={idx === 0}
										>↑</button
									>
								</form>
								<form method="POST" action="?/guideMove" use:enhance>
									<input type="hidden" name="id" value={g.id} /><input
										type="hidden"
										name="dir"
										value="down"
									/>
									<button
										class="btn-ghost btn btn-sm"
										aria-label="Move down"
										disabled={idx === activeGuide.length - 1}>↓</button
									>
								</form>
								<form method="POST" action="?/guideStatus" use:enhance>
									<input type="hidden" name="id" value={g.id} /><input
										type="hidden"
										name="status"
										value="archived"
									/>
									<button class="btn-ghost btn btn-sm">Archive</button>
								</form>
							</div>
						{/if}
					</li>
				{/each}
			</ol>
			<form method="POST" action="?/addGuide" class="mt-4 flex gap-2" use:enhance>
				<input
					name="text"
					class="input"
					placeholder="Add your own question…"
					aria-label="New guide question"
				/>
				<button class="btn">Add</button>
			</form>
			{#if form?.guideError}<p class="hint text-bad">{form.guideError}</p>{/if}
			{#if archived.length}
				<details class="mt-4 text-xs text-muted">
					<summary class="cursor-pointer">Archived ({archived.length})</summary>
					<ul class="mt-2 space-y-1">
						{#each archived as g (g.id)}
							<li class="flex items-center justify-between gap-2">
								<span>{g.text}</span>
								<form method="POST" action="?/guideStatus" use:enhance>
									<input type="hidden" name="id" value={g.id} /><input
										type="hidden"
										name="status"
										value="active"
									/>
									<button class="btn-ghost btn btn-sm">Restore</button>
								</form>
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		</section>
	</div>

	<!-- Interviews -->
	<section class="mt-10">
		<h2 class="mb-4 text-2xl">Interviews</h2>
		{#if data.interviews.length === 0}
			<div class="card text-sm text-fg-2">
				No interviews yet. Upload a recording, paste a transcript, or <a
					class="link"
					href={`/studies/${study.id}/interviews/new`}>run one live</a
				>.
			</div>
		{:else}
			<ul class="grid gap-4 md:grid-cols-2">
				{#each data.interviews as i (i.id)}
					<li>
						<a
							href={i.status === 'live'
								? `/studies/${study.id}/interviews/${i.id}/live`
								: `/studies/${study.id}/interviews/${i.id}`}
							class="card block h-full hover:border-brand/60"
						>
							<div class="flex items-center justify-between">
								<h3 class="text-xl">{i.label}</h3>
								<span class="chip">
									{i.status === 'live' ? 'in progress' : i.source} · {fmt(i.createdAt)}
								</span>
							</div>
							{#if i.participantNote}<p class="mt-1 text-sm text-muted">{i.participantNote}</p>{/if}
							<p class="mt-3 line-clamp-3 text-sm text-fg-2">
								{i.summary ?? `${i.segmentCount} turns · ${i.words} words · not reflected on yet`}
							</p>
						</a>
					</li>
				{/each}
			</ul>
		{/if}
	</section>
</div>
