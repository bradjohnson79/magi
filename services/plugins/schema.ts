/**
 * Plugin Manifest Schema and Validation
 *
 * Defines the structure and validation for plugin manifests,
 * including inputs, outputs, configuration, and capabilities.
 */

import { z } from 'zod';

// Plugin capability definitions
export const PluginCapabilitySchema = z.enum([
  'code_generation',
  'code_analysis',
  'testing',
  'deployment',
  'documentation',
  'linting',
  'formatting',
  'security_scan',
  'performance_analysis',
  'refactoring',
  'integration',
  'monitoring',
  'custom',
]);

export type PluginCapability = z.infer<typeof PluginCapabilitySchema>;

// Input/Output parameter schema
export const PluginParameterSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'file']),
  description: z.string().max(500),
  required: z.boolean().default(false),
  default: z.any().optional(),
  validation: z.object({
    min: z.number().optional(),
    max: z.number().optional(),
    pattern: z.string().optional(),
    enum: z.array(z.string()).optional(),
  }).optional(),
});

export type PluginParameter = z.infer<typeof PluginParameterSchema>;

// Plugin configuration schema
export const PluginConfigSchema = z.object({
  timeout: z.number().min(1000).max(300000).default(30000), // 1s to 5min
  retries: z.number().min(0).max(5).default(1),
  priority: z.enum(['low', 'medium', 'high']).default('medium'),
  resources: z.object({
    maxMemory: z.number().min(128).max(8192).default(512), // MB
    maxCpu: z.number().min(0.1).max(4).default(1), // CPU cores
  }).default({}),
  environment: z.record(z.string()).default({}),
});

export type PluginConfig = z.infer<typeof PluginConfigSchema>;

// Plugin agent configuration
export const PluginAgentSchema = z.object({
  type: z.enum(['openai', 'anthropic', 'local', 'webhook', 'docker']),
  endpoint: z.string().url().optional(),
  model: z.string().optional(),
  temperature: z.number().min(0).max(2).default(0.7),
  maxTokens: z.number().min(1).max(100000).default(4000),
  systemPrompt: z.string().max(10000).optional(),
  tools: z.array(z.string()).default([]),
});

export type PluginAgent = z.infer<typeof PluginAgentSchema>;

// Plugin security and permissions
export const PluginPermissionsSchema = z.object({
  fileSystem: z.object({
    read: z.array(z.string()).default([]),
    write: z.array(z.string()).default([]),
    execute: z.array(z.string()).default([]),
  }).default({}),
  network: z.object({
    outbound: z.array(z.string()).default([]),
    inbound: z.boolean().default(false),
  }).default({}),
  apis: z.array(z.string()).default([]),
  databases: z.array(z.string()).default([]),
  secrets: z.array(z.string()).default([]),
});

export type PluginPermissions = z.infer<typeof PluginPermissionsSchema>;

// Main plugin manifest schema
export const PluginManifestSchema = z.object({
  // Basic metadata
  name: z.string().min(1).max(100).regex(/^[a-z0-9-]+$/),
  displayName: z.string().min(1).max(200),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(1000),
  author: z.string().max(200),
  license: z.string().max(50).default('MIT'),
  homepage: z.string().url().optional(),
  repository: z.string().url().optional(),

  // Plugin capabilities
  capabilities: z.array(PluginCapabilitySchema).min(1),
  category: z.string().max(50),
  tags: z.array(z.string().max(30)).max(10).default([]),

  // Plugin interface
  inputs: z.array(PluginParameterSchema).default([]),
  outputs: z.array(PluginParameterSchema).default([]),
  config: PluginConfigSchema.default({}),

  // Agent configuration
  agent: PluginAgentSchema,

  // Security and permissions
  permissions: PluginPermissionsSchema.default({}),

  // Dependencies and compatibility
  dependencies: z.object({
    node: z.string().optional(),
    npm: z.record(z.string()).default({}),
    system: z.array(z.string()).default([]),
  }).default({}),

  // Plugin lifecycle hooks
  hooks: z.object({
    install: z.string().optional(),
    uninstall: z.string().optional(),
    enable: z.string().optional(),
    disable: z.string().optional(),
    update: z.string().optional(),
  }).default({}),

  // Plugin metadata
  metadata: z.object({
    icon: z.string().optional(),
    screenshots: z.array(z.string().url()).default([]),
    documentation: z.string().url().optional(),
    examples: z.array(z.object({
      name: z.string(),
      description: z.string(),
      input: z.record(z.any()),
      expected_output: z.record(z.any()),
    })).default([]),
  }).default({}),
});

export type PluginManifest = z.infer<typeof PluginManifestSchema>;

