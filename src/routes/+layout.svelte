<script lang="ts">
	import './layout.css';
	import type { LayoutProps } from './$types';

	let { children, data }: LayoutProps = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.png" />
	<title>intavue — probing co-pilot for UX interviews</title>
</svelte:head>

<div class="flex min-h-screen flex-col">
	<header class="sticky top-0 z-30 border-b border-line/70 bg-ink/80 backdrop-blur">
		<div class="mx-auto flex h-14 max-w-7xl items-center gap-6 px-4 sm:px-6">
			<a href="/" class="flex items-center gap-2" aria-label="intavue home">
				<img src="/logo.svg" alt="" class="h-4 w-auto" />
			</a>
			<nav class="flex items-center gap-1 text-sm">
				<a href="/" class="btn-ghost btn btn-sm">Studies</a>
				<a href="/about" class="btn-ghost btn btn-sm">How it works</a>
			</nav>
			<div class="ml-auto flex items-center gap-2 text-xs">
				{#if data.caps.demoMode}
					<span
						class="chip border-warn/50 text-warn"
						title="No ANTHROPIC_API_KEY is set, so suggestions come from a deterministic heuristic, not an LLM."
						data-testid="demo-badge">Demo mode · no LLM key</span
					>
				{:else}
					<span class="chip" title="Model used for reflections">{data.caps.model}</span>
				{/if}
				{#if !data.caps.stt}
					<span class="chip hidden sm:inline-flex" title="Set DEEPGRAM_API_KEY to enable audio">
						Audio off
					</span>
				{/if}
			</div>
		</div>
	</header>

	<main class="flex-1">
		{@render children()}
	</main>

	<footer class="border-t border-line/70">
		<div
			class="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-xs text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6"
		>
			<p>
				intavue suggests; you decide. Interviewing needs a human touch — this tool supports the
				interviewer and never replaces them.
			</p>
			<p>
				Based on <em>The Probing Machine</em> (Tran, Parayno, Venkitachalam, Deja &amp; Deja).
			</p>
		</div>
	</footer>
</div>
