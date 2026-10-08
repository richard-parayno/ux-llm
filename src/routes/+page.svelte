<script lang="ts">
	import { enhance } from '$app/forms';
	import type { PageProps } from './$types';

	let { data }: PageProps = $props();
	let seeding = $state(false);
</script>

<section class="mx-auto max-w-7xl px-4 pt-14 pb-10 sm:px-6">
	<p class="eyebrow">A probing co-pilot for UX interviews</p>
	<h1 class="mt-3 max-w-3xl text-4xl leading-tight sm:text-6xl">
		Better follow-up questions, <span class="text-brand italic">grounded in what people said.</span>
	</h1>
	<p class="mt-5 max-w-2xl text-fg-2">
		Bring a recording, a transcript, or run your session live. intavue reflects on the interview
		against your research questions and suggests probes for the next one — every suggestion tied to
		a verified quote, never a question you already asked.
	</p>
	<div class="mt-8 flex flex-wrap gap-3">
		<a href="/studies/new" class="btn btn-primary">Start a study</a>
		<form
			method="POST"
			action="?/demo"
			use:enhance={() => {
				seeding = true;
				return async ({ update }) => {
					await update();
					seeding = false;
				};
			}}
		>
			<button class="btn" disabled={seeding} data-testid="load-demo">
				{seeding ? 'Loading…' : 'Explore the commuting demo study'}
			</button>
		</form>
	</div>
</section>

<section class="mx-auto max-w-7xl px-4 pb-16 sm:px-6">
	<div class="mb-4 flex items-end justify-between">
		<h2 class="text-2xl">Your studies</h2>
	</div>
	{#if data.studies.length === 0}
		<div class="card text-sm text-muted">
			No studies yet. A study holds your research goal, questions and hypotheses, plus every
			interview you run for it — so suggestions after interview 3 build on interviews 1 and 2.
		</div>
	{:else}
		<ul class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.studies as study (study.id)}
				<li>
					<a
						href={`/studies/${study.id}`}
						class="card block h-full transition-colors hover:border-brand/60"
					>
						<h3 class="text-xl">{study.title}</h3>
						<p class="mt-2 line-clamp-3 text-sm text-fg-2">{study.goal}</p>
						<p class="mt-4 flex gap-2 text-xs text-muted">
							<span class="chip">{study.researchQuestions.length} RQs</span>
							<span class="chip"
								>{study.interviewCount} interview{study.interviewCount === 1 ? '' : 's'}</span
							>
						</p>
					</a>
				</li>
			{/each}
		</ul>
	{/if}
</section>
