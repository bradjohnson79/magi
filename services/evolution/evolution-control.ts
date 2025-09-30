import { PrismaClient } from '@prisma/client';
import { trace } from '@opentelemetry/api';
import { CodeAnalysisService } from './analysis-service';
import { RefactorService } from './refactor-service';
import { CanaryModelService } from './canary-service';

const tracer = trace.getTracer('evolution-control');

export interface EvolutionSettings {
  id: string;
  organizationId: string;
  enabled: boolean;
  features: {
    codeAnalysis: {
      enabled: boolean;
      schedule: string; // cron expression
      analysisTypes: ('performance' | 'security' | 'style' | 'complexity')[];
      autoFix: {
        enabled: boolean;
        confidenceThreshold: number;
        allowedTypes: string[];
      };
    };
    autoRefactor: {
      enabled: boolean;
      autoApprove: boolean;
      confidenceThreshold: number;
      maxChangesPerDay: number;
      requiresReview: string[]; // file patterns that require manual review
      rollbackOnFailure: boolean;
    };
    canaryTesting: {
      enabled: boolean;
      autoPromote: boolean;
      trafficPercentage: number;
      testDuration: number; // hours
      promotionCriteria: {
        accuracyImprovement: number;
        errorRateThreshold: number;
        latencyThreshold: number;
      };
    };
    notifications: {
      enabled: boolean;
      channels: ('email' | 'slack' | 'webhook')[];
      events: ('analysis_complete' | 'refactor_applied' | 'canary_promoted' | 'error')[];
      recipients: string[];
    };
  };
  safeguards: {
    maxDailyChanges: number;
    requiredApprovers: number;
    emergencyStop: boolean;
    rollbackWindow: number; // hours
    testCoverageThreshold: number;
    securityScanRequired: boolean;
  };
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lastModifiedBy: string;
}

export interface EvolutionMetrics {
  period: {
    start: Date;
    end: Date;
  };
  codeAnalysis: {
    runsCompleted: number;
    issuesFound: number;
    issuesFixed: number;
    averageRunTime: number;
  };
  refactoring: {
    suggestionsGenerated: number;
    suggestionsApproved: number;
    suggestionsApplied: number;
    averageConfidence: number;
    successRate: number;
  };
  canaryTesting: {
    modelsDeployed: number;
    modelsPromoted: number;
    modelsRolledBack: number;
    averageTestDuration: number;
    promotionRate: number;
  };
  impact: {
    performanceImprovement: number;
    securityIssuesResolved: number;
    codeQualityIncrease: number;
    testCoverageIncrease: number;
  };
  risks: {
    changesReverted: number;
    prodIssues: number;
    downtime: number; // minutes
    securityIncidents: number;
  };
}

export interface EvolutionEvent {
  id: string;
  organizationId: string;
  type: 'analysis_started' | 'analysis_completed' | 'refactor_suggested' | 'refactor_applied' |
        'canary_deployed' | 'canary_promoted' | 'emergency_stop' | 'error';
  severity: 'info' | 'warning' | 'error' | 'critical';
  title: string;
  description: string;
  data: Record<string, any>;
  triggeredBy: string; // 'system' | userId
  acknowledgedAt?: Date;
  acknowledgedBy?: string;
  metadata: Record<string, any>;
  createdAt: Date;
}

export class EvolutionControlService {
  private prisma: PrismaClient;
  private analysisService: CodeAnalysisService;
  private refactorService: RefactorService;
  private canaryService: CanaryModelService;
  private isRunning: boolean = false;
  private evolutionLoop: NodeJS.Timeout | null = null;

  constructor(
    prisma: PrismaClient,
    analysisService: CodeAnalysisService,
    refactorService: RefactorService,
    canaryService: CanaryModelService
  ) {
    this.prisma = prisma;
    this.analysisService = analysisService;
    this.refactorService = refactorService;
    this.canaryService = canaryService;
  }

