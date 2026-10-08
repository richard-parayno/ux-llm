<script lang="ts">
	import type { Segment } from '#lib/domain.js';

	let {
		segments,
		highlighted = new Set<number>(),
		focus = null,
		interim = ''
	}: {
		segments: Segment[];
		highlighted?: Set<number>;
		focus?: number | null;
		interim?: string;
	} = $props();

	let container: HTMLDivElement | undefined = $state();

	$effect(() => {
		if (focus === null || !container) return;
		const el = container.querySelector<HTMLElement>(`[data-seg="${focus}"]`);
		el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
	});

	const roleStyle: Record<Segment['role'], string> = {
		interviewer: 'text-brand',
		participant: 'text-info',
		observer: 'text-muted',
		unknown: 'text-fg-2'
	};
	const fmt = (ms: number | null) => {
		if (ms === null) return '';
		const s = Math.floor(ms / 1000);
		return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
	};
</script>

<div bind:this={container} class="space-y-3" data-testid="transcript">
	{#each segments as s (s.idx)}
		<div
			data-seg={s.idx}
			class={`grid grid-cols-[3.25rem_1fr] gap-2 rounded-lg px-2 py-1.5 transition-colors ${
				focus === s.idx
					? 'bg-brand-wash ring-1 ring-brand'
					: highlighted.has(s.idx)
						? 'bg-layer-2'
						: ''
			}`}
		>
			<div class="pt-0.5 text-right text-[11px] leading-tight text-faint tabular-nums">
				<div>[{s.idx}]</div>
				{#if s.startMs !== null}<div>{fmt(s.startMs)}</div>{/if}
			</div>
			<div class="min-w-0">
				<div class={`text-xs font-medium ${roleStyle[s.role]}`}>
					{s.speaker}{#if s.role !== 'unknown' && s.speaker.toLowerCase() !== s.role}<span
							class="text-faint"
						>
							· {s.role}</span
						>{/if}
				</div>
				<p class="text-sm leading-relaxed whitespace-pre-wrap text-fg">{s.text}</p>
			</div>
		</div>
	{/each}
	{#if interim}
		<div class="grid grid-cols-[3.25rem_1fr] gap-2 px-2 py-1.5">
			<div></div>
			<p class="text-sm text-muted italic">{interim}</p>
		</div>
	{/if}
</div>