// Plugin execution context
export const PluginExecutionContextSchema = z.object({
  pluginId: z.string(),
  userId: z.string(),
  projectId: z.string().optional(),
  workspaceId: z.string().optional(),
  sessionId: z.string(),
  traceId: z.string().optional(),
  input: z.record(z.any()),
  config: z.record(z.any()).default({}),
  metadata: z.record(z.any()).default({}),
});

export type PluginExecutionContext = z.infer<typeof PluginExecutionContextSchema>;

// Plugin execution result
export const PluginExecutionResultSchema = z.object({
  success: z.boolean(),
  output: z.record(z.any()).optional(),
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.any()).optional(),
  }).optional(),
  metadata: z.object({
    executionTime: z.number(),
    memoryUsed: z.number().optional(),
    tokensUsed: z.number().optional(),
    cost: z.number().optional(),
  }),
  logs: z.array(z.object({
    level: z.enum(['debug', 'info', 'warn', 'error']),
    message: z.string(),
    timestamp: z.string(),
    data: z.record(z.any()).optional(),
  })).default([]),
});

export type PluginExecutionResult = z.infer<typeof PluginExecutionResultSchema>;

// Plugin registry entry
export const PluginRegistryEntrySchema = z.object({
  id: z.string(),
  manifest: PluginManifestSchema,
  status: z.enum(['installed', 'enabled', 'disabled', 'error', 'updating']),
  installation: z.object({
    installedAt: z.string(),
    installedBy: z.string(),
    version: z.string(),
    source: z.enum(['marketplace', 'local', 'git', 'npm']),
    sourceUrl: z.string().optional(),
  }),
  usage: z.object({
    executions: z.number().default(0),
    lastUsed: z.string().optional(),
    averageExecutionTime: z.number().default(0),
    errorRate: z.number().default(0),
  }).default({}),
  health: z.object({
    status: z.enum(['healthy', 'warning', 'error', 'unknown']).default('unknown'),
    lastChecked: z.string().optional(),
    issues: z.array(z.string()).default([]),
  }).default({}),
});

export type PluginRegistryEntry = z.infer<typeof PluginRegistryEntrySchema>;

/**
 * Validation functions
 */
export class PluginValidator {
  /**
   * Validate a plugin manifest
   */
  static validateManifest(manifest: unknown): PluginManifest {
    return PluginManifestSchema.parse(manifest);
  }

  /**
   * Validate plugin execution context
   */
  static validateExecutionContext(context: unknown): PluginExecutionContext {
    return PluginExecutionContextSchema.parse(context);
  }

  /**
   * Validate plugin execution result
   */
  static validateExecutionResult(result: unknown): PluginExecutionResult {
    return PluginExecutionResultSchema.parse(result);
  }

  /**
   * Validate plugin inputs against manifest
   */
  static validateInputs(inputs: Record<string, any>, manifest: PluginManifest): void {
    const requiredInputs = manifest.inputs.filter(input => input.required);

    // Check required inputs
    for (const input of requiredInputs) {
      if (!(input.name in inputs)) {
        throw new Error(`Required input '${input.name}' is missing`);
      }
    }

    // Validate input types and constraints
    for (const input of manifest.inputs) {
      if (input.name in inputs) {
        this.validateParameterValue(inputs[input.name], input);
      }
    }
  }

