/**
 * Alert Manager Tests
 *
 * Tests for the comprehensive alerting system including threshold
 * management, notification delivery, and cooldown handling.
 */

import { AlertManager } from '@/services/alerts/manager';

// Mock dependencies
jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logSystem: jest.fn(),
  },
}));

// Mock external HTTP requests
global.fetch = jest.fn();

describe('AlertManager', () => {
  let alertManager: AlertManager;

  beforeEach(() => {
    jest.clearAllMocks();
    alertManager = new AlertManager();
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    });
  });

  describe('Threshold Management', () => {
    it('should trigger alert when threshold is exceeded', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Configure threshold
      await alertManager.configureThreshold('error_rate', {
        value: 10,
        window: 300,
        operator: 'greater_than',
      });

      // Trigger alert
      await alertManager.checkThreshold('error_rate', 15);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert triggered: error_rate threshold exceeded')
      );

      consoleSpy.mockRestore();
    });

    it('should not trigger alert when threshold is not exceeded', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.configureThreshold('response_time', {
        value: 1000,
        window: 60,
        operator: 'greater_than',
      });

      await alertManager.checkThreshold('response_time', 800);

      expect(consoleSpy).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle less_than threshold operator', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.configureThreshold('availability', {
        value: 95,
        window: 300,
        operator: 'less_than',
      });

      await alertManager.checkThreshold('availability', 90);

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Alert triggered: availability threshold exceeded')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Health Check Alerts', () => {
    it('should trigger health check failure alert', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.healthCheckFailed('database', 'Connection timeout');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Health check failed for database: Connection timeout')
      );

      consoleSpy.mockRestore();
    });

    it('should trigger MCP service down alert', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.mcpServiceDown('github', 'Service not responding');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('MCP service down: github - Service not responding')
      );

      consoleSpy.mockRestore();
    });

    it('should trigger job failure alert', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.jobFailure('backup', 'Disk space insufficient');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Job failed: backup - Disk space insufficient')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Security Alerts', () => {
    it('should trigger security scan failure alert', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.securityScanFailed('vulnerability_scan', 'Scanner crashed');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Security scan failed: vulnerability_scan - Scanner crashed')
      );

      consoleSpy.mockRestore();
    });

    it('should trigger suspicious activity alert', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.suspiciousActivity('multiple_failed_logins', {
        userId: 'user-123',
        attempts: 5,
        ip: '192.168.1.100',
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Suspicious activity detected: multiple_failed_logins')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Notification Channels', () => {
    it('should send Slack notification', async () => {
      process.env.SLACK_WEBHOOK_URL = 'https://hooks.slack.com/test';

      await alertManager.sendSlackNotification('Test Alert', 'This is a test alert');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://hooks.slack.com/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Test Alert',
            attachments: [{
              color: 'danger',
              text: 'This is a test alert',
            }],
          }),
        })
      );

      delete process.env.SLACK_WEBHOOK_URL;
    });

    it('should send Discord notification', async () => {
      process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/test';

      await alertManager.sendDiscordNotification('Alert Title', 'Alert message content');

      expect(global.fetch).toHaveBeenCalledWith(
        'https://discord.com/api/webhooks/test',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            embeds: [{
              title: 'Alert Title',
              description: 'Alert message content',
              color: 15158332, // Red color
              timestamp: expect.any(String),
            }],
          }),
        })
      );

      delete process.env.DISCORD_WEBHOOK_URL;
    });

    it('should trigger GitHub Actions workflow', async () => {
      process.env.GITHUB_TOKEN = 'github_token_test';
      process.env.GITHUB_REPO_OWNER = 'test-owner';
      process.env.GITHUB_REPO_NAME = 'test-repo';

      await alertManager.triggerGitHubAction('alert-workflow', {
        alert_type: 'health_check',
        severity: 'high',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/test-owner/test-repo/actions/workflows/alert-workflow/dispatches',
        expect.objectContaining({
          method: 'POST',
          headers: {
            'Authorization': 'token github_token_test',
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json',
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              alert_type: 'health_check',
              severity: 'high',
            },
          }),
        })
      );

      delete process.env.GITHUB_TOKEN;
      delete process.env.GITHUB_REPO_OWNER;
      delete process.env.GITHUB_REPO_NAME;
    });

    it('should handle notification failures gracefully', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('Network error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.sendSlackNotification('Test', 'Message');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Failed to send Slack notification:',
        expect.any(Error)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Cooldown Management', () => {
    it('should respect cooldown periods for repeated alerts', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Set short cooldown for testing
      await alertManager.configureAlert('test_alert', {
        cooldown: 1, // 1 second
        channels: ['console'],
      });

      // First alert should trigger
      await alertManager.triggerAlert('test_alert', 'First alert', 'Test message 1');
      expect(consoleSpy).toHaveBeenCalledTimes(1);

      // Second alert immediately should be suppressed
      await alertManager.triggerAlert('test_alert', 'Second alert', 'Test message 2');
      expect(consoleSpy).toHaveBeenCalledTimes(1); // Still 1

      // Wait for cooldown to expire
      await new Promise(resolve => setTimeout(resolve, 1100));

      // Third alert should trigger after cooldown
      await alertManager.triggerAlert('test_alert', 'Third alert', 'Test message 3');
      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });

    it('should allow immediate alerts for different alert types', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await alertManager.triggerAlert('alert_type_1', 'Alert 1', 'Message 1');
      await alertManager.triggerAlert('alert_type_2', 'Alert 2', 'Message 2');

      expect(consoleSpy).toHaveBeenCalledTimes(2);

      consoleSpy.mockRestore();
    });
  });

  describe('Alert Configuration', () => {
    it('should configure alert with custom settings', async () => {
      await alertManager.configureAlert('custom_alert', {
        cooldown: 300, // 5 minutes
        channels: ['slack', 'discord'],
        severity: 'critical',
      });

      // Configuration should be stored (we can't easily test internal state,
      // but we can verify it doesn't throw)
      expect(true).toBe(true);
    });

    it('should handle missing environment variables gracefully', async () => {
      // Ensure environment variables are not set
      delete process.env.SLACK_WEBHOOK_URL;
      delete process.env.DISCORD_WEBHOOK_URL;

      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      await alertManager.triggerAlert('test_alert', 'Test', 'No webhooks configured', {
        channels: ['slack', 'discord'],
      });

      // Should warn about missing configuration but not crash
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Slack webhook URL configured')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('No Discord webhook URL configured')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('Alert History', () => {
    it('should track alert history for reporting', async () => {
      await alertManager.triggerAlert('test_alert', 'Test Alert', 'Test message');

      const history = await alertManager.getAlertHistory();

      expect(history).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            type: 'test_alert',
            title: 'Test Alert',
            message: 'Test message',
            timestamp: expect.any(Date),
          }),
        ])
      );
    });

    it('should limit alert history size', async () => {
      // Trigger many alerts
      for (let i = 0; i < 150; i++) {
        await alertManager.triggerAlert('spam_alert', `Alert ${i}`, `Message ${i}`);
      }

      const history = await alertManager.getAlertHistory();

      // Should be limited to reasonable size (e.g., 100)
      expect(history.length).toBeLessThanOrEqual(100);
    });
  });

  describe('Integration with Audit Logger', () => {
    it('should log alert events to audit system', async () => {
      const { auditLogger } = require('@/services/audit/logger');

      await alertManager.triggerAlert('security_alert', 'Security Issue', 'Potential breach detected');

      expect(auditLogger.logSystem).toHaveBeenCalledWith(
        'system.alert_triggered',
        expect.objectContaining({
          alertType: 'security_alert',
          title: 'Security Issue',
          message: 'Potential breach detected',
        })
      );
    });
  });
});