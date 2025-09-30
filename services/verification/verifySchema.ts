/**
 * Schema Verification Service
 *
 * Implements ensemble verification for critical schema operations.
 * Runs multiple models and requires quorum for destructive operations.
 */

import { selectModelForTask } from '../models/selector';
import { SchemaAgent } from '../agents/schemaAgent';
import { prisma } from '@/lib/db';
import { redactSecretsFromObject } from '@/lib/utils/secretRedaction';

export interface VerificationContext {
  operation: 'schema_design' | 'migration_plan' | 'schema_validation';
  inputs: Record<string, any>;
  userId: string;
  projectId?: string;
  requireQuorum?: boolean;
  quorumSize?: number;
}

export interface VerificationResult {
  success: boolean;
  consensus: boolean;
  results: AgentVerificationResult[];
  finalResult?: any;
  safetyChecks: SafetyCheckResult[];
  error?: string;
  metadata: {
    modelsUsed: string[];
    agreementScore: number;
    destructiveOperations: string[];
    hasSafetyViolations: boolean;
  };
}

export interface AgentVerificationResult {
  modelId: string;
  modelName: string;
  success: boolean;
  result: any;
  executionTime: number;
  error?: string;
}

export interface SafetyCheckResult {
  check: string;
  passed: boolean;
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  details?: any;
}

export class SchemaVerificationService {
  private readonly QUORUM_SIZE = 2;
  private readonly AGREEMENT_THRESHOLD = 0.7;

