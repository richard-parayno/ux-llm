<script lang="ts">
	import { PROBE_TYPE_HELP } from '#lib/constants.js';
	import type { ProbeIssue, ResearchItem, VerifiedProbe } from '#lib/domain.js';
	import type { ProbeState } from '#lib/ui.js';

	let {
		probe,
		index,
		state: s,
		items,
		rejected = false,
		onfocus,
		onaction,
		onrefine
	}: {
		probe: VerifiedProbe;
		index: number;
		state: ProbeState;
		items: ResearchItem[];
		rejected?: boolean;
		onfocus: (seg: number) => void;
		onaction?: (
			action: 'guide' | 'dismiss' | 'undismiss' | 'helpful' | 'not_helpful' | 'edit',
			payload?: string
		) => void;
		onrefine?: (
			preset: string | null,
			instruction?: string
		) => Promise<{ question: string; note: string } | null>;
	} = $props();

	let editing = $state(false);
	let draft = $state('');
	let refineOpen = $state(false);
	let refining = $state(false);
	let custom = $state('');
	let suggestion = $state<{ question: string; note: string } | null>(null);

	const presets = [
		['simpler', 'Simpler wording'],
		['less_leading', 'Less leading'],
		['concrete', 'Ask for a specific example'],
		['shorter', 'Shorter'],
		['local_language', "Participant's language"],
		['softer', 'Gentler']
	] as const;

	const issueText: Record<ProbeIssue, string> = {
		ungrounded: 'quote not found in transcript',
		repeats_asked_question: 'repeats a question already asked',
		duplicate_probe: 'duplicate of another probe',
		closed_question: 'yes/no question',
		multiple_questions: 'asks several things at once',
		unknown_target: 'cited an unknown research question'
	};
	const priorityDot = { high: 'bg-brand', medium: 'bg-warn/70', low: 'bg-line-strong' } as const;

	async function refine(preset: string | null) {
		if (!onrefine) return;
		refining = true;
		suggestion = await onrefine(preset, preset ? undefined : custom);
		refining = false;
	}
	const targetTitle = (id: string) => items.find((i) => i.id === id)?.text ?? id;
</script>

