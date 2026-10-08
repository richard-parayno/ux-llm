<script lang="ts">
	import { page } from '$app/state';
</script>

<div class="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
	<p class="eyebrow">{page.status}</p>
	<h1 class="mt-3 text-4xl">{page.status === 404 ? 'Nothing here' : 'Something went wrong'}</h1>
	<p class="mt-4 text-fg-2">{page.error?.message}</p>
	<a href="/" class="btn mt-8">Back to studies</a>
</div>
