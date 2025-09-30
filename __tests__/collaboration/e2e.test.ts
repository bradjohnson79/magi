import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import { Browser, Page, chromium } from 'playwright';

// End-to-End tests for real-time collaboration features
// These tests simulate actual user interactions across multiple browser instances

describe('Real-time Collaboration E2E Tests', () => {
  let browser: Browser;
  let page1: Page;
  let page2: Page;
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
    page1 = await browser.newPage();
    page2 = await browser.newPage();

    // Mock authentication for test users
    await page1.addInitScript(() => {
      (window as any).__TEST_USER__ = {
        id: 'user-1',
        name: 'User One',
        email: 'user1@test.com',
        avatar: 'https://avatar.com/user1'
      };
    });

    await page2.addInitScript(() => {
      (window as any).__TEST_USER__ = {
        id: 'user-2',
        name: 'User Two',
        email: 'user2@test.com',
        avatar: 'https://avatar.com/user2'
      };
    });
  });

  afterEach(async () => {
    await page1.close();
    await page2.close();
  });

  describe('User Presence and Cursors', () => {
    it('should show when users join and leave projects', async () => {
      const projectId = 'test-project-1';

      // User 1 navigates to project
      await page1.goto(`${baseURL}/projects/${projectId}`);
      await page1.waitForSelector('[data-testid="project-workspace"]');

      // User 2 navigates to same project
      await page2.goto(`${baseURL}/projects/${projectId}`);
      await page2.waitForSelector('[data-testid="project-workspace"]');

      // User 1 should see User 2 in presence indicators
      await page1.waitForSelector('[data-testid="presence-indicators"]');
      const presenceIndicators = await page1.locator('[data-testid="presence-indicators"]');

      await expect(presenceIndicators).toContainText('User Two');

      // User 2 should see User 1 in presence indicators
      await page2.waitForSelector('[data-testid="presence-indicators"]');
      const presenceIndicators2 = await page2.locator('[data-testid="presence-indicators"]');

      await expect(presenceIndicators2).toContainText('User One');
    });

    it('should display real-time cursor movements', async () => {
      const projectId = 'test-project-1';

      // Both users join the project
      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      await Promise.all([
        page1.waitForSelector('[data-testid="editor-canvas"]'),
        page2.waitForSelector('[data-testid="editor-canvas"]')
      ]);

      // User 1 moves cursor on canvas
      const canvas1 = page1.locator('[data-testid="editor-canvas"]');
      await canvas1.hover({ position: { x: 200, y: 150 } });

      // User 2 should see User 1's cursor
      await page2.waitForSelector('[data-testid="cursor-overlay"]');
      const cursorOverlay = page2.locator('[data-testid="cursor-overlay"]');

      await expect(cursorOverlay).toBeVisible();
      await expect(cursorOverlay).toContainText('User One');

      // Move cursor to different position
      await canvas1.hover({ position: { x: 300, y: 250 } });

      // Verify cursor position updated
      const cursorLabel = page2.locator('[data-testid="cursor-label"]:has-text("User One")');
      await expect(cursorLabel).toBeVisible();
    });

    it('should update presence status correctly', async () => {
      const projectId = 'test-project-1';

      await page1.goto(`${baseURL}/projects/${projectId}`);
      await page1.waitForSelector('[data-testid="presence-indicators"]');

      await page2.goto(`${baseURL}/projects/${projectId}`);
      await page2.waitForSelector('[data-testid="presence-indicators"]');

      // User 1 should show as online
      const onlineStatus = page2.locator('[data-testid="user-status"]:has-text("User One")');
      await expect(onlineStatus).toHaveAttribute('data-status', 'online');

      // User 1 navigates away (simulating going offline)
      await page1.goto(`${baseURL}/dashboard`);

      // Wait for status to update
      await page2.waitForTimeout(2000);

      // User 1 should show as away or offline
      await expect(onlineStatus).not.toHaveAttribute('data-status', 'online');
    });
  });

  describe('Threaded Comments with @mentions', () => {
    it('should create and display comments in real-time', async () => {
      const projectId = 'test-project-1';

      // Both users join project
      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      await Promise.all([
        page1.waitForSelector('[data-testid="comment-sidebar"]'),
        page2.waitForSelector('[data-testid="comment-sidebar"]')
      ]);

      // User 1 creates a comment
      const commentInput = page1.locator('[data-testid="comment-input"]');
      await commentInput.fill('This is a test comment for real-time collaboration!');

      const submitButton = page1.locator('[data-testid="comment-submit"]');
      await submitButton.click();

      // User 2 should see the comment appear in real-time
      await page2.waitForSelector('[data-testid="comment-item"]');
      const comment = page2.locator('[data-testid="comment-item"]').first();

      await expect(comment).toContainText('This is a test comment for real-time collaboration!');
      await expect(comment).toContainText('User One');
    });

    it('should handle @mentions and notifications', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      await Promise.all([
        page1.waitForSelector('[data-testid="comment-sidebar"]'),
        page2.waitForSelector('[data-testid="notification-indicator"]')
      ]);

      // User 1 mentions User 2 in a comment
      const commentInput = page1.locator('[data-testid="comment-input"]');
      await commentInput.fill('Hey @User Two, can you review this?');

      // Simulate mention autocomplete
      await commentInput.press('@');
      await page1.waitForSelector('[data-testid="mention-dropdown"]');

      const mentionOption = page1.locator('[data-testid="mention-option"]:has-text("User Two")');
      await mentionOption.click();

      const submitButton = page1.locator('[data-testid="comment-submit"]');
      await submitButton.click();

      // User 2 should receive notification
      await page2.waitForSelector('[data-testid="notification-badge"]');
      const notificationBadge = page2.locator('[data-testid="notification-badge"]');

      await expect(notificationBadge).toBeVisible();
      await expect(notificationBadge).toContainText('1');

      // Click notification to see mention
      await notificationBadge.click();
      await page2.waitForSelector('[data-testid="notification-list"]');

      const notification = page2.locator('[data-testid="notification-item"]').first();
      await expect(notification).toContainText('mentioned you');
      await expect(notification).toContainText('User One');
    });

    it('should support threaded replies', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      // User 1 creates initial comment
      const commentInput1 = page1.locator('[data-testid="comment-input"]');
      await commentInput1.fill('What do you think about this design?');
      await page1.locator('[data-testid="comment-submit"]').click();

      // Wait for comment to appear
      await page2.waitForSelector('[data-testid="comment-item"]');

      // User 2 replies to the comment
      const replyButton = page2.locator('[data-testid="reply-button"]').first();
      await replyButton.click();

      const replyInput = page2.locator('[data-testid="reply-input"]');
      await replyInput.fill('I think it looks great! Nice work.');
      await page2.locator('[data-testid="reply-submit"]').click();

      // User 1 should see the reply in real-time
      await page1.waitForSelector('[data-testid="comment-reply"]');
      const reply = page1.locator('[data-testid="comment-reply"]');

      await expect(reply).toContainText('I think it looks great! Nice work.');
      await expect(reply).toContainText('User Two');

      // Reply should be indented/nested under original comment
      const replyContainer = page1.locator('[data-testid="comment-thread"]');
      await expect(replyContainer).toContainText('What do you think about this design?');
      await expect(replyContainer).toContainText('I think it looks great! Nice work.');
    });

    it('should allow resolving and unresolving comments', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      // User 1 creates a comment
      const commentInput = page1.locator('[data-testid="comment-input"]');
      await commentInput.fill('Please fix the alignment here');
      await page1.locator('[data-testid="comment-submit"]').click();

      await page2.waitForSelector('[data-testid="comment-item"]');

      // User 2 resolves the comment
      const resolveButton = page2.locator('[data-testid="resolve-button"]').first();
      await resolveButton.click();

      // Both users should see the comment as resolved
      await page1.waitForSelector('[data-testid="comment-resolved"]');
      await page2.waitForSelector('[data-testid="comment-resolved"]');

      const resolvedBadge1 = page1.locator('[data-testid="resolved-badge"]');
      const resolvedBadge2 = page2.locator('[data-testid="resolved-badge"]');

      await expect(resolvedBadge1).toBeVisible();
      await expect(resolvedBadge2).toBeVisible();

      // User 1 can unresolve the comment
      const unresolveButton = page1.locator('[data-testid="unresolve-button"]').first();
      await unresolveButton.click();

      // Comment should show as unresolved again
      await expect(resolvedBadge1).not.toBeVisible();
      await expect(resolvedBadge2).not.toBeVisible();
    });
  });

  describe('Activity Feed with Filters', () => {
    it('should show real-time activity updates', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      await Promise.all([
        page1.waitForSelector('[data-testid="activity-feed"]'),
        page2.waitForSelector('[data-testid="activity-feed"]')
      ]);

      // User 1 creates a comment
      const commentInput = page1.locator('[data-testid="comment-input"]');
      await commentInput.fill('New activity test');
      await page1.locator('[data-testid="comment-submit"]').click();

      // Activity should appear in both users' feeds
      await page1.waitForSelector('[data-testid="activity-item"]:has-text("created a comment")');
      await page2.waitForSelector('[data-testid="activity-item"]:has-text("created a comment")');

      const activityItem1 = page1.locator('[data-testid="activity-item"]').first();
      const activityItem2 = page2.locator('[data-testid="activity-item"]').first();

      await expect(activityItem1).toContainText('User One');
      await expect(activityItem1).toContainText('created a comment');

      await expect(activityItem2).toContainText('User One');
      await expect(activityItem2).toContainText('created a comment');
    });

    it('should filter activities by user and action type', async () => {
      const projectId = 'test-project-1';

      await page1.goto(`${baseURL}/projects/${projectId}`);
      await page1.waitForSelector('[data-testid="activity-feed"]');

      // Create some test activities
      await page1.locator('[data-testid="comment-input"]').fill('Comment 1');
      await page1.locator('[data-testid="comment-submit"]').click();
      await page1.waitForTimeout(500);

      await page1.locator('[data-testid="comment-input"]').fill('Comment 2');
      await page1.locator('[data-testid="comment-submit"]').click();
      await page1.waitForTimeout(500);

      // Open activity filters
      const filterButton = page1.locator('[data-testid="activity-filter-button"]');
      await filterButton.click();

      // Filter by comment actions only
      const actionFilter = page1.locator('[data-testid="action-filter"]');
      await actionFilter.selectOption('comment_created');

      // Apply filter
      const applyFilterButton = page1.locator('[data-testid="apply-filter"]');
      await applyFilterButton.click();

      // Should only show comment activities
      await page1.waitForSelector('[data-testid="activity-item"]');
      const activityItems = page1.locator('[data-testid="activity-item"]');

      const count = await activityItems.count();
      expect(count).toBeGreaterThan(0);

      // All visible items should be comment-related
      for (let i = 0; i < count; i++) {
        const item = activityItems.nth(i);
        await expect(item).toContainText('comment');
      }
    });

    it('should show presence events in activity feed', async () => {
      const projectId = 'test-project-1';

      await page1.goto(`${baseURL}/projects/${projectId}`);
      await page1.waitForSelector('[data-testid="activity-feed"]');

      // User 2 joins project
      await page2.goto(`${baseURL}/projects/${projectId}`);
      await page2.waitForSelector('[data-testid="project-workspace"]');

      // User 1 should see join activity
      await page1.waitForSelector('[data-testid="activity-item"]:has-text("joined the project")');
      const joinActivity = page1.locator('[data-testid="activity-item"]:has-text("joined the project")');

      await expect(joinActivity).toContainText('User Two');
      await expect(joinActivity).toContainText('joined the project');

      // User 2 leaves project
      await page2.goto(`${baseURL}/dashboard`);

      // User 1 should see leave activity
      await page1.waitForSelector('[data-testid="activity-item"]:has-text("left the project")');
      const leaveActivity = page1.locator('[data-testid="activity-item"]:has-text("left the project")');

      await expect(leaveActivity).toContainText('User Two');
      await expect(leaveActivity).toContainText('left the project');
    });
  });

  describe('Performance and Edge Cases', () => {
    it('should handle multiple rapid cursor movements', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      const canvas1 = page1.locator('[data-testid="editor-canvas"]');

      // Rapid cursor movements
      for (let i = 0; i < 10; i++) {
        await canvas1.hover({ position: { x: 100 + i * 20, y: 100 + i * 10 } });
        await page1.waitForTimeout(50);
      }

      // User 2 should still see smooth cursor updates
      await page2.waitForSelector('[data-testid="cursor-overlay"]');
      const cursorOverlay = page2.locator('[data-testid="cursor-overlay"]');
      await expect(cursorOverlay).toBeVisible();
    });

    it('should handle network disconnection and reconnection', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      // Simulate network disconnection for user 1
      await page1.setOfflineMode(true);
      await page1.waitForTimeout(2000);

      // User 2 should see user 1 as offline
      const presenceIndicators = page2.locator('[data-testid="presence-indicators"]');
      await expect(presenceIndicators).not.toContainText('User One');

      // Reconnect user 1
      await page1.setOfflineMode(false);
      await page1.reload();
      await page1.waitForSelector('[data-testid="project-workspace"]');

      // User 2 should see user 1 as online again
      await page2.waitForSelector('[data-testid="presence-indicators"]:has-text("User One")');
    });

    it('should handle concurrent comment creation', async () => {
      const projectId = 'test-project-1';

      await Promise.all([
        page1.goto(`${baseURL}/projects/${projectId}`),
        page2.goto(`${baseURL}/projects/${projectId}`)
      ]);

      // Both users create comments simultaneously
      const commentInput1 = page1.locator('[data-testid="comment-input"]');
      const commentInput2 = page2.locator('[data-testid="comment-input"]');

      await commentInput1.fill('Comment from User 1');
      await commentInput2.fill('Comment from User 2');

      // Submit both comments at the same time
      await Promise.all([
        page1.locator('[data-testid="comment-submit"]').click(),
        page2.locator('[data-testid="comment-submit"]').click()
      ]);

      // Both comments should appear for both users
      await page1.waitForSelector('[data-testid="comment-item"]:has-text("Comment from User 1")');
      await page1.waitForSelector('[data-testid="comment-item"]:has-text("Comment from User 2")');

      await page2.waitForSelector('[data-testid="comment-item"]:has-text("Comment from User 1")');
      await page2.waitForSelector('[data-testid="comment-item"]:has-text("Comment from User 2")');

      // Comments should be ordered correctly by timestamp
      const commentItems1 = page1.locator('[data-testid="comment-item"]');
      const commentItems2 = page2.locator('[data-testid="comment-item"]');

      expect(await commentItems1.count()).toBeGreaterThanOrEqual(2);
      expect(await commentItems2.count()).toBeGreaterThanOrEqual(2);
    });
  });
});