  /**
   * Validate a parameter value against its schema
   */
  private static validateParameterValue(value: any, param: PluginParameter): void {
    // Type validation
    switch (param.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Parameter '${param.name}' must be a string`);
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`Parameter '${param.name}' must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Parameter '${param.name}' must be a boolean`);
        }
        break;
      case 'object':
        if (typeof value !== 'object' || Array.isArray(value)) {
          throw new Error(`Parameter '${param.name}' must be an object`);
        }
        break;
      case 'array':
        if (!Array.isArray(value)) {
          throw new Error(`Parameter '${param.name}' must be an array`);
        }
        break;
    }

    // Constraint validation
    if (param.validation) {
      if (param.validation.min !== undefined && value < param.validation.min) {
        throw new Error(`Parameter '${param.name}' must be >= ${param.validation.min}`);
      }
      if (param.validation.max !== undefined && value > param.validation.max) {
        throw new Error(`Parameter '${param.name}' must be <= ${param.validation.max}`);
      }
      if (param.validation.pattern && !new RegExp(param.validation.pattern).test(value)) {
        throw new Error(`Parameter '${param.name}' does not match required pattern`);
      }
      if (param.validation.enum && !param.validation.enum.includes(value)) {
        throw new Error(`Parameter '${param.name}' must be one of: ${param.validation.enum.join(', ')}`);
      }
    }
  }

  /**
   * Check if plugin has required permissions for operation
   */
  static checkPermissions(
    manifest: PluginManifest,
    operation: {
      type: 'file' | 'network' | 'api' | 'database' | 'secret';
      action: 'read' | 'write' | 'execute' | 'access';
      resource: string;
    }
  ): boolean {
    const permissions = manifest.permissions;

    switch (operation.type) {
      case 'file':
        const filePerms = permissions.fileSystem;
        switch (operation.action) {
          case 'read':
            return filePerms.read.some(pattern => this.matchesPattern(operation.resource, pattern));
          case 'write':
            return filePerms.write.some(pattern => this.matchesPattern(operation.resource, pattern));
          case 'execute':
            return filePerms.execute.some(pattern => this.matchesPattern(operation.resource, pattern));
        }
        break;
      case 'network':
        if (operation.action === 'access') {
          return permissions.network.outbound.some(pattern =>
            this.matchesPattern(operation.resource, pattern)
          );
        }
        break;
      case 'api':
        return permissions.apis.includes(operation.resource);
      case 'database':
        return permissions.databases.includes(operation.resource);
      case 'secret':
        return permissions.secrets.includes(operation.resource);
    }

    return false;
  }

  /**
   * Check if a resource matches a permission pattern
   */
  private static matchesPattern(resource: string, pattern: string): boolean {
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*/g, '.*')
      .replace(/\?/g, '.');

    return new RegExp(`^${regexPattern}$`).test(resource);
  }
}

/**
 * Default plugin configurations for common types
 */
export const DefaultPluginConfigs = {
  codeGeneration: {
    timeout: 60000,
    retries: 2,
    priority: 'high',
    resources: {
      maxMemory: 1024,
      maxCpu: 2,
    },
  } as PluginConfig,

  codeAnalysis: {
    timeout: 30000,
    retries: 1,
    priority: 'medium',
    resources: {
      maxMemory: 512,
      maxCpu: 1,
    },
  } as PluginConfig,

  testing: {
    timeout: 120000,
    retries: 1,
    priority: 'medium',
    resources: {
      maxMemory: 1024,
      maxCpu: 2,
    },
  } as PluginConfig,

  deployment: {
    timeout: 300000,
    retries: 3,
    priority: 'high',
    resources: {
      maxMemory: 2048,
      maxCpu: 2,
    },
  } as PluginConfig,
};

/**
 * Plugin manifest examples for common plugin types
 */
export const ExampleManifests = {
  eslintPlugin: {
    name: 'eslint-analyzer',
    displayName: 'ESLint Code Analyzer',
    version: '1.0.0',
    description: 'Analyzes JavaScript/TypeScript code using ESLint',
    author: 'MAGI Team',
    capabilities: ['code_analysis', 'linting'],
    category: 'code-quality',
    tags: ['javascript', 'typescript', 'linting'],
    inputs: [
      {
        name: 'files',
        type: 'array',
        description: 'Files to analyze',
        required: true,
      },
      {
        name: 'config',
        type: 'object',
        description: 'ESLint configuration',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'issues',
        type: 'array',
        description: 'Found linting issues',
        required: true,
      },
      {
        name: 'summary',
        type: 'object',
        description: 'Analysis summary',
        required: true,
      },
    ],
    agent: {
      type: 'local',
      tools: ['eslint'],
    },
    permissions: {
      fileSystem: {
        read: ['**/*.js', '**/*.ts', '**/*.json'],
      },
    },
  } as PluginManifest,

  reactComponentGenerator: {
    name: 'react-component-generator',
    displayName: 'React Component Generator',
    version: '1.0.0',
    description: 'Generates React components from specifications',
    author: 'MAGI Team',
    capabilities: ['code_generation'],
    category: 'generation',
    tags: ['react', 'components', 'typescript'],
    inputs: [
      {
        name: 'componentName',
        type: 'string',
        description: 'Name of the component to generate',
        required: true,
      },
      {
        name: 'props',
        type: 'object',
        description: 'Component props interface',
        required: false,
      },
      {
        name: 'features',
        type: 'array',
        description: 'Component features to include',
        required: false,
      },
    ],
    outputs: [
      {
        name: 'componentCode',
        type: 'string',
        description: 'Generated component code',
        required: true,
      },
      {
        name: 'testCode',
        type: 'string',
        description: 'Generated test code',
        required: false,
      },
      {
        name: 'storyCode',
        type: 'string',
        description: 'Generated Storybook story',
        required: false,
      },
    ],
    agent: {
      type: 'openai',
      model: 'gpt-4',
      temperature: 0.3,
      maxTokens: 4000,
      systemPrompt: 'You are an expert React developer...',
    },
    permissions: {
      fileSystem: {
        write: ['src/components/**/*'],
      },
    },
  } as PluginManifest,
};