{#if s.dismissed}
	<div
		class="flex items-center justify-between rounded-lg border border-dashed border-line px-4 py-2 text-xs text-muted"
	>
		<span class="truncate">Dismissed: {s.question}</span>
		<button class="btn-ghost btn btn-sm" onclick={() => onaction?.('undismiss')}>Undo</button>
	</div>
{:else}
	<article
		class={`rounded-xl border p-4 ${rejected ? 'border-dashed border-line bg-transparent opacity-80' : 'border-line bg-ink/40'}`}
		data-testid={rejected ? 'rejected-probe' : 'probe'}
	>
		<header class="flex flex-wrap items-center gap-1.5 text-xs">
			<span class="mr-1 text-muted tabular-nums">{index + 1}</span>
			<span
				class={`size-2 rounded-full ${priorityDot[probe.priority]}`}
				title={`${probe.priority} priority`}
			></span>
			<span class="chip" title={PROBE_TYPE_HELP[probe.probeType]}>{probe.probeType}</span>
			{#if probe.basis === 'gap'}<span
					class="chip border-info/50 text-info"
					title="Targets a research question the interview has not covered">coverage gap</span
				>{/if}
			{#each probe.targets as t (t)}<span class="chip text-brand" title={targetTitle(t)}>{t}</span
				>{/each}
			{#if probe.repaired}<span
					class="chip"
					title="Regenerated after the first draft failed verification">revised</span
				>{/if}
			{#if s.inGuide}<span class="chip ml-auto border-ok/50 text-ok">in guide</span>{/if}
		</header>

		{#if editing}
			<textarea class="input mt-3 min-h-20" bind:value={draft}></textarea>
			<div class="mt-2 flex justify-end gap-2">
				<button class="btn btn-sm" onclick={() => (editing = false)}>Cancel</button>
				<button
					class="btn btn-primary btn-sm"
					onclick={() => {
						onaction?.('edit', draft.trim());
						editing = false;
					}}>Save</button
				>
			</div>
		{:else}
			<p class="mt-3 font-display text-xl leading-snug" data-testid="probe-question">
				{s.question}
			</p>
		{/if}

		{#if probe.anchors.length}
			<div class="mt-3 space-y-1.5">
				{#each probe.anchors as a, i (i)}
					<button
						class="group flex w-full items-start gap-2 rounded-md border-l-2 border-info/60 bg-info-wash/40 px-3 py-1.5 text-left text-sm text-fg-2 hover:bg-info-wash"
						onclick={() => onfocus(a.seg)}
						title="Show in transcript"
					>
						<span class="flex-1 italic">“{a.quote}”</span>
						<span
							class={`shrink-0 text-[11px] ${a.grounding === 'exact' ? 'text-ok' : 'text-warn'}`}
						>
							{a.grounding === 'exact' ? '✓ verified' : '≈ close match'} · [{a.seg}]
						</span>
					</button>
				{/each}
			</div>
		{/if}

		<dl class="mt-3 space-y-1 text-sm">
			<div>
				<dt class="sr-only">Why</dt>
				<dd class="text-fg-2">{probe.rationale}</dd>
			</div>
			{#if probe.whenToAsk}<div>
					<dt class="sr-only">When</dt>
					<dd class="text-xs text-muted">When: {probe.whenToAsk}</dd>
				</div>{/if}
		</dl>

		{#if rejected}
			<p class="mt-3 text-xs text-bad">
				Filtered out: {probe.checks.issues.map((i) => issueText[i]).join(', ')}
				{#if probe.checks.mostSimilarAsked && probe.checks.issues.includes('repeats_asked_question')}
					— you asked “{probe.checks.mostSimilarAsked}”
				{/if}
			</p>
		{:else}
			{#if suggestion}
				<div class="mt-3 rounded-lg border border-brand/50 bg-brand-wash p-3 text-sm">
					<p class="font-display text-lg">{suggestion.question}</p>
					<p class="mt-1 text-xs text-muted">{suggestion.note}</p>
					<div class="mt-2 flex gap-2">
						<button
							class="btn btn-primary btn-sm"
							onclick={() => {
								onaction?.('edit', suggestion!.question);
								suggestion = null;
							}}>Use this</button
						>
						<button class="btn btn-sm" onclick={() => (suggestion = null)}>Keep original</button>
					</div>
				</div>
			{/if}

			<footer class="mt-4 flex flex-wrap items-center gap-1.5">
				<button
					class="btn btn-sm"
					class:btn-primary={!s.inGuide}
					disabled={s.inGuide}
					onclick={() => onaction?.('guide')}
					data-testid="add-to-guide"
				>
					{s.inGuide ? 'Added ✓' : 'Add to guide'}
				</button>
				<button
					class="btn btn-sm"
					onclick={() => (refineOpen = !refineOpen)}
					aria-expanded={refineOpen}>Refine</button
				>
				<button
					class="btn btn-sm"
					onclick={() => {
						draft = s.question;
						editing = true;
					}}>Edit</button
				>
				<button class="btn-ghost btn btn-sm" onclick={() => onaction?.('dismiss')}>Dismiss</button>
				<span class="ml-auto flex gap-1">
					<button
						class={`btn-ghost btn btn-sm ${s.rating === 'helpful' ? 'text-ok' : ''}`}
						aria-pressed={s.rating === 'helpful'}
						onclick={() => onaction?.('helpful')}
						title="Useful">▲</button
					>
					<button
						class={`btn-ghost btn btn-sm ${s.rating === 'not_helpful' ? 'text-bad' : ''}`}
						aria-pressed={s.rating === 'not_helpful'}
						onclick={() => onaction?.('not_helpful')}
						title="Not useful">▼</button
					>
				</span>
			</footer>

			{#if refineOpen}
				<div class="mt-3 flex flex-wrap gap-1.5 border-t border-line pt-3">
					{#each presets as [key, label] (key)}
						<button
							class="chip hover:border-brand hover:text-fg"
							disabled={refining}
							onclick={() => refine(key)}>{label}</button
						>
					{/each}
					<form
						class="mt-1 flex w-full gap-2"
						onsubmit={(e) => {
							e.preventDefault();
							if (custom.trim()) refine(null);
						}}
					>
						<input
							class="input py-1 text-xs"
							placeholder="Or say how to change it…"
							bind:value={custom}
						/>
						<button class="btn btn-sm" disabled={refining || !custom.trim()}>Go</button>
					</form>
					{#if refining}<p class="w-full text-xs text-muted">Rephrasing…</p>{/if}
				</div>
			{/if}
		{/if}
	</article>
{/if}
