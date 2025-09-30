/**
 * Schema Design Agent
 *
 * Specializes in database schema design and management:
 * - Database schema analysis and design
 * - Prisma schema generation
 * - Migration planning and validation
 * - Index optimization
 * - Data relationship modeling
 */

import { z } from 'zod';
import { BaseAgent } from './baseAgent';
import {
  AgentContext,
  AgentResult,
  Artifact,
  DEFAULT_AGENT_CONFIGS,
} from './types';

// Input validation schema
const SchemaInputSchema = z.object({
  operation: z.enum(['design', 'analyze', 'migrate', 'optimize', 'validate']),
  entities: z.array(z.object({
    name: z.string(),
    description: z.string().optional(),
    fields: z.array(z.object({
      name: z.string(),
      type: z.string(),
      required: z.boolean().optional(),
      unique: z.boolean().optional(),
      indexed: z.boolean().optional(),
      references: z.string().optional(),
    })).optional(),
  })).optional(),
  relationships: z.array(z.object({
    from: z.string(),
    to: z.string(),
    type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
  })).optional(),
  requirements: z.array(z.string()).optional(),
  constraints: z.object({
    database: z.enum(['postgresql', 'mysql', 'sqlite']).optional(),
    performance: z.enum(['low', 'medium', 'high']).optional(),
    scalability: z.enum(['small', 'medium', 'large']).optional(),
  }).optional(),
  existingSchema: z.string().optional(),
});

export class SchemaAgent extends BaseAgent {
  public readonly name = 'SchemaAgent';
  public readonly version = '1.0.0';
  public readonly capabilities = [
    'database-schema-design',
    'prisma-schema-generation',
    'migration-planning',
    'index-optimization',
    'relationship-modeling',
    'schema-validation',
    'performance-analysis',
  ];

  constructor() {
    super(DEFAULT_AGENT_CONFIGS.SchemaAgent);
  }

  /**
   * Validate inputs specific to schema operations
   */
  async validateInputs(inputs: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    try {
      SchemaInputSchema.parse(inputs);
      return { valid: true, errors: [] };
    } catch (error) {
      if (error instanceof z.ZodError) {
        return {
          valid: false,
          errors: error.issues.map(issue => `${issue.path.join('.')}: ${issue.message}`),
        };
      }
      return {
        valid: false,
        errors: ['Unknown validation error'],
      };
    }
  }

  /**
   * Execute schema operation
   */
  protected async executeInternal(context: AgentContext): Promise<Omit<AgentResult, 'logs' | 'metrics'>> {
    this.validateContext(context);

    const { operation, entities, relationships, requirements, constraints, existingSchema } = context.inputs;

    this.log('info', `Executing schema ${operation}`, {
      entitiesCount: entities?.length || 0,
      relationshipsCount: relationships?.length || 0
    });

    // Create snapshot before schema changes
    const snapshotId = await this.createSnapshot(context, `Before schema ${operation}`);

    try {
      let result;

      switch (operation) {
        case 'design':
          result = await this.designSchema(entities, relationships, requirements, constraints);
          break;
        case 'analyze':
          result = await this.analyzeSchema(existingSchema, requirements);
          break;
        case 'migrate':
          result = await this.planMigration(existingSchema, entities, relationships);
          break;
        case 'optimize':
          result = await this.optimizeSchema(existingSchema, constraints);
          break;
        case 'validate':
          result = await this.validateSchema(existingSchema);
          break;
        default:
          throw new Error(`Unsupported schema operation: ${operation}`);
      }

      this.log('info', `Schema ${operation} completed successfully`, {
        artifactsGenerated: result.artifacts?.length || 0,
      });

      return {
        success: true,
        ...result,
        snapshotId,
      };

    } catch (error) {
      this.log('error', `Schema ${operation} failed`, {
        error: error instanceof Error ? error.message : 'Unknown error'
      });
      throw error;
    }
  }

