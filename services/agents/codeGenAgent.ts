/**
 * Code Generation Agent
 *
 * Specializes in generating code artifacts including:
 * - React components and pages
 * - API routes and endpoints
 * - Utility functions and libraries
 * - Configuration files
 * - Database migrations
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
const CodeGenInputSchema = z.object({
  type: z.enum(['component', 'api', 'utility', 'migration', 'config', 'test']),
  specification: z.string().min(10),
  requirements: z.array(z.string()).optional(),
  framework: z.string().optional(),
  language: z.enum(['typescript', 'javascript', 'python', 'sql']).optional(),
  style: z.enum(['functional', 'class', 'hook']).optional(),
  dependencies: z.array(z.string()).optional(),
  outputPath: z.string().optional(),
});

export class CodeGenAgent extends BaseAgent {
  public readonly name = 'CodeGenAgent';
  public readonly version = '1.0.0';
  public readonly capabilities = [
    'react-component-generation',
    'api-endpoint-creation',
    'database-migration-generation',
    'utility-function-creation',
    'test-file-generation',
    'configuration-file-creation',
  ];

  constructor() {
    super(DEFAULT_AGENT_CONFIGS.CodeGenAgent);
  }

  /**
   * Validate inputs specific to code generation
   */
  async validateInputs(inputs: Record<string, any>): Promise<{ valid: boolean; errors: string[] }> {
    try {
      CodeGenInputSchema.parse(inputs);
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
   * Execute code generation
   */
  protected async executeInternal(context: AgentContext): Promise<Omit<AgentResult, 'logs' | 'metrics'>> {
    this.validateContext(context);

    const { type, specification, requirements, framework, language, style, dependencies, outputPath } = context.inputs;

    this.log('info', `Generating ${type} code`, { specification: specification.substring(0, 100) });

    // Create snapshot before generating code
    const snapshotId = await this.createSnapshot(context, `Before generating ${type}`);

    try {
      // Generate code based on type
      const artifacts = await this.generateCode(type, {
        specification,
        requirements,
        framework,
        language,
        style,
        dependencies,
        outputPath,
      });

      // Validate generated code
      const validationResults = await this.validateGeneratedCode(artifacts);

      this.log('info', `Generated ${artifacts.length} artifacts`, {
        types: artifacts.map(a => a.type),
        totalSize: artifacts.reduce((size, a) => size + a.content.length, 0),
      });

      return {
        success: true,
        outputs: {
          artifacts: artifacts.map(a => ({
            id: a.id,
            type: a.type,
            name: a.name,
            path: a.path,
            size: a.content.length,
          })),
          validation: validationResults,
          framework,
          language,
        },
        artifacts,
        snapshotId,
      };

    } catch (error) {
      this.log('error', 'Code generation failed', { error: error instanceof Error ? error.message : 'Unknown error' });
      throw error;
    }
  }

  /**
   * Generate code artifacts based on type and specification
   */
  private async generateCode(type: string, params: any): Promise<Artifact[]> {
    const artifacts: Artifact[] = [];

    switch (type) {
      case 'component':
        artifacts.push(...await this.generateReactComponent(params));
        break;

      case 'api':
        artifacts.push(...await this.generateApiEndpoint(params));
        break;

      case 'migration':
        artifacts.push(...await this.generateDatabaseMigration(params));
        break;

      case 'utility':
        artifacts.push(...await this.generateUtilityFunction(params));
        break;

      case 'test':
        artifacts.push(...await this.generateTestFile(params));
        break;

      case 'config':
        artifacts.push(...await this.generateConfigFile(params));
        break;

      default:
        throw new Error(`Unsupported code generation type: ${type}`);
    }

    return artifacts;
  }

  /**
   * Generate React component
   */
  private async generateReactComponent(params: any): Promise<Artifact[]> {
    const { specification, framework = 'react', style = 'functional', dependencies = [] } = params;

    this.log('debug', 'Generating React component', { style, dependencies });

    // Create component prompt
    const prompt = this.createComponentPrompt(specification, style, dependencies);

    // Call AI model
    const result = await this.callModel(prompt, {
      maxTokens: 4096,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    // Parse generated code
    const componentCode = this.extractCodeFromResponse(result.response, 'tsx');
    const componentName = this.extractComponentName(componentCode);

    const artifacts: Artifact[] = [
      {
        id: `component-${Date.now()}`,
        type: 'code',
        name: `${componentName}.tsx`,
        content: componentCode,
        path: params.outputPath || `components/${componentName}.tsx`,
        metadata: {
          language: 'typescript',
          framework: 'react',
          style,
          dependencies,
        },
      },
    ];

    // Generate accompanying test file
    if (style === 'functional') {
      const testCode = this.generateComponentTest(componentName, componentCode);
      artifacts.push({
        id: `test-${Date.now()}`,
        type: 'test',
        name: `${componentName}.test.tsx`,
        content: testCode,
        path: params.outputPath || `components/__tests__/${componentName}.test.tsx`,
        metadata: {
          language: 'typescript',
          framework: 'react',
          testType: 'component',
        },
      });
    }

    return artifacts;
  }

  /**
   * Generate API endpoint
   */
  private async generateApiEndpoint(params: any): Promise<Artifact[]> {
    const { specification, framework = 'nextjs', language = 'typescript' } = params;

    this.log('debug', 'Generating API endpoint', { framework, language });

    const prompt = this.createApiPrompt(specification, framework);
    const result = await this.callModel(prompt, {
      maxTokens: 3072,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const apiCode = this.extractCodeFromResponse(result.response, 'ts');
    const endpointName = this.extractEndpointName(apiCode);

    return [
      {
        id: `api-${Date.now()}`,
        type: 'code',
        name: `${endpointName}.ts`,
        content: apiCode,
        path: params.outputPath || `app/api/v1/${endpointName}/route.ts`,
        metadata: {
          language,
          framework,
          type: 'api-endpoint',
        },
      },
    ];
  }

  /**
   * Generate database migration
   */
  private async generateDatabaseMigration(params: any): Promise<Artifact[]> {
    const { specification, language = 'sql' } = params;

    this.log('debug', 'Generating database migration', { language });

    const prompt = this.createMigrationPrompt(specification);
    const result = await this.callModel(prompt, {
      maxTokens: 2048,
      temperature: 0.0, // Very deterministic for migrations
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const migrationCode = this.extractCodeFromResponse(result.response, 'sql');
    const migrationName = `migration_${Date.now()}`;

    return [
      {
        id: `migration-${Date.now()}`,
        type: 'migration',
        name: `${migrationName}.sql`,
        content: migrationCode,
        path: `prisma/migrations/${migrationName}/${migrationName}.sql`,
        metadata: {
          language: 'sql',
          type: 'database-migration',
          timestamp: new Date().toISOString(),
        },
      },
    ];
  }

  /**
   * Generate utility function
   */
  private async generateUtilityFunction(params: any): Promise<Artifact[]> {
    const { specification, language = 'typescript' } = params;

    this.log('debug', 'Generating utility function', { language });

    const prompt = this.createUtilityPrompt(specification, language);
    const result = await this.callModel(prompt, {
      maxTokens: 2048,
      temperature: 0.1,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const utilityCode = this.extractCodeFromResponse(result.response, language === 'typescript' ? 'ts' : 'js');
    const functionName = this.extractFunctionName(utilityCode);

    return [
      {
        id: `utility-${Date.now()}`,
        type: 'code',
        name: `${functionName}.${language === 'typescript' ? 'ts' : 'js'}`,
        content: utilityCode,
        path: params.outputPath || `lib/utils/${functionName}.${language === 'typescript' ? 'ts' : 'js'}`,
        metadata: {
          language,
          type: 'utility-function',
        },
      },
    ];
  }

  /**
   * Generate test file
   */
  private async generateTestFile(params: any): Promise<Artifact[]> {
    const { specification, framework = 'vitest', language = 'typescript' } = params;

    this.log('debug', 'Generating test file', { framework, language });

    const prompt = this.createTestPrompt(specification, framework);
    const result = await this.callModel(prompt, {
      maxTokens: 3072,
      temperature: 0.2,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const testCode = this.extractCodeFromResponse(result.response, 'ts');
    const testName = this.extractTestName(testCode);

    return [
      {
        id: `test-${Date.now()}`,
        type: 'test',
        name: `${testName}.test.${language === 'typescript' ? 'ts' : 'js'}`,
        content: testCode,
        path: params.outputPath || `tests/unit/${testName}.test.${language === 'typescript' ? 'ts' : 'js'}`,
        metadata: {
          language,
          framework,
          type: 'unit-test',
        },
      },
    ];
  }

  /**
   * Generate configuration file
   */
  private async generateConfigFile(params: any): Promise<Artifact[]> {
    const { specification, type = 'json' } = params;

    this.log('debug', 'Generating configuration file', { type });

    const prompt = this.createConfigPrompt(specification, type);
    const result = await this.callModel(prompt, {
      maxTokens: 1024,
      temperature: 0.0,
    });

    this.metrics.tokensUsed = (this.metrics.tokensUsed || 0) + result.tokensUsed;
    this.metrics.cost = (this.metrics.cost || 0) + result.cost;

    const configContent = this.extractCodeFromResponse(result.response, type);
    const configName = this.extractConfigName(specification);

    return [
      {
        id: `config-${Date.now()}`,
        type: 'config',
        name: `${configName}.${type}`,
        content: configContent,
        path: params.outputPath || `${configName}.${type}`,
        metadata: {
          type: 'configuration',
          format: type,
        },
      },
    ];
  }

  /**
   * Create prompts for different code generation types
   */
  private createComponentPrompt(specification: string, style: string, dependencies: string[]): string {
    return `Generate a ${style} React component in TypeScript based on this specification:

${specification}

Requirements:
- Use TypeScript with proper type definitions
- Follow React best practices and hooks where appropriate
- Include proper error handling
- Add JSDoc comments for props and main functions
- Use Tailwind CSS for styling
- Dependencies available: ${dependencies.join(', ')}

Return only the component code without additional explanation.`;
  }

  private createApiPrompt(specification: string, framework: string): string {
    return `Generate a ${framework} API endpoint in TypeScript based on this specification:

${specification}

Requirements:
- Use proper TypeScript types
- Include input validation
- Add proper error handling with appropriate HTTP status codes
- Include authentication checks if needed
- Use Prisma for database operations if applicable
- Follow RESTful conventions

Return only the API route code without additional explanation.`;
  }

  private createMigrationPrompt(specification: string): string {
    return `Generate a database migration SQL script based on this specification:

${specification}

Requirements:
- Use proper SQL syntax
- Include rollback statements
- Add constraints and indexes where appropriate
- Follow database best practices
- Include comments explaining the changes

Return only the SQL migration code without additional explanation.`;
  }

  private createUtilityPrompt(specification: string, language: string): string {
    return `Generate a utility function in ${language} based on this specification:

${specification}

Requirements:
- Use proper ${language} syntax and types
- Include comprehensive error handling
- Add JSDoc comments
- Write pure functions where possible
- Include input validation
- Follow functional programming principles

Return only the function code without additional explanation.`;
  }

  private createTestPrompt(specification: string, framework: string): string {
    return `Generate comprehensive unit tests using ${framework} based on this specification:

${specification}

Requirements:
- Test all major functionality and edge cases
- Include both positive and negative test cases
- Mock external dependencies
- Use descriptive test names
- Include setup and teardown where needed
- Follow testing best practices

Return only the test code without additional explanation.`;
  }

  private createConfigPrompt(specification: string, type: string): string {
    return `Generate a ${type} configuration file based on this specification:

${specification}

Requirements:
- Use proper ${type} syntax
- Include all necessary configuration options
- Add comments explaining each section
- Follow configuration best practices
- Include environment-specific settings where applicable

Return only the configuration content without additional explanation.`;
  }

  /**
   * Utility methods for extracting information from generated code
   */
  private extractCodeFromResponse(response: string, language: string): string {
    // Extract code blocks from AI response
    const codeBlockRegex = new RegExp(`\`\`\`(?:${language})?\\n([\\s\\S]*?)\\n\`\`\``, 'i');
    const match = response.match(codeBlockRegex);
    return match ? match[1].trim() : response.trim();
  }

  private extractComponentName(code: string): string {
    const match = code.match(/(?:export\s+default\s+)?(?:function\s+|const\s+)(\w+)/);
    return match ? match[1] : 'Component';
  }

  private extractEndpointName(code: string): string {
    const match = code.match(/\/\/ API endpoint: (\w+)/) || code.match(/export\s+async\s+function\s+(\w+)/);
    return match ? match[1].toLowerCase() : 'endpoint';
  }

  private extractFunctionName(code: string): string {
    const match = code.match(/(?:export\s+)?(?:function\s+|const\s+)(\w+)/) || code.match(/function\s+(\w+)/);
    return match ? match[1] : 'utility';
  }

  private extractTestName(code: string): string {
    const match = code.match(/describe\(['"`]([^'"`]+)['"`]/) || code.match(/\/\/ Test for: (\w+)/);
    return match ? match[1].replace(/\s+/g, '_').toLowerCase() : 'test';
  }

  private extractConfigName(specification: string): string {
    const match = specification.match(/(\w+)\.(?:json|yaml|yml|js|ts)/) || specification.match(/(\w+)\s+config/i);
    return match ? match[1].toLowerCase() : 'config';
  }

  /**
   * Generate component test
   */
  private generateComponentTest(componentName: string, componentCode: string): string {
    return `import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import ${componentName} from './${componentName}';

describe('${componentName}', () => {
  it('should render without crashing', () => {
    render(<${componentName} />);
    expect(screen.getByRole('main')).toBeInTheDocument();
  });

  it('should handle props correctly', () => {
    // Add specific prop tests based on component analysis
    // This would be enhanced by analyzing the component code
  });
});`;
  }

  /**
   * Validate generated code
   */
  private async validateGeneratedCode(artifacts: Artifact[]): Promise<any> {
    const results = [];

    for (const artifact of artifacts) {
      const validation = {
        id: artifact.id,
        name: artifact.name,
        valid: true,
        issues: [] as string[],
      };

      // Basic syntax validation
      if (artifact.metadata?.language === 'typescript' || artifact.metadata?.language === 'javascript') {
        try {
          // This would integrate with a TypeScript compiler or linter
          // For now, basic checks
          if (!artifact.content.trim()) {
            validation.valid = false;
            validation.issues.push('Empty code file');
          }
        } catch (error) {
          validation.valid = false;
          validation.issues.push('Syntax error detected');
        }
      }

      results.push(validation);
    }

    return results;
  }
}