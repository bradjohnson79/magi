import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined, // 2 parallel workers in CI
  reporter: process.env.CI
    ? [['github'], ['html'], ['junit', { outputFile: 'test-results/junit.xml' }]]
    : [['html'], ['list']],

  // Global test settings
  timeout: 30000,
  expect: {
    timeout: 5000,
  },

  use: {
    baseURL: process.env.BASE_URL || 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Browser context settings
    contextOptions: {
      ignoreHTTPSErrors: true,
    },
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        // Additional security headers for testing
        extraHTTPHeaders: {
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        },
      },
    },
    // Uncomment for cross-browser testing
    // {
    //   name: 'firefox',
    //   use: { ...devices['Desktop Firefox'] },
    // },
    // {
    //   name: 'webkit',
    //   use: { ...devices['Desktop Safari'] },
    // },
  ],

  webServer: {
    command: process.env.CI ? 'pnpm build && pnpm start' : 'pnpm dev',
    url: process.env.BASE_URL || 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000, // 2 minutes for server to start
    env: {
      NODE_ENV: process.env.NODE_ENV || 'test',
    },
  },

  // Test output directories
  outputDir: 'test-results/',

  // Global setup and teardown
  globalSetup: process.env.CI ? undefined : require.resolve('./tests/e2e/global-setup.ts'),
  globalTeardown: process.env.CI ? undefined : require.resolve('./tests/e2e/global-teardown.ts'),
});