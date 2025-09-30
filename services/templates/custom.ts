/**
 * Custom Templates Service
 *
 * Manages user-created templates with learning capabilities from project corrections
 * and feedback integration for continuous improvement.
 */

import { prisma } from '@/lib/db';
import { workspaceManager } from '@/services/workspace/manager';
import { activityLogger } from '@/services/activity/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface CustomTemplateManifest {
  version: string;
  name: string;
  description?: string;
  category?: string;
  tags: string[];
  variables: Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'select';
    required: boolean;
    default?: any;
    description?: string;
    options?: string[]; // For select type
    validation?: string; // Regex pattern
  }>;
  files: Record<string, string>; // path -> content template
  dependencies: Record<string, string>; // package.json style dependencies
  scripts?: Record<string, string>; // npm scripts
  config?: {
    framework?: string;
    language?: string;
    buildTool?: string;
    testFramework?: string;
  };
  learningData?: {
    sourceCorrections: Array<{
      originalContent: string;
      correctedContent: string;
      correctionType: string;
      frequency: number;
    }>;
    userFeedback: Array<{
      rating: number;
      comment?: string;
      suggestions?: string[];
    }>;
    usagePatterns: Record<string, any>;
  };
}

export interface CustomTemplateInfo {
  id: string;
  userId: string;
  name: string;
  description?: string;
  manifest: CustomTemplateManifest;
  category?: string;
  tags: string[];
  isPublic: boolean;
  usageCount: number;
  sourceProjectId?: string;
  parentTemplateId?: string;
  version: string;
  metadata: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomTemplateInput {
  userId: string;
  name: string;
  description?: string;
  manifest: CustomTemplateManifest;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  sourceProjectId?: string;
  parentTemplateId?: string;
}

export interface UpdateCustomTemplateInput {
  templateId: string;
  userId: string;
  name?: string;
  description?: string;
  manifest?: CustomTemplateManifest;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  version?: string;
  metadata?: Record<string, any>;
}

export interface TemplateFilter {
  userId?: string;
  category?: string;
  tags?: string[];
  isPublic?: boolean;
  includePublic?: boolean;
  searchTerm?: string;
  limit?: number;
  offset?: number;
}

export interface TemplateLearningInput {
  templateId: string;
  corrections: Array<{
    filePath: string;
    originalContent: string;
    correctedContent: string;
    correctionType: 'syntax' | 'logic' | 'style' | 'optimization' | 'security';
    confidence: number;
  }>;
  feedback?: {
    rating: number;
    comment?: string;
    suggestions?: string[];
  };
}

export class CustomTemplatesService {
  private static instance: CustomTemplatesService;

  private constructor() {}

  static getInstance(): CustomTemplatesService {
    if (!CustomTemplatesService.instance) {
      CustomTemplatesService.instance = new CustomTemplatesService();
    }
    return CustomTemplatesService.instance;
  }

  /**
   * Create new custom template
   */
  async createTemplate(input: CreateCustomTemplateInput): Promise<CustomTemplateInfo> {
    return await withSpan('custom_templates.create', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_create',
          [SPAN_ATTRIBUTES.USER_ID]: input.userId,
          'template.name': input.name,
          'template.category': input.category || 'general',
        });

        // Validate template manifest
        this.validateManifest(input.manifest);

        // Check if source project exists and user has access
        if (input.sourceProjectId) {
          const project = await prisma.project.findUnique({
            where: { id: input.sourceProjectId },
            include: { workspace: true },
          });

          if (!project) {
            throw new Error('Source project not found');
          }

          if (project.workspaceId) {
            await workspaceManager.checkAccess(project.workspaceId, input.userId);
          } else if (project.ownerId !== input.userId) {
            throw new Error('Access denied to source project');
          }
        }

        // Check parent template access if specified
        if (input.parentTemplateId) {
          const parentTemplate = await prisma.customTemplate.findUnique({
            where: { id: input.parentTemplateId },
          });

          if (!parentTemplate) {
            throw new Error('Parent template not found');
          }

          if (!parentTemplate.isPublic && parentTemplate.userId !== input.userId) {
            throw new Error('Access denied to parent template');
          }
        }