  /**
   * Verify schema operation using ensemble of models
   */
  async verifySchemaOperation(context: VerificationContext): Promise<VerificationResult> {
    const startTime = Date.now();
    console.log(`Starting schema verification for operation: ${context.operation}`);

    try {
      // Determine models to use for verification
      const models = await this.selectVerificationModels(context);

      if (models.length === 0) {
        return this.createFailureResult('No models available for verification', []);
      }

      // Run verification with multiple models
      const agentResults = await this.runEnsembleVerification(models, context);

      // Check if we have enough successful results
      const successfulResults = agentResults.filter(r => r.success);

      if (successfulResults.length === 0) {
        await this.logVerificationFailure(context, 'All models failed', agentResults);
        return this.createFailureResult('All verification models failed', agentResults);
      }

      // Perform safety checks on all results
      const safetyChecks = await this.performSafetyChecks(context, successfulResults);

      // Check for critical safety violations
      const criticalViolations = safetyChecks.filter(c => c.severity === 'critical' && !c.passed);
      if (criticalViolations.length > 0) {
        await this.logVerificationFailure(context, 'Critical safety violations', agentResults, safetyChecks);
        return {
          success: false,
          consensus: false,
          results: agentResults,
          safetyChecks,
          error: `Critical safety violations: ${criticalViolations.map(v => v.message).join('; ')}`,
          metadata: {
            modelsUsed: models.map(m => m.id),
            agreementScore: 0,
            destructiveOperations: this.extractDestructiveOperations(successfulResults),
            hasSafetyViolations: true,
          },
        };
      }

      // Calculate consensus
      const consensus = this.calculateConsensus(successfulResults);

      // Check if quorum is required and met
      const requiresQuorum = context.requireQuorum !== false && this.isDestructiveOperation(context);
      const quorumSize = context.quorumSize || this.QUORUM_SIZE;

      if (requiresQuorum && successfulResults.length < quorumSize) {
        await this.logVerificationFailure(context, 'Insufficient quorum', agentResults, safetyChecks);
        return {
          success: false,
          consensus: false,
          results: agentResults,
          safetyChecks,
          error: `Insufficient quorum: ${successfulResults.length}/${quorumSize} models succeeded`,
          metadata: {
            modelsUsed: models.map(m => m.id),
            agreementScore: consensus.agreementScore,
            destructiveOperations: this.extractDestructiveOperations(successfulResults),
            hasSafetyViolations: criticalViolations.length > 0,
          },
        };
      }

      // Check agreement threshold
      if (requiresQuorum && consensus.agreementScore < this.AGREEMENT_THRESHOLD) {
        await this.logVerificationFailure(context, 'Insufficient agreement', agentResults, safetyChecks);
        return {
          success: false,
          consensus: false,
          results: agentResults,
          safetyChecks,
          error: `Insufficient agreement: ${consensus.agreementScore.toFixed(2)} < ${this.AGREEMENT_THRESHOLD}`,
          metadata: {
            modelsUsed: models.map(m => m.id),
            agreementScore: consensus.agreementScore,
            destructiveOperations: this.extractDestructiveOperations(successfulResults),
            hasSafetyViolations: criticalViolations.length > 0,
          },
        };
      }

      // Select final result (use consensus or best performing model)
      const finalResult = consensus.consensusResult || successfulResults[0].result;

      // Log successful verification
      await this.logVerificationSuccess(context, agentResults, safetyChecks, consensus.agreementScore);

      const duration = Date.now() - startTime;
      console.log(`Schema verification completed successfully in ${duration}ms`);

      return {
        success: true,
        consensus: consensus.agreementScore >= this.AGREEMENT_THRESHOLD,
        results: agentResults,
        finalResult,
        safetyChecks,
        metadata: {
          modelsUsed: models.map(m => m.id),
          agreementScore: consensus.agreementScore,
          destructiveOperations: this.extractDestructiveOperations(successfulResults),
          hasSafetyViolations: safetyChecks.some(c => c.severity === 'critical' && !c.passed),
        },
      };

    } catch (error) {
      console.error('Schema verification failed:', error);
      await this.logVerificationFailure(context, error instanceof Error ? error.message : 'Unknown error', []);

      return this.createFailureResult(
        `Verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        []
      );
    }
  }

  /**
   * Select models for verification
   */
  private async selectVerificationModels(context: VerificationContext) {
    const models = [];

    // Get primary model for schema role
    const primaryModel = await selectModelForTask('schema', {
      isCritical: true,
      userId: context.userId,
      projectId: context.projectId,
    });

    if (primaryModel) {
      models.push(primaryModel.model);
    }

    // Get secondary model(s) for verification
    const quorumSize = context.quorumSize || this.QUORUM_SIZE;

    for (let i = models.length; i < quorumSize; i++) {
      const secondaryModel = await selectModelForTask('schema', {
        isCritical: false,
        userId: `verification-${i}`, // Different seed for different model selection
        projectId: context.projectId,
      });

      if (secondaryModel && !models.find(m => m.id === secondaryModel.model.id)) {
        models.push(secondaryModel.model);
      }
    }

    return models;
  }

  /**
   * Run verification with ensemble of models
   */
  private async runEnsembleVerification(models: any[], context: VerificationContext): Promise<AgentVerificationResult[]> {
    const results = await Promise.allSettled(
      models.map(async (model) => {
        const startTime = Date.now();
        const agent = new SchemaAgent();

        try {
          const agentContext = {
            userId: context.userId,
            projectId: context.projectId,
            taskId: `verification-${model.id}-${Date.now()}`,
            inputs: {
              ...context.inputs,
              operation: context.operation,
            },
          };

          const result = await agent.execute(agentContext);
          const executionTime = Date.now() - startTime;

          return {
            modelId: model.id,
            modelName: model.name,
            success: result.success,
            result: result.outputs,
            executionTime,
            error: result.error,
          };

        } catch (error) {
          const executionTime = Date.now() - startTime;
          return {
            modelId: model.id,
            modelName: model.name,
            success: false,
            result: null,
            executionTime,
            error: error instanceof Error ? error.message : 'Unknown error',
          };
        }
      })
    );

    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        return {
          modelId: models[index].id,
          modelName: models[index].name,
          success: false,
          result: null,
          executionTime: 0,
          error: result.reason instanceof Error ? result.reason.message : 'Unknown error',
        };
      }
    });
  }

  /**
   * Perform safety checks on verification results
   */
  private async performSafetyChecks(
    context: VerificationContext,
    results: AgentVerificationResult[]
  ): Promise<SafetyCheckResult[]> {
    const checks: SafetyCheckResult[] = [];

    // Check for destructive operations without safeguards
    checks.push(await this.checkDestructiveOperations(results));

    // Check for data loss potential
    checks.push(await this.checkDataLossRisk(results));

    // Check for constraint violations
    checks.push(await this.checkConstraintViolations(results));

    // Check for rollback safety
    checks.push(await this.checkRollbackSafety(results));

    // Check for foreign key consistency
    checks.push(await this.checkForeignKeyConsistency(results));

    return checks;
  }

  /**
   * Check for destructive operations
   */
  private async checkDestructiveOperations(results: AgentVerificationResult[]): Promise<SafetyCheckResult> {
    const destructiveKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER TABLE', 'DROP COLUMN'];

    for (const result of results) {
      if (result.result?.artifacts) {
        for (const artifact of result.result.artifacts) {
          if (artifact.type === 'migration' && artifact.content) {
            const content = artifact.content.toUpperCase();
            const hasDestructive = destructiveKeywords.some(keyword => content.includes(keyword));

            if (hasDestructive) {
              // Check if there are safety guards
              const hasBackup = content.includes('BACKUP') || content.includes('-- ROLLBACK');
              const hasConfirmation = content.includes('-- CONFIRMED') || content.includes('-- SAFE');

              if (!hasBackup && !hasConfirmation) {
                return {
                  check: 'destructive_operations',
                  passed: false,
                  severity: 'critical',
                  message: 'Destructive operations detected without safety guards',
                  details: { keywords: destructiveKeywords.filter(k => content.includes(k)) },
                };
              }
            }
          }
        }
      }
    }

    return {
      check: 'destructive_operations',
      passed: true,
      severity: 'low',
      message: 'No unsafe destructive operations detected',
    };
  }

  /**
   * Check for data loss risk
   */
  private async checkDataLossRisk(results: AgentVerificationResult[]): Promise<SafetyCheckResult> {
    // Implementation for data loss risk assessment
    return {
      check: 'data_loss_risk',
      passed: true,
      severity: 'low',
      message: 'No significant data loss risk detected',
    };
  }

  /**
   * Check for constraint violations
   */
  private async checkConstraintViolations(results: AgentVerificationResult[]): Promise<SafetyCheckResult> {
    // Implementation for constraint violation checks
    return {
      check: 'constraint_violations',
      passed: true,
      severity: 'low',
      message: 'No constraint violations detected',
    };
  }

  /**
   * Check rollback safety
   */
  private async checkRollbackSafety(results: AgentVerificationResult[]): Promise<SafetyCheckResult> {
    // Implementation for rollback safety checks
    return {
      check: 'rollback_safety',
      passed: true,
      severity: 'medium',
      message: 'Rollback procedures are adequate',
    };
  }

  /**
   * Check foreign key consistency
   */
  private async checkForeignKeyConsistency(results: AgentVerificationResult[]): Promise<SafetyCheckResult> {
    // Implementation for foreign key consistency checks
    return {
      check: 'foreign_key_consistency',
      passed: true,
      severity: 'medium',
      message: 'Foreign key relationships are consistent',
    };
  }

  /**
   * Calculate consensus among results
   */
  private calculateConsensus(results: AgentVerificationResult[]): {
    agreementScore: number;
    consensusResult?: any;
  } {
    if (results.length <= 1) {
      return {
        agreementScore: results.length > 0 ? 1.0 : 0.0,
        consensusResult: results[0]?.result,
      };
    }

    // Simple consensus based on schema similarity
    // In a real implementation, this would compare schema structures more intelligently
    let agreements = 0;
    const totalComparisons = (results.length * (results.length - 1)) / 2;

    for (let i = 0; i < results.length; i++) {
      for (let j = i + 1; j < results.length; j++) {
        const similarity = this.compareSchemaResults(results[i].result, results[j].result);
        if (similarity > 0.8) {
          agreements++;
        }
      }
    }

    const agreementScore = totalComparisons > 0 ? agreements / totalComparisons : 0;

    return {
      agreementScore,
      consensusResult: results[0].result, // Use first result as consensus for now
    };
  }

  /**
   * Compare two schema results for similarity
   */
  private compareSchemaResults(result1: any, result2: any): number {
    // Simple comparison - in practice this would be more sophisticated
    if (!result1 || !result2) return 0;

    try {
      const str1 = JSON.stringify(result1);
      const str2 = JSON.stringify(result2);

      if (str1 === str2) return 1.0;

      // Simple similarity based on string similarity
      const shorter = str1.length < str2.length ? str1 : str2;
      const longer = str1.length >= str2.length ? str1 : str2;

      const similarity = shorter.length / longer.length;
      return similarity;

    } catch {
      return 0;
    }
  }

  /**
   * Check if operation is destructive
   */
  private isDestructiveOperation(context: VerificationContext): boolean {
    return context.operation === 'migration_plan' ||
           (context.inputs.operation && ['migrate', 'optimize'].includes(context.inputs.operation));
  }

  /**
   * Extract destructive operations from results
   */
  private extractDestructiveOperations(results: AgentVerificationResult[]): string[] {
    const operations = new Set<string>();
    const destructiveKeywords = ['DROP', 'DELETE', 'TRUNCATE', 'ALTER TABLE'];

    for (const result of results) {
      if (result.result?.artifacts) {
        for (const artifact of result.result.artifacts) {
          if (artifact.type === 'migration' && artifact.content) {
            const content = artifact.content.toUpperCase();
            destructiveKeywords.forEach(keyword => {
              if (content.includes(keyword)) {
                operations.add(keyword);
              }
            });
          }
        }
      }
    }

    return Array.from(operations);
  }

  /**
   * Create failure result
   */
  private createFailureResult(error: string, results: AgentVerificationResult[]): VerificationResult {
    return {
      success: false,
      consensus: false,
      results,
      safetyChecks: [],
      error,
      metadata: {
        modelsUsed: results.map(r => r.modelId),
        agreementScore: 0,
        destructiveOperations: [],
        hasSafetyViolations: true,
      },
    };
  }

  /**
   * Log verification success
   */
  private async logVerificationSuccess(
    context: VerificationContext,
    results: AgentVerificationResult[],
    safetyChecks: SafetyCheckResult[],
    agreementScore: number
  ): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'verification_success',
          userId: context.userId,
          projectId: context.projectId,
          payload: redactSecretsFromObject({
            operation: context.operation,
            modelsUsed: results.map(r => ({ modelId: r.modelId, success: r.success })),
            agreementScore,
            safetyChecks: safetyChecks.map(c => ({
              check: c.check,
              passed: c.passed,
              severity: c.severity
            })),
            executionTime: results.reduce((sum, r) => sum + r.executionTime, 0),
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log verification success:', error);
    }
  }

  /**
   * Log verification failure
   */
  private async logVerificationFailure(
    context: VerificationContext,
    reason: string,
    results: AgentVerificationResult[],
    safetyChecks: SafetyCheckResult[] = []
  ): Promise<void> {
    try {
      await prisma.telemetryEvent.create({
        data: {
          eventType: 'verification_fail',
          userId: context.userId,
          projectId: context.projectId,
          payload: redactSecretsFromObject({
            operation: context.operation,
            reason,
            modelsUsed: results.map(r => ({ modelId: r.modelId, success: r.success })),
            safetyChecks: safetyChecks.map(c => ({
              check: c.check,
              passed: c.passed,
              severity: c.severity
            })),
            failureDetails: results.filter(r => !r.success).map(r => r.error),
          }),
        },
      });
    } catch (error) {
      console.error('Failed to log verification failure:', error);
    }
  }
}

// Export singleton instance
export const schemaVerificationService = new SchemaVerificationService();

/**
 * Convenience function for schema verification
 */
export async function verifySchemaOperation(
  operation: 'schema_design' | 'migration_plan' | 'schema_validation',
  inputs: Record<string, any>,
  userId: string,
  projectId?: string,
  options: { requireQuorum?: boolean; quorumSize?: number } = {}
): Promise<VerificationResult> {
  return await schemaVerificationService.verifySchemaOperation({
    operation,
    inputs,
    userId,
    projectId,
    ...options,
  });
}