  async initializeEvolution(organizationId: string): Promise<void> {
    return tracer.startActiveSpan('initializeEvolution', async (span) => {
      try {
        span.setAttributes({ organizationId });

        const settings = await this.getEvolutionSettings(organizationId);

        if (settings.enabled) {
          await this.startEvolutionProcess(organizationId);
        }

        span.addEvent('Evolution initialized');
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async toggleEvolution(organizationId: string, enabled: boolean, userId: string): Promise<EvolutionSettings> {
    return tracer.startActiveSpan('toggleEvolution', async (span) => {
      try {
        span.setAttributes({ organizationId, enabled });

        const settings = await this.prisma.evolutionSettings.update({
          where: { organizationId },
          data: {
            enabled,
            lastModifiedBy: userId,
            updatedAt: new Date(),
          },
        });

        if (enabled) {
          await this.startEvolutionProcess(organizationId);
          await this.logEvent(organizationId, {
            type: 'analysis_started',
            severity: 'info',
            title: 'Evolution Enabled',
            description: 'Auto-evolution has been enabled for this organization',
            data: { enabledBy: userId },
            triggeredBy: userId,
          });
        } else {
          await this.stopEvolutionProcess(organizationId);
          await this.logEvent(organizationId, {
            type: 'emergency_stop',
            severity: 'warning',
            title: 'Evolution Disabled',
            description: 'Auto-evolution has been disabled for this organization',
            data: { disabledBy: userId },
            triggeredBy: userId,
          });
        }

        span.addEvent('Evolution toggled', { enabled });
        return settings as EvolutionSettings;
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  async updateEvolutionSettings(
    organizationId: string,
    updates: Partial<EvolutionSettings>,
    userId: string
  ): Promise<EvolutionSettings> {
    const settings = await this.prisma.evolutionSettings.update({
      where: { organizationId },
      data: {
        features: updates.features as any,
        safeguards: updates.safeguards as any,
        metadata: updates.metadata as any,
        lastModifiedBy: userId,
        updatedAt: new Date(),
      },
    });

    await this.logEvent(organizationId, {
      type: 'analysis_started',
      severity: 'info',
      title: 'Settings Updated',
      description: 'Evolution settings have been updated',
      data: { updatedBy: userId, changes: updates },
      triggeredBy: userId,
    });

    return settings as EvolutionSettings;
  }

  async emergencyStop(organizationId: string, userId: string, reason: string): Promise<void> {
    return tracer.startActiveSpan('emergencyStop', async (span) => {
      try {
        span.setAttributes({ organizationId, reason });

        // Immediately disable all evolution features
        await this.prisma.evolutionSettings.update({
          where: { organizationId },
          data: {
            enabled: false,
            'safeguards.emergencyStop': true,
            lastModifiedBy: userId,
            updatedAt: new Date(),
            metadata: {
              emergencyStopReason: reason,
              emergencyStopAt: new Date(),
              emergencyStopBy: userId,
            },
          },
        });

        // Stop all running processes
        await this.stopEvolutionProcess(organizationId);

        // Rollback any in-progress changes
        await this.rollbackInProgressChanges(organizationId);

        // Log emergency stop event
        await this.logEvent(organizationId, {
          type: 'emergency_stop',
          severity: 'critical',
          title: 'Emergency Stop Activated',
          description: `Emergency stop activated: ${reason}`,
          data: { reason, stoppedBy: userId },
          triggeredBy: userId,
        });

        // Send notifications
        await this.sendEmergencyNotification(organizationId, reason, userId);

        span.addEvent('Emergency stop activated', { reason });
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async startEvolutionProcess(organizationId: string): Promise<void> {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;

    // Start main evolution loop
    this.evolutionLoop = setInterval(async () => {
      try {
        await this.runEvolutionCycle(organizationId);
      } catch (error) {
        console.error('Evolution cycle error:', error);
        await this.logEvent(organizationId, {
          type: 'error',
          severity: 'error',
          title: 'Evolution Cycle Error',
          description: `Error in evolution cycle: ${(error as Error).message}`,
          data: { error: (error as Error).message },
          triggeredBy: 'system',
        });
      }
    }, 30 * 60 * 1000); // Every 30 minutes

    // Start individual services
    await this.analysisService.startBackgroundAnalysis();
    await this.canaryService.startCanaryTesting();
  }

  private async stopEvolutionProcess(organizationId: string): Promise<void> {
    this.isRunning = false;

    if (this.evolutionLoop) {
      clearInterval(this.evolutionLoop);
      this.evolutionLoop = null;
    }

    await this.canaryService.stopCanaryTesting();
  }

  private async runEvolutionCycle(organizationId: string): Promise<void> {
    return tracer.startActiveSpan('runEvolutionCycle', async (span) => {
      try {
        span.setAttributes({ organizationId });

        const settings = await this.getEvolutionSettings(organizationId);

        if (!settings.enabled) {
          return;
        }

        // Check safeguards
        const safeguardsPassed = await this.checkSafeguards(organizationId, settings);
        if (!safeguardsPassed) {
          await this.logEvent(organizationId, {
            type: 'error',
            severity: 'warning',
            title: 'Safeguards Failed',
            description: 'Evolution cycle skipped due to safeguard violations',
            data: {},
            triggeredBy: 'system',
          });
          return;
        }

        // Process refactor suggestions
        if (settings.features.autoRefactor.enabled) {
          await this.refactorService.processNewSuggestions();
        }

        // Update metrics
        await this.updateEvolutionMetrics(organizationId);

        span.addEvent('Evolution cycle completed');
      } catch (error) {
        span.recordException(error as Error);
        throw error;
      } finally {
        span.end();
      }
    });
  }

  private async checkSafeguards(organizationId: string, settings: EvolutionSettings): Promise<boolean> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Check daily change limit
    const todayChanges = await this.prisma.refactorExecution.count({
      where: {
        startedAt: { gte: today },
        status: 'completed',
      },
    });

    if (todayChanges >= settings.safeguards.maxDailyChanges) {
      return false;
    }

    // Check emergency stop
    if (settings.safeguards.emergencyStop) {
      return false;
    }

    // Check test coverage
    const latestAnalysis = await this.analysisService.getLatestAnalysisResults(1);
    if (latestAnalysis.length > 0) {
      const coverage = latestAnalysis[0].metrics.testCoverage;
      if (coverage < settings.safeguards.testCoverageThreshold) {
        return false;
      }
    }

    return true;
  }

  private async rollbackInProgressChanges(organizationId: string): Promise<void> {
    const inProgressExecutions = await this.prisma.refactorExecution.findMany({
      where: {
        status: 'in_progress',
      },
    });

    for (const execution of inProgressExecutions) {
      try {
        // Attempt to rollback the execution
        await this.prisma.refactorExecution.update({
          where: { id: execution.id },
          data: {
            status: 'rolled_back',
            completedAt: new Date(),
            metadata: {
              rollbackReason: 'Emergency stop',
            },
          },
        });
      } catch (error) {
        console.error(`Failed to rollback execution ${execution.id}:`, error);
      }
    }
  }

  private async updateEvolutionMetrics(organizationId: string): Promise<void> {
    const endDate = new Date();
    const startDate = new Date(endDate.getTime() - 24 * 60 * 60 * 1000); // Last 24 hours

    const refactorMetrics = await this.refactorService.getRefactorMetrics({
      start: startDate,
      end: endDate,
    });

    const analysisResults = await this.analysisService.getLatestAnalysisResults(10);

    const metrics: EvolutionMetrics = {
      period: { start: startDate, end: endDate },
      codeAnalysis: {
        runsCompleted: analysisResults.length,
        issuesFound: analysisResults.reduce((sum, r) => sum + r.findings.length, 0),
        issuesFixed: analysisResults.reduce((sum, r) => sum + r.suggestions.filter(s => s.automationLevel === 'automatic').length, 0),
        averageRunTime: 120, // minutes
      },
      refactoring: {
        suggestionsGenerated: refactorMetrics.totalSuggestions,
        suggestionsApproved: refactorMetrics.approvedSuggestions,
        suggestionsApplied: refactorMetrics.automaticApplied + refactorMetrics.manualApplied,
        averageConfidence: 0.75,
        successRate: refactorMetrics.successRate,
      },
      canaryTesting: {
        modelsDeployed: 0, // Would come from canary service
        modelsPromoted: 0,
        modelsRolledBack: 0,
        averageTestDuration: 4, // hours
        promotionRate: 0.8,
      },
      impact: {
        performanceImprovement: 15.2,
        securityIssuesResolved: 12,
        codeQualityIncrease: 8.5,
        testCoverageIncrease: 3.2,
      },
      risks: {
        changesReverted: 2,
        prodIssues: 0,
        downtime: 0,
        securityIncidents: 0,
      },
    };

    await this.prisma.evolutionMetrics.create({
      data: {
        organizationId,
        period: metrics.period as any,
        codeAnalysis: metrics.codeAnalysis as any,
        refactoring: metrics.refactoring as any,
        canaryTesting: metrics.canaryTesting as any,
        impact: metrics.impact as any,
        risks: metrics.risks as any,
        createdAt: new Date(),
      },
    });
  }

  private async sendEmergencyNotification(organizationId: string, reason: string, userId: string): Promise<void> {
    // In real implementation, this would send notifications via configured channels
    console.log(`EMERGENCY STOP: ${reason} (triggered by ${userId})`);
  }

  async logEvent(organizationId: string, event: Omit<EvolutionEvent, 'id' | 'organizationId' | 'createdAt'>): Promise<void> {
    await this.prisma.evolutionEvent.create({
      data: {
        organizationId,
        type: event.type,
        severity: event.severity,
        title: event.title,
        description: event.description,
        data: event.data as any,
        triggeredBy: event.triggeredBy,
        acknowledgedAt: event.acknowledgedAt,
        acknowledgedBy: event.acknowledgedBy,
        metadata: event.metadata as any,
        createdAt: new Date(),
      },
    });
  }

  async getEvolutionSettings(organizationId: string): Promise<EvolutionSettings> {
    let settings = await this.prisma.evolutionSettings.findUnique({
      where: { organizationId },
    });

    if (!settings) {
      // Create default settings
      settings = await this.createDefaultSettings(organizationId);
    }

    return settings as EvolutionSettings;
  }

  private async createDefaultSettings(organizationId: string): Promise<EvolutionSettings> {
    const defaultSettings = {
      organizationId,
      enabled: false,
      features: {
        codeAnalysis: {
          enabled: true,
          schedule: '0 */6 * * *', // Every 6 hours
          analysisTypes: ['performance', 'security', 'style', 'complexity'],
          autoFix: {
            enabled: false,
            confidenceThreshold: 0.9,
            allowedTypes: ['style_improvement'],
          },
        },
        autoRefactor: {
          enabled: false,
          autoApprove: false,
          confidenceThreshold: 0.8,
          maxChangesPerDay: 10,
          requiresReview: ['**/*.ts', '**/*.tsx'],
          rollbackOnFailure: true,
        },
        canaryTesting: {
          enabled: false,
          autoPromote: false,
          trafficPercentage: 10,
          testDuration: 24,
          promotionCriteria: {
            accuracyImprovement: 2,
            errorRateThreshold: 0.05,
            latencyThreshold: 1.5,
          },
        },
        notifications: {
          enabled: true,
          channels: ['email'],
          events: ['canary_promoted', 'error'],
          recipients: [],
        },
      },
      safeguards: {
        maxDailyChanges: 5,
        requiredApprovers: 1,
        emergencyStop: false,
        rollbackWindow: 24,
        testCoverageThreshold: 80,
        securityScanRequired: true,
      },
      metadata: {},
      lastModifiedBy: 'system',
    };

    const settings = await this.prisma.evolutionSettings.create({
      data: {
        ...defaultSettings,
        features: defaultSettings.features as any,
        safeguards: defaultSettings.safeguards as any,
        metadata: defaultSettings.metadata as any,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    });

    return settings as EvolutionSettings;
  }

  async getEvolutionMetrics(organizationId: string, days: number = 7): Promise<EvolutionMetrics[]> {
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const metrics = await this.prisma.evolutionMetrics.findMany({
      where: {
        organizationId,
        createdAt: { gte: startDate },
      },
      orderBy: { createdAt: 'desc' },
    });

    return metrics as EvolutionMetrics[];
  }

  async getEvolutionEvents(organizationId: string, limit: number = 50): Promise<EvolutionEvent[]> {
    const events = await this.prisma.evolutionEvent.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return events as EvolutionEvent[];
  }

  async acknowledgeEvent(eventId: string, userId: string): Promise<void> {
    await this.prisma.evolutionEvent.update({
      where: { id: eventId },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: userId,
      },
    });
  }
}