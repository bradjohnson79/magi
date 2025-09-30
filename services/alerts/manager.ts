/**
 * Alert Manager Service
 *
 * Handles threshold monitoring, alert generation, and notification routing
 * for various system events including job failures, health issues, and security events.
 */

import { prisma } from '@/lib/db';
import { auditLogger } from '@/services/audit/logger';
import { metricsCollector } from '@/services/metrics/collector';
import { getCurrentTraceId } from '@/services/tracing/setup';

// Alert severity levels
export type AlertSeverity = 'info' | 'warning' | 'error' | 'critical';

// Alert types
export type AlertType =
  | 'health_check_failed'
  | 'mcp_service_down'
  | 'database_connection_failed'
  | 'high_error_rate'
  | 'job_failure'
  | 'security_breach_attempt'
  | 'rate_limit_exceeded'
  | 'disk_space_low'
  | 'memory_usage_high'
  | 'response_time_high'
  | 'user_plan_limit_exceeded'
  | 'custom';

// Notification channels
export type NotificationChannel = 'slack' | 'discord' | 'email' | 'webhook' | 'github_actions';

// Alert configuration
export interface AlertConfig {
  type: AlertType;
  enabled: boolean;
  severity: AlertSeverity;
  threshold?: number;
  timeWindow?: number; // minutes
  cooldown?: number; // minutes
  channels: NotificationChannel[];
  conditions?: Record<string, any>;
  message?: string;
}

// Alert instance
export interface Alert {
  id?: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  message: string;
  metadata: Record<string, any>;
  triggeredAt: Date;
  resolvedAt?: Date;
  acknowledged?: boolean;
  acknowledgedBy?: string;
  traceId?: string;
}

// Notification payload
export interface NotificationPayload {
  alert: Alert;
  channel: NotificationChannel;
  webhook?: string;
  config?: Record<string, any>;
}

export class AlertManager {
  private alertConfigs: Map<AlertType, AlertConfig> = new Map();
  private alertCooldowns: Map<string, Date> = new Map();

  constructor() {
    this.initializeDefaultConfigs();
  }

