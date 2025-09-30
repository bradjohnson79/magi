import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Browser, Page, chromium } from 'playwright';

// End-to-End tests for marketplace functionality
// These tests simulate real user workflows for plugin/template marketplace

describe('Marketplace E2E Tests', () => {
  let browser: Browser;
  let page: Page;
  let adminPage: Page;
  let baseURL: string;

  beforeAll(async () => {
    browser = await chromium.launch({
      headless: process.env.CI === 'true'
    });
    baseURL = process.env.TEST_URL || 'http://localhost:3000';
  });

  afterAll(async () => {
    await browser.close();
  });

  beforeEach(async () => {
    page = await browser.newPage();
    adminPage = await browser.newPage();

    // Mock authentication for regular user
    await page.addInitScript(() => {
      (window as any).__TEST_USER__ = {
        id: 'user-1',
        name: 'Test User',
        email: 'user@test.com',
        role: 'user'
      };
    });

    // Mock authentication for admin user
    await adminPage.addInitScript(() => {
      (window as any).__TEST_USER__ = {
        id: 'admin-1',
        name: 'Admin User',
        email: 'admin@test.com',
        role: 'admin'
      };
    });
  });

  afterEach(async () => {
    await page.close();
    await adminPage.close();
  });

  describe('Plugin Installation and Execution Workflow', () => {
    it('should complete full plugin installation and execution workflow', async () => {
      // Navigate to marketplace
      await page.goto(`${baseURL}/marketplace`);
      await page.waitForSelector('[data-testid="marketplace-browser"]');

      // Search for a plugin
      const searchInput = page.locator('[data-testid="marketplace-search"]');
      await searchInput.fill('text processor');
      await page.keyboard.press('Enter');

      // Wait for search results
      await page.waitForSelector('[data-testid="marketplace-item-card"]');

      // Click on first plugin result
      const firstPlugin = page.locator('[data-testid="marketplace-item-card"]').first();
      await firstPlugin.click();

      // Verify we're on plugin details page
      await page.waitForSelector('[data-testid="plugin-details"]');
      await expect(page.locator('[data-testid="plugin-name"]')).toBeVisible();

      // Check plugin details tabs
      await page.click('[data-testid="tab-permissions"]');
      await expect(page.locator('[data-testid="permissions-list"]')).toBeVisible();

      await page.click('[data-testid="tab-details"]');
      await expect(page.locator('[data-testid="plugin-manifest"]')).toBeVisible();

      // Install the plugin
      const installButton = page.locator('[data-testid="install-button"]');
      await installButton.click();

      // Wait for installation confirmation
      await page.waitForSelector('[data-testid="installation-success"]');
      await expect(page.locator('[data-testid="uninstall-button"]')).toBeVisible();

      // Navigate to installed plugins
      await page.goto(`${baseURL}/workspace/plugins`);
      await page.waitForSelector('[data-testid="installed-plugins"]');

      // Verify plugin appears in installed list
      const installedPlugin = page.locator('[data-testid="installed-plugin-item"]').first();
      await expect(installedPlugin).toBeVisible();

      // Execute the plugin
      await installedPlugin.click();
      await page.waitForSelector('[data-testid="plugin-execution-form"]');

      // Fill in plugin inputs
      const textInput = page.locator('[data-testid="plugin-input-text"]');
      await textInput.fill('Hello, world! This is a test.');

      const executeButton = page.locator('[data-testid="execute-plugin-button"]');
      await executeButton.click();

      // Wait for execution results
      await page.waitForSelector('[data-testid="plugin-execution-result"]');
      const result = page.locator('[data-testid="execution-output"]');
      await expect(result).toBeVisible();
      await expect(result).toContainText('processed');

      // Check execution metrics
      const metrics = page.locator('[data-testid="execution-metrics"]');
      await expect(metrics).toBeVisible();
      await expect(metrics).toContainText('execution time');
    });

    it('should handle plugin installation errors gracefully', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Try to install a plugin that requires payment
      await page.click('[data-testid="paid-plugin"]');
      await page.click('[data-testid="install-button"]');

      // Should show payment dialog or error
      await page.waitForSelector('[data-testid="payment-required"]');
      await expect(page.locator('[data-testid="payment-dialog"]')).toBeVisible();
    });

    it('should prevent installing plugins with dangerous permissions without warning', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Find a plugin with high-risk permissions
      await page.click('[data-testid="high-risk-plugin"]');
      await page.click('[data-testid="tab-permissions"]');

      // Should show security warning
      await expect(page.locator('[data-testid="security-warning"]')).toBeVisible();
      await expect(page.locator('[data-testid="high-risk-badge"]')).toBeVisible();

      // Install button should show additional confirmation
      await page.click('[data-testid="install-button"]');
      await page.waitForSelector('[data-testid="security-confirmation-dialog"]');

      const confirmButton = page.locator('[data-testid="confirm-security-risk"]');
      await confirmButton.click();

      await page.waitForSelector('[data-testid="installation-success"]');
    });
  });

  describe('Template Creation Workflow', () => {
    it('should create project from template', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Filter to templates only
      await page.click('[data-testid="filter-templates"]');
      await page.waitForSelector('[data-testid="marketplace-item-card"]');

      // Select a project template
      const template = page.locator('[data-testid="project-template"]').first();
      await template.click();

      await page.waitForSelector('[data-testid="template-details"]');

      // View template files
      await page.click('[data-testid="tab-details"]');
      await expect(page.locator('[data-testid="template-files-list"]')).toBeVisible();

      // Create project from template
      await page.click('[data-testid="create-from-template-button"]');
      await page.waitForSelector('[data-testid="template-creation-form"]');

      // Fill in template variables
      const projectNameInput = page.locator('[data-testid="template-var-projectName"]');
      await projectNameInput.fill('My New Project');

      const descriptionInput = page.locator('[data-testid="template-var-description"]');
      await descriptionInput.fill('A project created from template');

      // Submit template creation
      const createButton = page.locator('[data-testid="create-project-button"]');
      await createButton.click();

      // Wait for project creation
      await page.waitForSelector('[data-testid="project-created-success"]');

      // Should redirect to new project
      await page.waitForSelector('[data-testid="project-workspace"]');
      await expect(page.locator('[data-testid="project-name"]')).toContainText('My New Project');

      // Verify template files were created
      await page.click('[data-testid="file-explorer"]');
      await expect(page.locator('[data-testid="file-item"]')).toBeVisible();
    });

    it('should validate template variables', async () => {
      await page.goto(`${baseURL}/marketplace`);
      await page.click('[data-testid="filter-templates"]');

      const template = page.locator('[data-testid="project-template"]').first();
      await template.click();

      await page.click('[data-testid="create-from-template-button"]');
      await page.waitForSelector('[data-testid="template-creation-form"]');

      // Try to submit without required fields
      const createButton = page.locator('[data-testid="create-project-button"]');
      await createButton.click();

      // Should show validation errors
      await expect(page.locator('[data-testid="validation-error"]')).toBeVisible();
      await expect(page.locator('[data-testid="required-field-error"]')).toContainText('required');
    });
  });

  describe('Admin Review Workflow', () => {
    it('should review and approve plugin submission', async () => {
      // First, submit a plugin for review (as regular user)
      await page.goto(`${baseURL}/marketplace/submit`);
      await page.waitForSelector('[data-testid="plugin-submission-form"]');

      // Fill out plugin submission form
      await page.fill('[data-testid="plugin-name"]', 'Test Admin Plugin');
      await page.fill('[data-testid="plugin-description"]', 'A plugin for admin testing');
      await page.selectOption('[data-testid="plugin-category"]', 'automation');

      // Upload plugin manifest
      const manifestContent = JSON.stringify({
        name: 'Test Admin Plugin',
        version: '1.0.0',
        description: 'A plugin for admin testing',
        author: 'Test User',
        runtime: 'nodejs',
        entryPoint: 'index.js',
        inputs: { text: { type: 'string', required: true } },
        outputs: { result: { type: 'string' } },
        permissions: ['filesystem:read']
      });

      await page.setInputFiles('[data-testid="manifest-upload"]', {
        name: 'manifest.json',
        mimeType: 'application/json',
        buffer: Buffer.from(manifestContent)
      });

      // Submit for review
      await page.click('[data-testid="submit-for-review-button"]');
      await page.waitForSelector('[data-testid="submission-success"]');

      // Now switch to admin page for review
      await adminPage.goto(`${baseURL}/admin/marketplace`);
      await adminPage.waitForSelector('[data-testid="marketplace-admin"]');

      // Should see pending review notification
      await expect(adminPage.locator('[data-testid="pending-review-badge"]')).toContainText('1 pending');

      // Review the submitted plugin
      const pendingItem = adminPage.locator('[data-testid="pending-review-item"]').first();
      await pendingItem.click();

      await adminPage.waitForSelector('[data-testid="review-modal"]');

      // Check different review tabs
      await adminPage.click('[data-testid="review-tab-manifest"]');
      await expect(adminPage.locator('[data-testid="manifest-content"]')).toBeVisible();

      await adminPage.click('[data-testid="review-tab-security"]');
      await expect(adminPage.locator('[data-testid="security-assessment"]')).toBeVisible();

      // Approve the plugin
      await adminPage.click('[data-testid="approve-button"]');
      await adminPage.waitForSelector('[data-testid="approval-success"]');

      // Verify plugin is now approved and available
      await page.goto(`${baseURL}/marketplace`);
      await page.fill('[data-testid="marketplace-search"]', 'Test Admin Plugin');
      await page.keyboard.press('Enter');

      await page.waitForSelector('[data-testid="marketplace-item-card"]');
      const approvedPlugin = page.locator('[data-testid="marketplace-item-card"]').first();
      await expect(approvedPlugin).toContainText('Test Admin Plugin');
      await expect(approvedPlugin.locator('[data-testid="verified-badge"]')).toBeVisible();
    });

    it('should reject plugin with security issues', async () => {
      // Submit a plugin with dangerous permissions
      await page.goto(`${baseURL}/marketplace/submit`);

      const dangerousManifest = JSON.stringify({
        name: 'Dangerous Plugin',
        version: '1.0.0',
        description: 'A plugin with dangerous permissions',
        author: 'Test User',
        runtime: 'nodejs',
        entryPoint: 'index.js',
        inputs: { command: { type: 'string', required: true } },
        outputs: { result: { type: 'string' } },
        permissions: ['execute:command', 'filesystem:delete', 'env:write']
      });

      await page.setInputFiles('[data-testid="manifest-upload"]', {
        name: 'manifest.json',
        mimeType: 'application/json',
        buffer: Buffer.from(dangerousManifest)
      });

      await page.click('[data-testid="submit-for-review-button"]');

      // Switch to admin for review
      await adminPage.goto(`${baseURL}/admin/marketplace`);

      const pendingItem = adminPage.locator('[data-testid="pending-review-item"]').first();
      await pendingItem.click();

      // Should show high-risk security warnings
      await adminPage.click('[data-testid="review-tab-security"]');
      await expect(adminPage.locator('[data-testid="critical-risk-badge"]')).toBeVisible();
      await expect(adminPage.locator('[data-testid="security-issues"]')).toContainText('High-risk permission');

      // Reject the plugin
      await adminPage.click('[data-testid="reject-button"]');
      await adminPage.fill('[data-testid="rejection-reason"]', 'Plugin requests dangerous permissions without justification');
      await adminPage.click('[data-testid="confirm-rejection-button"]');

      await adminPage.waitForSelector('[data-testid="rejection-success"]');

      // Verify plugin is not available in marketplace
      await page.goto(`${baseURL}/marketplace`);
      await page.fill('[data-testid="marketplace-search"]', 'Dangerous Plugin');
      await page.keyboard.press('Enter');

      await page.waitForSelector('[data-testid="no-results"]');
      await expect(page.locator('[data-testid="no-results"]')).toContainText('No items found');
    });
  });

  describe('Marketplace Search and Filtering', () => {
    it('should filter marketplace items by various criteria', async () => {
      await page.goto(`${baseURL}/marketplace`);
      await page.waitForSelector('[data-testid="marketplace-browser"]');

      // Test category filtering
      await page.click('[data-testid="category-filter-ai"]');
      await page.waitForSelector('[data-testid="marketplace-item-card"]');

      const aiItems = page.locator('[data-testid="marketplace-item-card"]');
      await expect(aiItems.first()).toBeVisible();

      // Test verified only filter
      await page.click('[data-testid="filter-verified-only"]');
      await page.waitForTimeout(1000); // Wait for filter to apply

      const verifiedItems = page.locator('[data-testid="verified-badge"]');
      const itemCount = await verifiedItems.count();
      expect(itemCount).toBeGreaterThan(0);

      // Test price range filter
      await page.click('[data-testid="show-filters-button"]');
      await page.fill('[data-testid="price-min-input"]', '0');
      await page.fill('[data-testid="price-max-input"]', '10');
      await page.click('[data-testid="apply-filters-button"]');

      await page.waitForTimeout(1000);
      // Should show only free or low-cost items
    });

    it('should search for plugins by keywords', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Search for text processing plugins
      await page.fill('[data-testid="marketplace-search"]', 'text processing');
      await page.keyboard.press('Enter');

      await page.waitForSelector('[data-testid="marketplace-item-card"]');
      const searchResults = page.locator('[data-testid="marketplace-item-card"]');

      // Verify results contain search terms
      const firstResult = searchResults.first();
      const content = await firstResult.textContent();
      expect(content?.toLowerCase()).toMatch(/(text|processing)/);
    });

    it('should sort marketplace items correctly', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Sort by most installed
      await page.selectOption('[data-testid="sort-select"]', 'installs');
      await page.waitForTimeout(1000);

      // Verify first item has more installs than second
      const installCounts = page.locator('[data-testid="install-count"]');
      const firstCount = await installCounts.first().textContent();
      const secondCount = await installCounts.nth(1).textContent();

      // Extract numbers for comparison
      const firstNum = parseInt(firstCount?.replace(/[^\d]/g, '') || '0');
      const secondNum = parseInt(secondCount?.replace(/[^\d]/g, '') || '0');

      expect(firstNum).toBeGreaterThanOrEqual(secondNum);
    });
  });

  describe('Plugin Configuration and Settings', () => {
    it('should configure plugin settings after installation', async () => {
      await page.goto(`${baseURL}/marketplace`);

      // Install a plugin that requires configuration
      await page.click('[data-testid="configurable-plugin"]');
      await page.click('[data-testid="install-button"]');

      // Should prompt for configuration
      await page.waitForSelector('[data-testid="plugin-config-form"]');

      // Fill in required configuration
      await page.fill('[data-testid="config-api-key"]', 'test-api-key-123');
      await page.selectOption('[data-testid="config-mode"]', 'production');
      await page.check('[data-testid="config-enable-logging"]');

      await page.click('[data-testid="save-config-button"]');
      await page.waitForSelector('[data-testid="config-saved-success"]');

      // Navigate to plugin settings to verify configuration
      await page.goto(`${baseURL}/workspace/plugins`);
      const configuredPlugin = page.locator('[data-testid="installed-plugin-item"]').first();
      await configuredPlugin.click();

      await page.click('[data-testid="plugin-settings-button"]');
      await page.waitForSelector('[data-testid="plugin-settings-panel"]');

      // Verify saved configuration
      const apiKeyInput = page.locator('[data-testid="config-api-key"]');
      await expect(apiKeyInput).toHaveValue('test-api-key-123');
    });

    it('should handle plugin updates and auto-update settings', async () => {
      await page.goto(`${baseURL}/workspace/plugins`);

      const plugin = page.locator('[data-testid="installed-plugin-item"]').first();
      await plugin.click();

      // Check auto-update setting
      const autoUpdateToggle = page.locator('[data-testid="auto-update-toggle"]');
      await autoUpdateToggle.check();

      await page.waitForSelector('[data-testid="auto-update-enabled"]');

      // Simulate plugin update available
      await page.goto(`${baseURL}/marketplace/updates`);
      await page.waitForSelector('[data-testid="available-updates"]');

      const updateButton = page.locator('[data-testid="update-plugin-button"]').first();
      await updateButton.click();

      await page.waitForSelector('[data-testid="update-success"]');
      await expect(page.locator('[data-testid="updated-version"]')).toBeVisible();
    });
  });
});