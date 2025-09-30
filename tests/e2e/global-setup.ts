import { chromium, FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('🚀 Starting global Playwright setup...');

  // Create a browser instance for setup
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Wait for the application to be ready
    const baseURL = config.projects[0].use.baseURL || 'http://localhost:3000';
    console.log(`📋 Checking application readiness at: ${baseURL}`);

    // Health check
    await page.goto(`${baseURL}/api/health`);
    const response = await page.textContent('body');

    if (response && response.includes('"status":"ok"')) {
      console.log('✅ Application health check passed');
    } else {
      console.warn('⚠️ Application health check failed, proceeding anyway');
    }

    // Set up any global state or authentication tokens if needed
    console.log('🔧 Global setup completed successfully');
  } catch (error) {
    console.error('❌ Global setup failed:', error);
    // Don't fail setup, let tests handle their own failures
  } finally {
    await context.close();
    await browser.close();
  }
}

export default globalSetup;