        const template = await prisma.customTemplate.create({
          data: {
            userId: input.userId,
            name: input.name,
            description: input.description,
            manifest: input.manifest,
            category: input.category,
            tags: input.tags || [],
            isPublic: input.isPublic || false,
            sourceProjectId: input.sourceProjectId,
            parentTemplateId: input.parentTemplateId,
            version: input.manifest.version || '1.0.0',
            metadata: {
              createdFrom: input.sourceProjectId ? 'project' : 'scratch',
              variables: input.manifest.variables?.length || 0,
              fileCount: Object.keys(input.manifest.files || {}).length,
            },
          },
        });

        // Log activity
        await activityLogger.logActivity({
          userId: input.userId,
          action: 'template_created',
          resourceType: 'custom_template',
          resourceId: template.id,
          details: {
            templateName: input.name,
            category: input.category,
            isPublic: input.isPublic,
            sourceProjectId: input.sourceProjectId,
          },
        });

        const templateInfo: CustomTemplateInfo = {
          id: template.id,
          userId: template.userId,
          name: template.name,
          description: template.description || undefined,
          manifest: template.manifest as CustomTemplateManifest,
          category: template.category || undefined,
          tags: template.tags,
          isPublic: template.isPublic,
          usageCount: template.usageCount,
          sourceProjectId: template.sourceProjectId || undefined,
          parentTemplateId: template.parentTemplateId || undefined,
          version: template.version,
          metadata: template.metadata as Record<string, any>,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        };

        addSpanAttributes(span, {
          'template.id': template.id,
          'template.file_count': Object.keys(input.manifest.files || {}).length,
        });