  /**
   * Design a new database schema
   */
  private async designSchema(
    entities: any[],
    relationships: any[],
    requirements: string[] = [],
    constraints: any = {}
  ): Promise<any> {
    this.log('debug', 'Designing database schema', {
      entitiesCount: entities.length,
      relationshipsCount: relationships.length
    });

    // Create schema design prompt
    const prompt = this.createSchemaDesignPrompt(entities, relationships, requirements, constraints);

    // Call AI model for schema design
    const result = await this.callModel(prompt, {
      maxTokens: 6144,
      temperature: 0.0, // Very deterministic for schema design
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    // Parse the schema design
    const schemaDesign = this.parseSchemaResponse(result.response);

    // Generate Prisma schema
    const prismaSchema = this.generatePrismaSchema(schemaDesign);

    // Generate migration SQL
    const migrationSql = this.generateMigrationSql(schemaDesign, constraints.database || 'postgresql');

    const artifacts: Artifact[] = [
      {
        id: `schema-design-${Date.now()}`,
        type: 'schema',
        name: 'schema.prisma',
        content: prismaSchema,
        path: 'prisma/schema.prisma',
        metadata: {
          operation: 'design',
          database: constraints.database || 'postgresql',
          entities: entities.map(e => e.name),
        },
      },
      {
        id: `migration-${Date.now()}`,
        type: 'migration',
        name: 'schema_design.sql',
        content: migrationSql,
        path: `prisma/migrations/schema_design_${Date.now()}/migration.sql`,
        metadata: {
          operation: 'create_schema',
          database: constraints.database || 'postgresql',
        },
      },
    ];

    // Generate documentation
    const documentation = this.generateSchemaDocumentation(schemaDesign);
    artifacts.push({
      id: `docs-${Date.now()}`,
      type: 'documentation',
      name: 'schema-design.md',
      content: documentation,
      path: 'docs/schema-design.md',
      metadata: {
        type: 'schema-documentation',
      },
    });

    return {
      outputs: {
        schemaDesign,
        entities: schemaDesign.entities,
        relationships: schemaDesign.relationships,
        indexes: schemaDesign.indexes,
        constraints: schemaDesign.constraints,
      },
      artifacts,
    };
  }

  /**
   * Analyze existing schema
   */
  private async analyzeSchema(existingSchema: string, requirements: string[] = []): Promise<any> {
    this.log('debug', 'Analyzing existing schema');

    const prompt = this.createSchemaAnalysisPrompt(existingSchema, requirements);

    const result = await this.callModel(prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const analysis = this.parseAnalysisResponse(result.response);

    // Generate analysis report
    const report = this.generateAnalysisReport(analysis);

    const artifacts: Artifact[] = [
      {
        id: `analysis-${Date.now()}`,
        type: 'documentation',
        name: 'schema-analysis.md',
        content: report,
        path: 'docs/schema-analysis.md',
        metadata: {
          type: 'schema-analysis',
          timestamp: new Date().toISOString(),
        },
      },
    ];

    return {
      outputs: {
        analysis,
        recommendations: analysis.recommendations,
        issues: analysis.issues,
        metrics: analysis.metrics,
      },
      artifacts,
    };
  }

  /**
   * Plan schema migration
   */
  private async planMigration(existingSchema: string, newEntities: any[], newRelationships: any[]): Promise<any> {
    this.log('debug', 'Planning schema migration');

    const prompt = this.createMigrationPlanPrompt(existingSchema, newEntities, newRelationships);

    const result = await this.callModel(prompt, {
      maxTokens: 5120,
      temperature: 0.0,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const migrationPlan = this.parseMigrationResponse(result.response);

    // Generate migration files
    const artifacts: Artifact[] = [];

    for (const step of migrationPlan.steps) {
      artifacts.push({
        id: `migration-step-${step.order}`,
        type: 'migration',
        name: `${step.order}_${step.name}.sql`,
        content: step.sql,
        path: `prisma/migrations/${step.order}_${step.name}/migration.sql`,
        metadata: {
          order: step.order,
          operation: step.operation,
          rollback: step.rollback,
        },
      });
    }

    // Generate migration documentation
    const documentation = this.generateMigrationDocumentation(migrationPlan);
    artifacts.push({
      id: `migration-docs-${Date.now()}`,
      type: 'documentation',
      name: 'migration-plan.md',
      content: documentation,
      path: 'docs/migration-plan.md',
      metadata: {
        type: 'migration-documentation',
      },
    });

    return {
      outputs: {
        migrationPlan,
        steps: migrationPlan.steps,
        estimatedTime: migrationPlan.estimatedTime,
        risks: migrationPlan.risks,
      },
      artifacts,
    };
  }

  /**
   * Optimize existing schema
   */
  private async optimizeSchema(existingSchema: string, constraints: any = {}): Promise<any> {
    this.log('debug', 'Optimizing schema performance');

    const prompt = this.createOptimizationPrompt(existingSchema, constraints);

    const result = await this.callModel(prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const optimizations = this.parseOptimizationResponse(result.response);

    // Generate optimization scripts
    const artifacts: Artifact[] = [];

    if (optimizations.indexes.length > 0) {
      const indexSql = optimizations.indexes.map(idx => idx.sql).join('\n\n');
      artifacts.push({
        id: `optimization-indexes-${Date.now()}`,
        type: 'migration',
        name: 'add_indexes.sql',
        content: indexSql,
        path: 'prisma/migrations/optimization_indexes/migration.sql',
        metadata: {
          operation: 'add_indexes',
          count: optimizations.indexes.length,
        },
      });
    }

    // Generate optimization report
    const report = this.generateOptimizationReport(optimizations);
    artifacts.push({
      id: `optimization-report-${Date.now()}`,
      type: 'documentation',
      name: 'optimization-report.md',
      content: report,
      path: 'docs/optimization-report.md',
      metadata: {
        type: 'optimization-report',
      },
    });

    return {
      outputs: {
        optimizations,
        indexes: optimizations.indexes,
        modifications: optimizations.modifications,
        estimatedImprovement: optimizations.estimatedImprovement,
      },
      artifacts,
    };
  }

  /**
   * Validate schema integrity
   */
  private async validateSchema(existingSchema: string): Promise<any> {
    this.log('debug', 'Validating schema integrity');

    const prompt = this.createValidationPrompt(existingSchema);

    const result = await this.callModel(prompt, {
      maxTokens: 3072,
      temperature: 0.0,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const validation = this.parseValidationResponse(result.response);

    // Generate validation report
    const report = this.generateValidationReport(validation);

    const artifacts: Artifact[] = [
      {
        id: `validation-${Date.now()}`,
        type: 'documentation',
        name: 'schema-validation.md',
        content: report,
        path: 'docs/schema-validation.md',
        metadata: {
          type: 'schema-validation',
          timestamp: new Date().toISOString(),
          valid: validation.valid,
        },
      },
    ];

    return {
      outputs: {
        validation,
        valid: validation.valid,
        errors: validation.errors,
        warnings: validation.warnings,
        suggestions: validation.suggestions,
      },
      artifacts,
    };
  }

  /**
   * Create prompts for different schema operations
   */
  private createSchemaDesignPrompt(entities: any[], relationships: any[], requirements: string[], constraints: any): string {
    return `Design a database schema based on the following requirements:

ENTITIES:
${entities.map(e => `- ${e.name}: ${e.description || 'No description'}`).join('\n')}

RELATIONSHIPS:
${relationships.map(r => `- ${r.from} ${r.type} ${r.to}`).join('\n')}

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

CONSTRAINTS:
- Database: ${constraints.database || 'PostgreSQL'}
- Performance: ${constraints.performance || 'medium'}
- Scalability: ${constraints.scalability || 'medium'}

Design a comprehensive schema that includes:
1. All necessary tables with appropriate data types
2. Primary and foreign key relationships
3. Indexes for performance optimization
4. Constraints for data integrity
5. Consider normalization and performance trade-offs

Return the schema design in a structured format with tables, columns, relationships, and indexes.`;
  }

  private createSchemaAnalysisPrompt(existingSchema: string, requirements: string[]): string {
    return `Analyze the following database schema and provide recommendations:

EXISTING SCHEMA:
${existingSchema}

REQUIREMENTS:
${requirements.map(r => `- ${r}`).join('\n')}

Analyze the schema for:
1. Data integrity issues
2. Performance bottlenecks
3. Normalization opportunities
4. Missing indexes
5. Unnecessary complexity
6. Security considerations
7. Scalability concerns

Provide specific recommendations for improvements.`;
  }

  private createMigrationPlanPrompt(existingSchema: string, newEntities: any[], newRelationships: any[]): string {
    return `Create a migration plan to evolve the existing schema:

CURRENT SCHEMA:
${existingSchema}

NEW ENTITIES:
${newEntities.map(e => `- ${e.name}: ${JSON.stringify(e.fields)}`).join('\n')}

NEW RELATIONSHIPS:
${newRelationships.map(r => `- ${r.from} ${r.type} ${r.to}`).join('\n')}

Create a step-by-step migration plan that:
1. Preserves existing data
2. Minimizes downtime
3. Handles dependencies correctly
4. Includes rollback procedures
5. Estimates execution time
6. Identifies potential risks

Return the migration plan with ordered steps and SQL commands.`;
  }

  private createOptimizationPrompt(existingSchema: string, constraints: any): string {
    return `Optimize the following database schema for performance:

SCHEMA:
${existingSchema}

PERFORMANCE REQUIREMENTS:
- Target performance level: ${constraints.performance || 'medium'}
- Scalability level: ${constraints.scalability || 'medium'}
- Database type: ${constraints.database || 'postgresql'}

Provide optimization recommendations including:
1. Missing indexes that would improve query performance
2. Schema modifications for better performance
3. Denormalization opportunities
4. Partitioning strategies if applicable
5. Query optimization suggestions

Focus on practical improvements with measurable impact.`;
  }

  private createValidationPrompt(existingSchema: string): string {
    return `Validate the following database schema for integrity and best practices:

SCHEMA:
${existingSchema}

Check for:
1. Missing primary keys
2. Orphaned foreign key references
3. Inconsistent naming conventions
4. Missing constraints
5. Data type inconsistencies
6. Potential circular references
7. Security vulnerabilities
8. Performance anti-patterns

Return a comprehensive validation report with errors, warnings, and suggestions.`;
  }

  /**
   * Parse AI responses for different operations
   */
  private parseSchemaResponse(response: string): any {
    // This would parse the AI response into a structured schema design
    // For now, return a mock structure
    return {
      entities: [],
      relationships: [],
      indexes: [],
      constraints: [],
    };
  }

  private parseAnalysisResponse(response: string): any {
    return {
      issues: [],
      recommendations: [],
      metrics: {},
    };
  }

  private parseMigrationResponse(response: string): any {
    return {
      steps: [],
      estimatedTime: 0,
      risks: [],
    };
  }

  private parseOptimizationResponse(response: string): any {
    return {
      indexes: [],
      modifications: [],
      estimatedImprovement: '',
    };
  }

  private parseValidationResponse(response: string): any {
    return {
      valid: true,
      errors: [],
      warnings: [],
      suggestions: [],
    };
  }

  /**
   * Generate schema artifacts
   */
  private generatePrismaSchema(schemaDesign: any): string {
    return `generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Generated schema based on design
// This would contain the actual Prisma schema
`;
  }

  private generateMigrationSql(schemaDesign: any, database: string): string {
    return `-- Database migration generated by SchemaAgent
-- Target database: ${database}

-- This would contain the actual SQL migration
`;
  }

  private generateSchemaDocumentation(schemaDesign: any): string {
    return `# Database Schema Design

This document describes the database schema design generated by the Schema Agent.

## Entities

## Relationships

## Indexes

## Design Decisions
`;
  }

  private generateAnalysisReport(analysis: any): string {
    return `# Schema Analysis Report

Generated: ${new Date().toISOString()}

## Issues Found

## Recommendations

## Metrics
`;
  }

  private generateMigrationDocumentation(migrationPlan: any): string {
    return `# Migration Plan

## Steps

## Estimated Time

## Risks and Mitigation
`;
  }

  private generateOptimizationReport(optimizations: any): string {
    return `# Schema Optimization Report

## Recommended Indexes

## Performance Improvements

## Estimated Impact
`;
  }

  private generateValidationReport(validation: any): string {
    return `# Schema Validation Report

Valid: ${validation.valid}

## Errors

## Warnings

## Suggestions
`;
  }
}