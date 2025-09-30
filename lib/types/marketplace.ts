import { z } from 'zod';

// Base types
export type MarketplaceItemType = 'plugin' | 'template';
export type MarketplaceItemStatus = 'draft' | 'pending_review' | 'approved' | 'rejected' | 'deprecated';
export type PluginRuntime = 'nodejs' | 'python' | 'docker' | 'wasm';
export type PermissionRiskLevel = 'low' | 'medium' | 'high' | 'critical';
export type ExecutionStatus = 'pending' | 'running' | 'success' | 'failed' | 'timeout';

// Plugin manifest schema
export const PluginManifestSchema = z.object({
  // Basic info
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500),
  author: z.string().min(1).max(100),

  // Runtime configuration
  runtime: z.enum(['nodejs', 'python', 'docker', 'wasm']),
  entryPoint: z.string().min(1),

  // Plugin capabilities
  inputs: z.record(z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'file']),
    description: z.string(),
    required: z.boolean().default(false),
    default: z.any().optional(),
    validation: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      pattern: z.string().optional(),
      enum: z.array(z.any()).optional()
    }).optional()
  })),

  outputs: z.record(z.object({
    type: z.enum(['string', 'number', 'boolean', 'array', 'object', 'file']),
    description: z.string()
  })),

  // Permissions and security
  permissions: z.array(z.string()),
  sandboxed: z.boolean().default(true),

  // Dependencies
  dependencies: z.record(z.string()).default({}),

  // Configuration schema
  config: z.record(z.object({
    type: z.enum(['string', 'number', 'boolean', 'select']),
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
    default: z.any().optional(),
    options: z.array(z.object({
      label: z.string(),
      value: z.any()
    })).optional()
  })).default({}),

  // Metadata
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).default([]),
  documentation: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().default('MIT'),

  // Compatibility
  minMagiVersion: z.string().optional(),
  maxMagiVersion: z.string().optional()
});

// Template manifest schema
export const TemplateManifestSchema = z.object({
  // Basic info
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  description: z.string().max(500),
  author: z.string().min(1).max(100),

  // Template configuration
  templateType: z.enum(['project', 'document', 'workflow', 'component']),

  // Template variables
  variables: z.record(z.object({
    type: z.enum(['string', 'number', 'boolean', 'select']),
    label: z.string(),
    description: z.string().optional(),
    required: z.boolean().default(false),
    default: z.any().optional(),
    options: z.array(z.object({
      label: z.string(),
      value: z.any()
    })).optional()
  })).default({}),

  // Template structure
  files: z.array(z.object({
    path: z.string(),
    content: z.string().optional(),
    template: z.boolean().default(false),
    binary: z.boolean().default(false)
  })),

  // Metadata
  category: z.string().optional(),
  tags: z.array(z.string()).default([]),
  icon: z.string().url().optional(),
  screenshots: z.array(z.string().url()).default([]),
  documentation: z.string().url().optional(),
  repository: z.string().url().optional(),
  license: z.string().default('MIT'),

  // Compatibility
  minMagiVersion: z.string().optional(),
  maxMagiVersion: z.string().optional()
});

// Union manifest schema
export const ManifestSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('plugin') }).merge(PluginManifestSchema),
  z.object({ type: z.literal('template') }).merge(TemplateManifestSchema)
]);

// TypeScript types
export type PluginManifest = z.infer<typeof PluginManifestSchema>;
export type TemplateManifest = z.infer<typeof TemplateManifestSchema>;
export type Manifest = z.infer<typeof ManifestSchema>;

// Marketplace item interface
export interface MarketplaceItem {
  id: string;
  type: MarketplaceItemType;
  slug: string;
  name: string;
  description?: string;
  authorId?: string;
  authorName: string;
  authorEmail?: string;

  // Versioning
  version: string;
  versionHistory: string[];

  // Manifest
  manifest: Manifest;

  // Metadata
  category?: string;
  tags: string[];
  iconUrl?: string;
  bannerUrl?: string;
  screenshots: string[];
  documentationUrl?: string;
  repositoryUrl?: string;
  license: string;

  // Stats and verification
  verified: boolean;
  verifiedAt?: Date;
  verifiedBy?: string;
  featured: boolean;
  installs: number;
  ratingAverage: number;
  ratingCount: number;

  // Status
  status: MarketplaceItemStatus;
  rejectionReason?: string;

  // Plugin specific
  runtime?: PluginRuntime;
  entryPoint?: string;
  permissions: string[];
  dependencies: Record<string, string>;
  configSchema?: Record<string, any>;

  // Template specific
  templateType?: string;
  templateData?: any;

  // Pricing
  price: number;
  currency: string;

  // Timestamps
  createdAt: Date;
  updatedAt: Date;
  publishedAt?: Date;
}

// Installation interface
export interface MarketplaceInstallation {
  id: string;
  itemId: string;
  userId: string;
  projectId?: string;

  // Installation details
  installedVersion: string;
  isActive: boolean;
  autoUpdate: boolean;

  // Configuration
  config: Record<string, any>;

  // Usage stats
  lastUsedAt?: Date;
  usageCount: number;

  // Timestamps
  installedAt: Date;
  updatedAt: Date;
}

// Plugin execution interface
export interface PluginExecution {
  id: string;
  installationId: string;
  projectId?: string;

  // Execution details
  inputData?: any;
  outputData?: any;
  errorMessage?: string;