        return templateInfo;

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to create custom template:', error);
        throw error;
      }
    });
  }

  /**
   * List custom templates with filtering
   */
  async listTemplates(filter: TemplateFilter = {}): Promise<{
    templates: CustomTemplateInfo[];
    total: number;
    hasMore: boolean;
  }> {
    return await withSpan('custom_templates.list', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_templates_list',
          [SPAN_ATTRIBUTES.USER_ID]: filter.userId || 'anonymous',
          'filter.category': filter.category || 'all',
          'filter.include_public': filter.includePublic || false,
        });

        const where: any = {};

        // User-specific templates or public templates
        if (filter.userId) {
          if (filter.includePublic) {
            where.OR = [
              { userId: filter.userId },
              { isPublic: true },
            ];
          } else {
            where.userId = filter.userId;
          }
        } else if (filter.isPublic !== false) {
          where.isPublic = true;
        }

        if (filter.category) {
          where.category = filter.category;
        }

        if (filter.tags && filter.tags.length > 0) {
          where.tags = {
            hasSome: filter.tags,
          };
        }

        if (filter.searchTerm) {
          where.OR = [
            ...(where.OR || []),
            { name: { contains: filter.searchTerm, mode: 'insensitive' } },
            { description: { contains: filter.searchTerm, mode: 'insensitive' } },
          ];
        }

        const limit = Math.min(filter.limit || 50, 100);
        const offset = filter.offset || 0;

        const [templates, total] = await Promise.all([
          prisma.customTemplate.findMany({
            where,
            orderBy: [
              { usageCount: 'desc' },
              { createdAt: 'desc' },
            ],
            take: limit,
            skip: offset,
          }),
          prisma.customTemplate.count({ where }),
        ]);

        const templateInfos: CustomTemplateInfo[] = templates.map(template => ({
          id: template.id,
          userId: template.userId,
          name: template.name,
          description: template.description || undefined,
          manifest: template.manifest as CustomTemplateManifest,
          category: template.category || undefined,
          tags: template.tags,
          isPublic: template.isPublic,
          usageCount: template.usageCount,
          sourceProjectId: template.sourceProjectId || undefined,
          parentTemplateId: template.parentTemplateId || undefined,
          version: template.version,
          metadata: template.metadata as Record<string, any>,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        }));

        addSpanAttributes(span, {
          'templates.count': templateInfos.length,
          'templates.total': total,
        });

        return {
          templates: templateInfos,
          total,
          hasMore: offset + templates.length < total,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to list custom templates:', error);
        throw error;
      }
    });
  }

  /**
   * Get specific template by ID
   */
  async getTemplate(templateId: string, userId?: string): Promise<CustomTemplateInfo | null> {
    return await withSpan('custom_templates.get', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
          'template.id': templateId,
        });

        const template = await prisma.customTemplate.findUnique({
          where: { id: templateId },
        });

        if (!template) {
          return null;
        }

        // Check access permissions
        if (!template.isPublic && template.userId !== userId) {
          throw new Error('Access denied');
        }

        return {
          id: template.id,
          userId: template.userId,
          name: template.name,
          description: template.description || undefined,
          manifest: template.manifest as CustomTemplateManifest,
          category: template.category || undefined,
          tags: template.tags,
          isPublic: template.isPublic,
          usageCount: template.usageCount,
          sourceProjectId: template.sourceProjectId || undefined,
          parentTemplateId: template.parentTemplateId || undefined,
          version: template.version,
          metadata: template.metadata as Record<string, any>,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to get custom template:', error);
        throw error;
      }
    });
  }

  /**
   * Update custom template
   */
  async updateTemplate(input: UpdateCustomTemplateInput): Promise<CustomTemplateInfo> {
    return await withSpan('custom_templates.update', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_update',
          [SPAN_ATTRIBUTES.USER_ID]: input.userId,
          'template.id': input.templateId,
        });

        const existingTemplate = await prisma.customTemplate.findUnique({
          where: { id: input.templateId },
        });

        if (!existingTemplate) {
          throw new Error('Template not found');
        }

        if (existingTemplate.userId !== input.userId) {
          throw new Error('Access denied');
        }

        const updateData: any = {};

        if (input.name !== undefined) {
          updateData.name = input.name;
        }

        if (input.description !== undefined) {
          updateData.description = input.description;
        }

        if (input.manifest !== undefined) {
          this.validateManifest(input.manifest);
          updateData.manifest = input.manifest;
        }

        if (input.category !== undefined) {
          updateData.category = input.category;
        }

        if (input.tags !== undefined) {
          updateData.tags = input.tags;
        }

        if (input.isPublic !== undefined) {
          updateData.isPublic = input.isPublic;
        }

        if (input.version !== undefined) {
          updateData.version = input.version;
        }

        if (input.metadata !== undefined) {
          updateData.metadata = {
            ...(existingTemplate.metadata as Record<string, any>),
            ...input.metadata,
          };
        }

        const template = await prisma.customTemplate.update({
          where: { id: input.templateId },
          data: updateData,
        });

        // Log activity
        await activityLogger.logActivity({
          userId: input.userId,
          action: 'template_updated',
          resourceType: 'custom_template',
          resourceId: template.id,
          details: {
            updatedFields: Object.keys(updateData),
          },
        });

        return {
          id: template.id,
          userId: template.userId,
          name: template.name,
          description: template.description || undefined,
          manifest: template.manifest as CustomTemplateManifest,
          category: template.category || undefined,
          tags: template.tags,
          isPublic: template.isPublic,
          usageCount: template.usageCount,
          sourceProjectId: template.sourceProjectId || undefined,
          parentTemplateId: template.parentTemplateId || undefined,
          version: template.version,
          metadata: template.metadata as Record<string, any>,
          createdAt: template.createdAt,
          updatedAt: template.updatedAt,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to update custom template:', error);
        throw error;
      }
    });
  }

  /**
   * Delete custom template
   */
  async deleteTemplate(templateId: string, userId: string): Promise<void> {
    return await withSpan('custom_templates.delete', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_delete',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'template.id': templateId,
        });

        const template = await prisma.customTemplate.findUnique({
          where: { id: templateId },
        });

        if (!template) {
          throw new Error('Template not found');
        }

        if (template.userId !== userId) {
          throw new Error('Access denied');
        }

        await prisma.customTemplate.delete({
          where: { id: templateId },
        });

        // Log activity
        await activityLogger.logActivity({
          userId,
          action: 'template_deleted',
          resourceType: 'custom_template',
          resourceId: templateId,
          details: {
            templateName: template.name,
          },
        });

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to delete custom template:', error);
        throw error;
      }
    });
  }

  /**
   * Create template from project with corrections learning
   */
  async createFromProject(
    projectId: string,
    userId: string,
    templateName: string,
    options: {
      description?: string;
      category?: string;
      tags?: string[];
      isPublic?: boolean;
      includeCorrections?: boolean;
    } = {}
  ): Promise<CustomTemplateInfo> {
    return await withSpan('custom_templates.create_from_project', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_from_project',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          [SPAN_ATTRIBUTES.PROJECT_ID]: projectId,
          'template.name': templateName,
        });

        const project = await prisma.project.findUnique({
          where: { id: projectId },
          include: {
            workspace: true,
            activityLogs: options.includeCorrections ? {
              where: {
                action: {
                  in: ['file_edited', 'code_corrected', 'bug_fixed'],
                },
              },
              orderBy: { createdAt: 'desc' },
              take: 100, // Limit to recent corrections
            } : false,
          },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Check access
        if (project.workspaceId) {
          await workspaceManager.checkAccess(project.workspaceId, userId);
        } else if (project.ownerId !== userId) {
          throw new Error('Access denied');
        }

        // Extract project structure and create manifest
        const manifest = await this.extractProjectManifest(project, options.includeCorrections);

        const templateInput: CreateCustomTemplateInput = {
          userId,
          name: templateName,
          description: options.description || `Template created from project: ${project.name}`,
          manifest,
          category: options.category || project.category || undefined,
          tags: options.tags || [],
          isPublic: options.isPublic || false,
          sourceProjectId: projectId,
        };

        return await this.createTemplate(templateInput);

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to create template from project:', error);
        throw error;
      }
    });
  }

  /**
   * Learn from corrections and update template
   */
  async learnFromCorrections(input: TemplateLearningInput): Promise<CustomTemplateInfo> {
    return await withSpan('custom_templates.learn', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'custom_template_learn',
          'template.id': input.templateId,
          'corrections.count': input.corrections.length,
        });

        const template = await prisma.customTemplate.findUnique({
          where: { id: input.templateId },
        });

        if (!template) {
          throw new Error('Template not found');
        }

        const manifest = template.manifest as CustomTemplateManifest;

        // Initialize learning data if not present
        if (!manifest.learningData) {
          manifest.learningData = {
            sourceCorrections: [],
            userFeedback: [],
            usagePatterns: {},
          };
        }

        // Process corrections
        for (const correction of input.corrections) {
          const existingCorrection = manifest.learningData.sourceCorrections.find(
            sc => sc.originalContent === correction.originalContent &&
                  sc.correctedContent === correction.correctedContent
          );

          if (existingCorrection) {
            existingCorrection.frequency += 1;
          } else {
            manifest.learningData.sourceCorrections.push({
              originalContent: correction.originalContent,
              correctedContent: correction.correctedContent,
              correctionType: correction.correctionType,
              frequency: 1,
            });
          }

          // Update template files with high-confidence corrections
          if (correction.confidence > 0.8) {
            await this.applyLearningToTemplate(manifest, correction);
          }
        }

        // Add user feedback
        if (input.feedback) {
          manifest.learningData.userFeedback.push(input.feedback);
        }

        // Update template with learned improvements
        const updatedTemplate = await prisma.customTemplate.update({
          where: { id: input.templateId },
          data: {
            manifest,
            metadata: {
              ...(template.metadata as Record<string, any>),
              lastLearningUpdate: new Date().toISOString(),
              totalCorrections: manifest.learningData.sourceCorrections.length,
            },
          },
        });

        return {
          id: updatedTemplate.id,
          userId: updatedTemplate.userId,
          name: updatedTemplate.name,
          description: updatedTemplate.description || undefined,
          manifest: updatedTemplate.manifest as CustomTemplateManifest,
          category: updatedTemplate.category || undefined,
          tags: updatedTemplate.tags,
          isPublic: updatedTemplate.isPublic,
          usageCount: updatedTemplate.usageCount,
          sourceProjectId: updatedTemplate.sourceProjectId || undefined,
          parentTemplateId: updatedTemplate.parentTemplateId || undefined,
          version: updatedTemplate.version,
          metadata: updatedTemplate.metadata as Record<string, any>,
          createdAt: updatedTemplate.createdAt,
          updatedAt: updatedTemplate.updatedAt,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to learn from corrections:', error);
        throw error;
      }
    });
  }

  /**
   * Increment usage count when template is used
   */
  async incrementUsage(templateId: string): Promise<void> {
    try {
      await prisma.customTemplate.update({
        where: { id: templateId },
        data: {
          usageCount: {
            increment: 1,
          },
        },
      });
    } catch (error) {
      console.error('Failed to increment template usage:', error);
    }
  }

  /**
   * Validate template manifest structure
   */
  private validateManifest(manifest: CustomTemplateManifest): void {
    if (!manifest.name || typeof manifest.name !== 'string') {
      throw new Error('Template manifest must have a valid name');
    }

    if (!manifest.version || typeof manifest.version !== 'string') {
      throw new Error('Template manifest must have a valid version');
    }

    if (!Array.isArray(manifest.tags)) {
      throw new Error('Template manifest tags must be an array');
    }

    if (!Array.isArray(manifest.variables)) {
      throw new Error('Template manifest variables must be an array');
    }

    if (!manifest.files || typeof manifest.files !== 'object') {
      throw new Error('Template manifest must have files object');
    }

    // Validate variables
    for (const variable of manifest.variables) {
      if (!variable.name || typeof variable.name !== 'string') {
        throw new Error('Template variable must have a valid name');
      }

      if (!['string', 'number', 'boolean', 'select'].includes(variable.type)) {
        throw new Error('Template variable type must be string, number, boolean, or select');
      }

      if (typeof variable.required !== 'boolean') {
        throw new Error('Template variable required must be a boolean');
      }
    }
  }

  /**
   * Extract project manifest from project data
   */
  private async extractProjectManifest(
    project: any,
    includeCorrections: boolean = false
  ): Promise<CustomTemplateManifest> {
    // This would extract files, dependencies, and structure from the project
    // For now, create a basic manifest structure
    const manifest: CustomTemplateManifest = {
      version: '1.0.0',
      name: project.name,
      description: `Template generated from project: ${project.name}`,
      category: project.category || 'general',
      tags: [],
      variables: [
        {
          name: 'projectName',
          type: 'string',
          required: true,
          description: 'Name of the new project',
        },
        {
          name: 'description',
          type: 'string',
          required: false,
          description: 'Project description',
          default: '',
        },
      ],
      files: {
        'README.md': `# {{projectName}}\n\n{{description}}\n\n## Getting Started\n\nThis project was created from a custom template.`,
        'package.json': JSON.stringify({
          name: '{{projectName}}',
          version: '1.0.0',
          description: '{{description}}',
          main: 'index.js',
          scripts: {
            start: 'node index.js',
            test: 'echo "Error: no test specified" && exit 1',
          },
        }, null, 2),
      },
      dependencies: {},
      config: {
        framework: 'custom',
        language: 'javascript',
      },
    };

    // Include learning data from corrections if requested
    if (includeCorrections && project.activityLogs) {
      manifest.learningData = {
        sourceCorrections: [],
        userFeedback: [],
        usagePatterns: {
          totalProjects: 1,
          lastUsed: new Date().toISOString(),
        },
      };

      // Process activity logs to extract correction patterns
      for (const log of project.activityLogs) {
        if (log.details && log.details.before && log.details.after) {
          manifest.learningData.sourceCorrections.push({
            originalContent: log.details.before,
            correctedContent: log.details.after,
            correctionType: log.action.includes('bug') ? 'logic' : 'syntax',
            frequency: 1,
          });
        }
      }
    }

    return manifest;
  }

  /**
   * Apply learning corrections to template files
   */
  private async applyLearningToTemplate(
    manifest: CustomTemplateManifest,
    correction: {
      filePath: string;
      originalContent: string;
      correctedContent: string;
      correctionType: string;
      confidence: number;
    }
  ): Promise<void> {
    // Find the template file that matches the correction
    const templatePath = Object.keys(manifest.files).find(path =>
      path.includes(correction.filePath) || correction.filePath.includes(path)
    );

    if (templatePath && manifest.files[templatePath]) {
      // Apply correction if content matches
      if (manifest.files[templatePath].includes(correction.originalContent)) {
        manifest.files[templatePath] = manifest.files[templatePath].replace(
          correction.originalContent,
          correction.correctedContent
        );
      }
    }
  }
}

// Export singleton instance
export const customTemplatesService = CustomTemplatesService.getInstance();