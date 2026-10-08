import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
	testDir: 'e2e',
	testMatch: '**/*.e2e.ts',
	fullyParallel: false,
	retries: process.env.CI ? 1 : 0,
	reporter: process.env.CI ? 'github' : 'list',
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: 'retain-on-failure',
		...devices['Desktop Chrome'],
		viewport: { width: 1440, height: 1000 },
		launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {}
	},
	webServer: {
		// Always the offline mock provider: e2e tests must not depend on API keys.
		command: 'rm -rf data/e2e && pnpm build && node server.js',
		port: PORT,
		reuseExistingServer: false,
		timeout: 180_000,
		env: {
			PORT: String(PORT),
			DATABASE_URL: 'file:data/e2e/e2e.db',
			INTAVUE_LLM_PROVIDER: 'mock',
			ANTHROPIC_API_KEY: '',
			DEEPGRAM_API_KEY: ''
		}
	}
});
