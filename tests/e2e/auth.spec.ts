import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should navigate to login page', async ({ page }) => {
    await page.goto('/');

    // Check if we're redirected to login or see a login button
    // Since Clerk is integrated, we should see Clerk's UI
    await expect(page).toHaveURL(/.*\/(sign-in|login|auth).*/);
  });

  test('should protect dashboard route', async ({ page }) => {
    // Try to access dashboard without authentication
    await page.goto('/dashboard');

    // Should be redirected to authentication
    await expect(page).toHaveURL(/.*\/(sign-in|login|auth).*/);
  });

  test.skip('should allow access after login', async ({ page }) => {
    // This test would require mocking Clerk authentication
    // Skipping for now as it requires more complex setup

    // Mock login process
    // await page.goto('/auth/login');
    // await page.fill('[name="email"]', 'test@magi.dev');
    // await page.fill('[name="password"]', 'testpassword');
    // await page.click('button[type="submit"]');

    // Should redirect to dashboard
    // await expect(page).toHaveURL('/dashboard');
    // await expect(page.locator('text=Magi')).toBeVisible();
  });

  test('should verify API endpoints respond correctly', async ({ page }) => {
    // Test health endpoint
    const healthResponse = await page.request.get('/api/health');
    expect(healthResponse.status()).toBe(200);

    const healthData = await healthResponse.json();
    expect(healthData).toHaveProperty('status', 'healthy');
    expect(healthData).toHaveProperty('timestamp');
    expect(healthData).toHaveProperty('uptime');
  });

  test('should protect v1 API routes', async ({ page }) => {
    // Test that v1 API routes require authentication
    const projectResponse = await page.request.get('/api/v1/projects/test123');

    // Should return 404 HTML (Clerk's protection) or 401 JSON
    expect([401, 404]).toContain(projectResponse.status());
  });

  test.skip('should create project after authentication', async ({ page }) => {
    // This test would run after authentication is mocked
    //
    // 1. Navigate to dashboard
    // await page.goto('/dashboard');
    //
    // 2. Find "Create Project" button
    // await page.click('button:has-text("Create Project")');
    //
    // 3. Fill project form
    // await page.fill('[name="name"]', 'Test Project E2E');
    // await page.fill('[name="description"]', 'Created via Playwright test');
    //
    // 4. Submit form
    // await page.click('button[type="submit"]');
    //
    // 5. Verify project appears in list
    // await expect(page.locator('text=Test Project E2E')).toBeVisible();
    //
    // 6. Verify project page loads
    // await page.click('text=Test Project E2E');
    // await expect(page).toHaveURL(/\/projects\/[a-z0-9-]+/);
    //
    // 7. Test preview branch creation
    // await page.click('button:has-text("Preview Changes")');
    // await page.fill('[name="branchName"]', 'test-feature');
    // await page.click('button:has-text("Create Preview Branch")');
    //
    // 8. Verify branch creation
    // await expect(page.locator('text=test-feature')).toBeVisible();
  });
});