  // Performance metrics
  executionTimeMs?: number;
  memoryUsedMb?: number;

  // Status
  status: ExecutionStatus;

  // Timestamps
  startedAt: Date;
  completedAt?: Date;
}

// Review interface
export interface MarketplaceReview {
  id: string;
  itemId: string;
  userId: string;

  rating: number; // 1-5
  title?: string;
  content?: string;

  helpfulCount: number;

  createdAt: Date;
  updatedAt: Date;
}

// Permission interface
export interface PluginPermission {
  id: string;
  name: string;
  description?: string;
  riskLevel: PermissionRiskLevel;
  createdAt: Date;
}

// Plugin context for execution
export interface PluginContext {
  project?: {
    id: string;
    name: string;
    path: string;
  };
  user: {
    id: string;
    name: string;
    email: string;
  };
  config: Record<string, any>;
  permissions: string[];
  workspace: {
    read: (path: string) => Promise<string>;
    write: (path: string, content: string) => Promise<void>;
    delete: (path: string) => Promise<void>;
    list: (path: string) => Promise<string[]>;
  };
  ai: {
    generate: (prompt: string, options?: any) => Promise<string>;
    analyze: (content: string, options?: any) => Promise<any>;
  };
  http: {
    get: (url: string, options?: any) => Promise<any>;
    post: (url: string, data: any, options?: any) => Promise<any>;
  };
  logger: {
    info: (message: string, meta?: any) => void;
    warn: (message: string, meta?: any) => void;
    error: (message: string, meta?: any) => void;
  };
}

// Plugin execution result
export interface PluginExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
  metrics?: {
    executionTime: number;
    memoryUsed: number;
  };
}

// Marketplace search filters
export interface MarketplaceSearchFilters {
  query?: string;
  type?: MarketplaceItemType;
  category?: string;
  tags?: string[];
  verified?: boolean;
  featured?: boolean;
  runtime?: PluginRuntime;
  minRating?: number;
  priceMin?: number;
  priceMax?: number;
  sortBy?: 'relevance' | 'installs' | 'rating' | 'recent' | 'name';
  sortOrder?: 'asc' | 'desc';
  limit?: number;
  offset?: number;
}

// Marketplace search result
export interface MarketplaceSearchResult {
  items: MarketplaceItem[];
  total: number;
  hasMore: boolean;
  facets?: {
    categories: Array<{ name: string; count: number }>;
    tags: Array<{ name: string; count: number }>;
    runtimes: Array<{ name: string; count: number }>;
  };
}

// Plugin installation request
export interface InstallPluginRequest {
  itemId: string;
  projectId?: string;
  config?: Record<string, any>;
  autoUpdate?: boolean;
}

// Plugin execution request
export interface ExecutePluginRequest {
  installationId: string;
  inputs: Record<string, any>;
  projectId?: string;
}

// Template creation request
export interface CreateFromTemplateRequest {
  itemId: string;
  projectName: string;
  variables?: Record<string, any>;
  targetPath?: string;
}

// Validation utilities
export class ManifestValidator {
  static validatePlugin(manifest: any): { valid: boolean; errors: string[] } {
    try {
      PluginManifestSchema.parse(manifest);
      return { valid: true, errors: [] };
    } catch (error: any) {
      return {
        valid: false,
        errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
      };
    }
  }

  static validateTemplate(manifest: any): { valid: boolean; errors: string[] } {
    try {
      TemplateManifestSchema.parse(manifest);
      return { valid: true, errors: [] };
    } catch (error: any) {
      return {
        valid: false,
        errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
      };
    }
  }

  static validate(manifest: any): { valid: boolean; errors: string[] } {
    try {
      ManifestSchema.parse(manifest);
      return { valid: true, errors: [] };
    } catch (error: any) {
      return {
        valid: false,
        errors: error.errors?.map((e: any) => `${e.path.join('.')}: ${e.message}`) || [error.message]
      };
    }
  }
}

// Permission validation
export class PermissionValidator {
  private static readonly SAFE_PERMISSIONS = new Set([
    'ai:generate',
    'ai:analyze',
    'filesystem:read'
  ]);

  private static readonly DANGEROUS_PERMISSIONS = new Set([
    'execute:command',
    'execute:script',
    'filesystem:delete',
    'database:write',
    'env:write'
  ]);

  static validatePermissions(permissions: string[]): {
    valid: boolean;
    warnings: string[];
    risks: string[];
  } {
    const warnings: string[] = [];
    const risks: string[] = [];

    for (const permission of permissions) {
      if (this.DANGEROUS_PERMISSIONS.has(permission)) {
        risks.push(`High-risk permission: ${permission}`);
      } else if (!this.SAFE_PERMISSIONS.has(permission) && !permission.includes(':read')) {
        warnings.push(`Unusual permission: ${permission}`);
      }
    }

    return {
      valid: risks.length === 0,
      warnings,
      risks
    };
  }

  static getRiskLevel(permissions: string[]): PermissionRiskLevel {
    for (const permission of permissions) {
      if (this.DANGEROUS_PERMISSIONS.has(permission)) {
        return 'critical';
      }
    }

    const hasNetworkPerms = permissions.some(p => p.startsWith('network:'));
    const hasWritePerms = permissions.some(p => p.includes(':write'));

    if (hasNetworkPerms && hasWritePerms) return 'high';
    if (hasNetworkPerms || hasWritePerms) return 'medium';
    return 'low';
  }
}