  /**
   * Initialize default alert configurations
   */
  private initializeDefaultConfigs(): void {
    const defaultConfigs: AlertConfig[] = [
      {
        type: 'health_check_failed',
        enabled: true,
        severity: 'error',
        cooldown: 15,
        channels: ['slack', 'github_actions'],
        message: 'Health check failed for critical system component',
      },
      {
        type: 'mcp_service_down',
        enabled: true,
        severity: 'warning',
        cooldown: 10,
        channels: ['slack'],
        message: 'MCP service is not responding',
      },
      {
        type: 'database_connection_failed',
        enabled: true,
        severity: 'critical',
        cooldown: 5,
        channels: ['slack', 'github_actions'],
        message: 'Database connection failed',
      },
      {
        type: 'high_error_rate',
        enabled: true,
        severity: 'warning',
        threshold: 0.05, // 5% error rate
        timeWindow: 10,
        cooldown: 20,
        channels: ['slack'],
        message: 'Error rate exceeded threshold',
      },
      {
        type: 'job_failure',
        enabled: true,
        severity: 'error',
        cooldown: 10,
        channels: ['slack'],
        message: 'Background job failed',
      },
      {
        type: 'security_breach_attempt',
        enabled: true,
        severity: 'critical',
        cooldown: 0, // No cooldown for security alerts
        channels: ['slack', 'github_actions'],
        message: 'Security breach attempt detected',
      },
      {
        type: 'rate_limit_exceeded',
        enabled: true,
        severity: 'warning',
        threshold: 100, // requests per minute
        timeWindow: 1,
        cooldown: 30,
        channels: ['slack'],
        message: 'Rate limit exceeded',
      },
      {
        type: 'memory_usage_high',
        enabled: true,
        severity: 'warning',
        threshold: 85, // 85% memory usage
        timeWindow: 5,
        cooldown: 30,
        channels: ['slack'],
        message: 'Memory usage is critically high',
      },
      {
        type: 'response_time_high',
        enabled: true,
        severity: 'warning',
        threshold: 5000, // 5 seconds
        timeWindow: 10,
        cooldown: 20,
        channels: ['slack'],
        message: 'Response times are elevated',
      },
    ];

    defaultConfigs.forEach(config => {
      this.alertConfigs.set(config.type, config);
    });
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(
    type: AlertType,
    title: string,
    message: string,
    metadata: Record<string, any> = {}
  ): Promise<Alert | null> {
    const config = this.alertConfigs.get(type);
    if (!config || !config.enabled) {
      return null;
    }

    // Check cooldown
    const cooldownKey = `${type}:${JSON.stringify(metadata)}`;
    const lastAlert = this.alertCooldowns.get(cooldownKey);
    const now = new Date();

    if (lastAlert && config.cooldown && config.cooldown > 0) {
      const timeSinceLastAlert = (now.getTime() - lastAlert.getTime()) / (1000 * 60);
      if (timeSinceLastAlert < config.cooldown) {
        return null; // Still in cooldown
      }
    }

    // Create alert
    const alert: Alert = {
      id: crypto.randomUUID(),
      type,
      severity: config.severity,
      title,
      message,
      metadata: {
        ...metadata,
        config: config.type,
        environment: process.env.NODE_ENV,
        timestamp: now.toISOString(),
      },
      triggeredAt: now,
      traceId: getCurrentTraceId() || undefined,
    };

    // Update cooldown
    this.alertCooldowns.set(cooldownKey, now);

    try {
      // Store alert in database
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'alert.triggered',
          payload: {
            alert,
            config,
          },
          traceId: alert.traceId,
          createdAt: alert.triggeredAt,
        },
      });

      // Record metrics
      await metricsCollector.recordCustomMetric(
        `alert.${type}`,
        1,
        'count',
        {
          severity: config.severity,
          channels: config.channels.join(','),
        }
      );

      // Log to audit
      await auditLogger.logSystem('system.alert_triggered', {
        alertType: type,
        severity: config.severity,
        title,
        message,
        metadata,
      });

      // Send notifications
      for (const channel of config.channels) {
        try {
          await this.sendNotification({
            alert,
            channel,
            config: this.getChannelConfig(channel),
          });
        } catch (error) {
          console.error(`Failed to send notification to ${channel}:`, error);
          // Don't fail the entire alert if one notification fails
        }
      }

      console.log(`[ALERT] ${config.severity.toUpperCase()}: ${title}`, {
        type,
        message,
        metadata,
        traceId: alert.traceId,
      });

