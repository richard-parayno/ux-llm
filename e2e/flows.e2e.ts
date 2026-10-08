import { expect, test, type Page } from '@playwright/test';

async function hydrated(page: Page) {
	await page.waitForLoadState('networkidle');
}

async function openDemoInterview(page: Page) {
	await page.goto('/');
	await hydrated(page);
	await page.getByTestId('load-demo').click();
	await page.waitForURL(/\/studies\/[^/]+$/);
	await hydrated(page);
	await page.getByRole('link', { name: /^P01/ }).first().click();
	await page.waitForURL(/\/interviews\/[^/]+$/);
	await hydrated(page);
}

test('demo study: consent, reflect, keep a probe, export the guide', async ({ page }) => {
	await expect(async () => {
		await page.goto('/');
		await expect(page.getByTestId('demo-badge')).toBeVisible();
	}).toPass();
	await openDemoInterview(page);

	// AI processing is gated on consent.
	await expect(page.getByTestId('reflect-form')).toHaveCount(0);
	await page.getByRole('checkbox', { name: /agreed/ }).check();
	await page.getByTestId('confirm-consent').click();

	await page.getByTestId('run-reflection').click();
	await expect(page.getByTestId('probe').first()).toBeVisible({ timeout: 20_000 });
	await expect(page.getByTestId('probe')).toHaveCount(5);
	await expect(page.getByTestId('summary')).toContainText('participant');
	// Transcript-based probes show a verified quote that links into the transcript.
	await expect(page.getByText('✓ verified').first()).toBeVisible();

	const firstQuestion = await page.getByTestId('probe-question').first().textContent();
	await page.getByTestId('add-to-guide').first().click();
	await expect(page.getByTestId('add-to-guide').first()).toHaveText(/Added/);

	await page.getByRole('tab', { name: /Your interviewing/ }).click();
	await expect(page.getByText('Question craft')).toBeVisible();

	await page.getByRole('link', { name: 'Commuting in Metro Manila' }).click();
	await expect(page.getByTestId('guide-list')).toContainText(firstQuestion!.trim());

	const download = page.waitForEvent('download');
	await page.getByRole('link', { name: 'Export' }).click();
	const file = await download;
	expect(file.suggestedFilename()).toBe('commuting-in-metro-manila-guide.md');
});

test('new study from scratch with a pasted transcript', async ({ page }) => {
	await page.goto('/studies/new');
	await hydrated(page);
	await page.getByLabel('Study title').fill('Grocery delivery');
	await page
		.getByLabel('Research goal')
		.fill('Understand how families decide what to order online for groceries.');
	await page
		.getByLabel(/Research questions/)
		.fill('How do families build their weekly order?\nWhat makes them switch apps?');
	await page.getByRole('button', { name: 'Create study' }).click();
	await page.waitForURL(/\/studies\/[^/]+$/);
	await expect(page.getByText('RQ2')).toBeVisible();

	await page.getByTestId('add-interview').click();
	await hydrated(page);
	await page
		.getByLabel('Transcript', { exact: true })
		.fill(
			[
				'Interviewer: How do you put together your weekly grocery order?',
				"Participant: I start from last week's order in the app and then my kids add snacks to a shared note on the fridge.",
				'Interviewer: What happens when something is out of stock?',
				'Participant: Honestly I get annoyed, because the substitutions are random. Last month they replaced oat milk with condensed milk, so now I always tick "no substitutions".'
			].join('\n')
		);
	await page.getByTestId('import-transcript').click();
	await page.waitForURL(/\/interviews\/[^/]+\?imported=/);
	await expect(page.getByText(/Imported a labelled transcript/)).toBeVisible();
	await expect(page.getByTestId('transcript')).toContainText('condensed milk');

	await hydrated(page);
	await page.getByRole('checkbox', { name: /agreed/ }).check();
	await page.getByTestId('confirm-consent').click();
	await page.getByTestId('run-reflection').click();
	await expect(page.getByTestId('reflection')).toContainText(/short/, { timeout: 20_000 });
});

test('live mode: simulate a session, get nudges, end and reflect', async ({ page }) => {
	await page.goto('/');
	await hydrated(page);
	await page.getByTestId('load-demo').click();
	await page.waitForURL(/\/studies\/[^/]+$/);
	await hydrated(page);
	await page.getByTestId('add-interview').click();
	await hydrated(page);
	await page.getByRole('tab', { name: /Live session/ }).click();
	await page.getByTestId('start-live').click();
	await page.waitForURL(/\/live$/);
	await hydrated(page);

	await page.getByRole('checkbox').check();
	await page.getByTestId('live-consent').click();
	await expect(page.getByTestId('live-setup')).toBeVisible();
	await hydrated(page);
	await page.locator('#speed').fill('20');
	await page.getByTestId('start-session').click();

	await expect(page.getByTestId('nudge').first()).toBeVisible({ timeout: 30_000 });
	expect(await page.getByTestId('nudge').count()).toBeLessThanOrEqual(2);

	await page.getByTestId('finish-live').click();
	await page.waitForURL(/\/interviews\/[^/]+$/);
	await expect(page.getByTestId('transcript')).toContainText('Interviewer');
});
