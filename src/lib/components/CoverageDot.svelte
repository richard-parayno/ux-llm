<script lang="ts">
	import type { CoverageStatus } from '#lib/domain.js';

	let { status, label = '' }: { status: CoverageStatus | null; label?: string } = $props();
	const styles: Record<string, string> = {
		addressed: 'bg-ok border-ok',
		partial: 'bg-warn/60 border-warn',
		not_addressed: 'bg-transparent border-line-strong',
		none: 'bg-transparent border-dashed border-line'
	};
	const text: Record<string, string> = {
		addressed: 'Addressed',
		partial: 'Partly addressed',
		not_addressed: 'Not addressed',
		none: 'No reflection yet'
	};
</script>

<span
	class={`inline-block size-3.5 rounded-full border ${styles[status ?? 'none']}`}
	title={`${label ? label + ': ' : ''}${text[status ?? 'none']}`}
	aria-label={`${label ? label + ': ' : ''}${text[status ?? 'none']}`}
	role="img"
></span>