      return alert;

    } catch (error) {
      console.error('Failed to process alert:', error);
      return null;
    }
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(payload: NotificationPayload): Promise<void> {
    const { alert, channel } = payload;

    switch (channel) {
      case 'slack':
        await this.sendSlackNotification(alert);
        break;
      case 'discord':
        await this.sendDiscordNotification(alert);
        break;
      case 'webhook':
        await this.sendWebhookNotification(alert, payload.webhook);
        break;
      case 'github_actions':
        await this.triggerGitHubAction(alert);
        break;
      default:
        console.warn(`Unsupported notification channel: ${channel}`);
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(alert: Alert): Promise<void> {
    const webhookUrl = process.env.SLACK_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('Slack webhook URL not configured');
      return;
    }

    const color = this.getSeverityColor(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      username: 'Magi Alert Bot',
      icon_emoji: ':warning:',
      attachments: [
        {
          color,
          title: `${emoji} ${alert.title}`,
          text: alert.message,
          fields: [
            {
              title: 'Severity',
              value: alert.severity.toUpperCase(),
              short: true,
            },
            {
              title: 'Type',
              value: alert.type,
              short: true,
            },
            {
              title: 'Environment',
              value: alert.metadata.environment || 'unknown',
              short: true,
            },
            {
              title: 'Trace ID',
              value: alert.traceId || 'N/A',
              short: true,
            },
          ],
          footer: 'Magi Platform',
          ts: Math.floor(alert.triggeredAt.getTime() / 1000),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Slack notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send Discord notification
   */
  private async sendDiscordNotification(alert: Alert): Promise<void> {
    const webhookUrl = process.env.DISCORD_WEBHOOK_URL;
    if (!webhookUrl) {
      console.warn('Discord webhook URL not configured');
      return;
    }

    const color = this.getSeverityColorCode(alert.severity);
    const emoji = this.getSeverityEmoji(alert.severity);

    const payload = {
      username: 'Magi Alert Bot',
      avatar_url: 'https://example.com/magi-logo.png',
      embeds: [
        {
          title: `${emoji} ${alert.title}`,
          description: alert.message,
          color,
          fields: [
            {
              name: 'Severity',
              value: alert.severity.toUpperCase(),
              inline: true,
            },
            {
              name: 'Type',
              value: alert.type,
              inline: true,
            },
            {
              name: 'Environment',
              value: alert.metadata.environment || 'unknown',
              inline: true,
            },
            {
              name: 'Trace ID',
              value: alert.traceId || 'N/A',
              inline: true,
            },
          ],
          footer: {
            text: 'Magi Platform',
          },
          timestamp: alert.triggeredAt.toISOString(),
        },
      ],
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Discord notification failed: ${response.statusText}`);
    }
  }

  /**
   * Send generic webhook notification
   */
  private async sendWebhookNotification(alert: Alert, webhookUrl?: string): Promise<void> {
    if (!webhookUrl) {
      console.warn('Webhook URL not provided');
      return;
    }

    const payload = {
      alert_id: alert.id,
      type: alert.type,
      severity: alert.severity,
      title: alert.title,
      message: alert.message,
      metadata: alert.metadata,
      triggered_at: alert.triggeredAt.toISOString(),
      trace_id: alert.traceId,
      platform: 'magi',
    };

    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Webhook notification failed: ${response.statusText}`);
    }
  }

  /**
   * Trigger GitHub Action via repository dispatch
   */
  private async triggerGitHubAction(alert: Alert): Promise<void> {
    const token = process.env.GITHUB_TOKEN;
    const repo = process.env.GITHUB_REPOSITORY; // format: owner/repo

    if (!token || !repo) {
      console.warn('GitHub token or repository not configured');
      return;
    }

    const [owner, repoName] = repo.split('/');

    const payload = {
      event_type: 'magi_alert',
      client_payload: {
        alert_type: alert.type,
        severity: alert.severity,
        title: alert.title,
        message: alert.message,
        metadata: alert.metadata,
        triggered_at: alert.triggeredAt.toISOString(),
        trace_id: alert.traceId,
      },
    };

    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/dispatches`,
      {
        method: 'POST',
        headers: {
          'Authorization': `token ${token}`,
          'Accept': 'application/vnd.github.v3+json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    if (!response.ok) {
      throw new Error(`GitHub Action trigger failed: ${response.statusText}`);
    }
  }

  /**
   * Get channel configuration
   */
  private getChannelConfig(channel: NotificationChannel): Record<string, any> {
    // Return channel-specific configuration
    switch (channel) {
      case 'slack':
        return {
          webhook_url: process.env.SLACK_WEBHOOK_URL,
        };
      case 'discord':
        return {
          webhook_url: process.env.DISCORD_WEBHOOK_URL,
        };
      case 'github_actions':
        return {
          token: process.env.GITHUB_TOKEN,
          repository: process.env.GITHUB_REPOSITORY,
        };
      default:
        return {};
    }
  }

  /**
   * Get severity color for Slack
   */
  private getSeverityColor(severity: AlertSeverity): string {
    switch (severity) {
      case 'info': return 'good';
      case 'warning': return 'warning';
      case 'error': return 'danger';
      case 'critical': return 'danger';
      default: return 'warning';
    }
  }

  /**
   * Get severity color code for Discord
   */
  private getSeverityColorCode(severity: AlertSeverity): number {
    switch (severity) {
      case 'info': return 0x00ff00; // Green
      case 'warning': return 0xffaa00; // Orange
      case 'error': return 0xff0000; // Red
      case 'critical': return 0xff0000; // Red
      default: return 0xffaa00; // Orange
    }
  }

  /**
   * Get severity emoji
   */
  private getSeverityEmoji(severity: AlertSeverity): string {
    switch (severity) {
      case 'info': return 'ℹ️';
      case 'warning': return '⚠️';
      case 'error': return '❌';
      case 'critical': return '🚨';
      default: return '⚠️';
    }
  }

  /**
   * Check thresholds and trigger alerts based on metrics
   */
  async checkThresholds(): Promise<void> {
    // This method can be called periodically to check various thresholds
    try {
      // Check memory usage
      const memoryUsage = process.memoryUsage();
      const memoryPercent = (memoryUsage.heapUsed / memoryUsage.heapTotal) * 100;

      if (memoryPercent > 85) {
        await this.triggerAlert(
          'memory_usage_high',
          'High Memory Usage Detected',
          `Memory usage is at ${memoryPercent.toFixed(1)}%`,
          {
            memoryPercent,
            heapUsed: memoryUsage.heapUsed,
            heapTotal: memoryUsage.heapTotal,
          }
        );
      }

      // Additional threshold checks can be added here
      // - Database connection pool status
      // - Response time averages
      // - Error rates
      // - Queue lengths
      // etc.

    } catch (error) {
      console.error('Error checking thresholds:', error);
    }
  }

  /**
   * Update alert configuration
   */
  updateConfig(type: AlertType, config: Partial<AlertConfig>): void {
    const existingConfig = this.alertConfigs.get(type);
    if (existingConfig) {
      this.alertConfigs.set(type, { ...existingConfig, ...config });
    }
  }

  /**
   * Get alert configuration
   */
  getConfig(type: AlertType): AlertConfig | undefined {
    return this.alertConfigs.get(type);
  }

  /**
   * Get all alert configurations
   */
  getAllConfigs(): Map<AlertType, AlertConfig> {
    return new Map(this.alertConfigs);
  }
}

// Export singleton instance
export const alertManager = new AlertManager();

// Utility functions for common alert patterns
export const alerts = {
  /**
   * Quick function to trigger health check failure alert
   */
  healthCheckFailed: (component: string, error: string) =>
    alertManager.triggerAlert(
      'health_check_failed',
      `Health Check Failed: ${component}`,
      `Health check for ${component} failed: ${error}`,
      { component, error }
    ),

  /**
   * Quick function to trigger MCP service down alert
   */
  mcpServiceDown: (service: string, error: string) =>
    alertManager.triggerAlert(
      'mcp_service_down',
      `MCP Service Down: ${service}`,
      `MCP service ${service} is not responding: ${error}`,
      { service, error }
    ),

  /**
   * Quick function to trigger job failure alert
   */
  jobFailed: (jobName: string, error: string) =>
    alertManager.triggerAlert(
      'job_failure',
      `Job Failed: ${jobName}`,
      `Background job ${jobName} failed: ${error}`,
      { jobName, error }
    ),

  /**
   * Quick function to trigger security alert
   */
  securityBreach: (type: string, details: Record<string, any>) =>
    alertManager.triggerAlert(
      'security_breach_attempt',
      `Security Breach Attempt: ${type}`,
      `Security breach attempt detected: ${type}`,
      { type, ...details }
    ),
};

// Export types for external use
export type {
  AlertSeverity,
  AlertType,
  NotificationChannel,
  AlertConfig,
  Alert,
  NotificationPayload,
};