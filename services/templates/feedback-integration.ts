/**
 * Template Feedback Integration Service
 *
 * Connects project corrections to custom template learning system.
 * Handles automatic template candidate generation from user corrections.
 */

import { prisma } from '@/lib/prisma';
import { customTemplatesService } from './custom';
import { feedbackManager } from '../orch/feedback';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface ProjectCorrection {
  projectId: string;
  userId: string;
  filePath: string;
  originalContent: string;
  correctedContent: string;
  correctionType: 'syntax' | 'logic' | 'style' | 'optimization' | 'security' | 'template';
  confidence: number;
  description?: string;
  metadata?: Record<string, any>;
}

export interface TemplateCandidate {
  userId: string;
  projectId: string;
  suggestedName: string;
  description: string;
  category?: string;
  tags: string[];
  corrections: ProjectCorrection[];
  confidence: number;
  priority: 'low' | 'medium' | 'high';
}

export interface FeedbackIntegrationConfig {
  minCorrectionsForCandidate: number;
  minConfidenceThreshold: number;
  autoCreateThreshold: number;
  categoryMappings: Record<string, string>;
}

export class TemplateFeedbackIntegration {
  private static instance: TemplateFeedbackIntegration;

  private config: FeedbackIntegrationConfig = {
    minCorrectionsForCandidate: 3,
    minConfidenceThreshold: 0.7,
    autoCreateThreshold: 0.9,
    categoryMappings: {
      'web-app': 'Frontend',
      'api': 'Backend',
      'mobile-app': 'Mobile',
      'cli': 'CLI',
      'library': 'Library',
      'microservice': 'Microservice',
    },
  };

  public static getInstance(): TemplateFeedbackIntegration {
    if (!TemplateFeedbackIntegration.instance) {
      TemplateFeedbackIntegration.instance = new TemplateFeedbackIntegration();
    }
    return TemplateFeedbackIntegration.instance;
  }

  /**
   * Process project corrections and determine if they should generate template candidates
   */
  async processProjectCorrections(corrections: ProjectCorrection[]): Promise<TemplateCandidate[]> {
    return withSpan('template_feedback.process_corrections', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_feedback_processing',
        'corrections.count': corrections.length,
        'corrections.user_id': corrections[0]?.userId || 'unknown',
      });

      const candidates: TemplateCandidate[] = [];

      // Group corrections by project and analyze patterns
      const projectGroups = this.groupCorrectionsByProject(corrections);

      for (const [projectId, projectCorrections] of projectGroups) {
        const candidate = await this.analyzeProjectCorrections(projectId, projectCorrections);
        if (candidate) {
          candidates.push(candidate);

          // Auto-create high-confidence templates
          if (candidate.confidence >= this.config.autoCreateThreshold) {
            await this.autoCreateTemplate(candidate);
          }
        }
      }

      addSpanAttributes(span, {
        'candidates.generated': candidates.length,
        'candidates.auto_created': candidates.filter(c => c.confidence >= this.config.autoCreateThreshold).length,
      });

      return candidates;
    });
  }

  /**
   * Record a single project correction and update learning data
   */
  async recordProjectCorrection(correction: ProjectCorrection): Promise<void> {
    return withSpan('template_feedback.record_correction', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_correction_record',
        [SPAN_ATTRIBUTES.USER_ID]: correction.userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: correction.projectId,
        'correction.type': correction.correctionType,
        'correction.confidence': correction.confidence,
      });

      // Store correction in database
      await prisma.projectCorrection.create({
        data: {
          projectId: correction.projectId,
          userId: correction.userId,
          filePath: correction.filePath,
          originalContent: correction.originalContent,
          correctedContent: correction.correctedContent,
          correctionType: correction.correctionType,
          confidence: correction.confidence,
          description: correction.description,
          metadata: correction.metadata || {},
        },
      });

      // Check if this correction should trigger template learning
      await this.evaluateForTemplateLearning(correction);

      // Update existing custom templates that might benefit from this correction
      await this.updateRelatedTemplates(correction);
    });
  }

  /**
   * Get template learning suggestions based on user's correction history
   */
  async getLearningSuggestions(userId: string, limit: number = 10): Promise<TemplateCandidate[]> {
    return withSpan('template_feedback.learning_suggestions', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_learning_suggestions',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        'suggestions.limit': limit,
      });

      // Get recent corrections from user
      const recentCorrections = await prisma.projectCorrection.findMany({
        where: {
          userId,
          createdAt: {
            gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 100,
      });

      // Analyze patterns and generate suggestions
      const candidates = await this.processProjectCorrections(recentCorrections);

      // Sort by priority and confidence
      return candidates
        .sort((a, b) => {
          const priorityWeight = { high: 3, medium: 2, low: 1 };
          const scoreA = a.confidence * priorityWeight[a.priority];
          const scoreB = b.confidence * priorityWeight[b.priority];
          return scoreB - scoreA;
        })
        .slice(0, limit);
    });
  }

  /**
   * Apply corrections to existing templates based on learning data
   */
  async applyCorrectionsToTemplates(
    templateId: string,
    corrections: ProjectCorrection[]
  ): Promise<void> {
    return withSpan('template_feedback.apply_corrections', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_corrections_apply',
        'template.id': templateId,
        'corrections.count': corrections.length,
      });

      // Get template
      const template = await customTemplatesService.getTemplate(templateId);
      if (!template) {
        throw new Error('Template not found');
      }

      // Process corrections into learning format
      const learningCorrections = corrections.map(correction => ({
        filePath: correction.filePath,
        originalContent: correction.originalContent,
        correctedContent: correction.correctedContent,
        correctionType: correction.correctionType,
        confidence: correction.confidence,
      }));

      // Apply learning
      await customTemplatesService.learnFromCorrections({
        templateId,
        corrections: learningCorrections,
        feedback: {
          rating: this.calculateFeedbackRating(corrections),
          comment: `Auto-applied ${corrections.length} project corrections`,
          suggestions: this.generateImprovementSuggestions(corrections),
        },
      });
    });
  }

  /**
   * Get project corrections with filtering
   */
  async getProjectCorrections(
    projectId: string,
    userId: string,
    options: {
      correctionType?: string;
      limit?: number;
      offset?: number;
    } = {}
  ): Promise<ProjectCorrection[]> {
    return withSpan('template_feedback.get_project_corrections', async (span) => {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_corrections_get',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
        [SPAN_ATTRIBUTES.PROJECT_ID]: projectId,
      });

      const corrections = await prisma.projectCorrection.findMany({
        where: {
          projectId,
          userId,
          ...(options.correctionType && { correctionType: options.correctionType }),
        },
        orderBy: { createdAt: 'desc' },
        take: options.limit || 20,
        skip: options.offset || 0,
      });

      return corrections.map(correction => ({
        projectId: correction.projectId,
        userId: correction.userId,
        filePath: correction.filePath,
        originalContent: correction.originalContent,
        correctedContent: correction.correctedContent,
        correctionType: correction.correctionType as any,
        confidence: correction.confidence,
        description: correction.description || undefined,
        metadata: correction.metadata as Record<string, any>,
      }));
    });
  }

  /**
   * Private helper methods
   */
  private groupCorrectionsByProject(corrections: ProjectCorrection[]): Map<string, ProjectCorrection[]> {
    const groups = new Map<string, ProjectCorrection[]>();

    corrections.forEach(correction => {
      if (!groups.has(correction.projectId)) {
        groups.set(correction.projectId, []);
      }
      groups.get(correction.projectId)!.push(correction);
    });

    return groups;
  }

  private async analyzeProjectCorrections(
    projectId: string,
    corrections: ProjectCorrection[]
  ): Promise<TemplateCandidate | null> {
    if (corrections.length < this.config.minCorrectionsForCandidate) {
      return null;
    }

    const avgConfidence = corrections.reduce((sum, c) => sum + c.confidence, 0) / corrections.length;
    if (avgConfidence < this.config.minConfidenceThreshold) {
      return null;
    }

    // Get project details
    const project = await prisma.project.findUnique({
      where: { id: projectId },
    });

    if (!project) {
      return null;
    }

    // Analyze correction patterns to determine template viability
    const correctionTypes = this.analyzeCorrectionPatterns(corrections);
    const category = this.inferCategory(project, corrections);
    const tags = this.generateTags(project, corrections);

    return {
      userId: corrections[0].userId,
      projectId,
      suggestedName: `${project.name} Template`,
      description: this.generateDescription(project, corrections),
      category,
      tags,
      corrections,
      confidence: avgConfidence,
      priority: this.calculatePriority(corrections, avgConfidence),
    };
  }

  private async evaluateForTemplateLearning(correction: ProjectCorrection): Promise<void> {
    // Get user's templates that might be related to this correction
    const userTemplates = await customTemplatesService.listTemplates({
      userId: correction.userId,
      includePublic: false,
    });

    // Find templates that might benefit from this correction
    for (const template of userTemplates.templates) {
      const relevanceScore = this.calculateTemplateRelevance(template, correction);

      if (relevanceScore > 0.6) {
        // Queue for learning update
        await this.queueTemplateUpdate(template.id, correction);
      }
    }
  }

  private async updateRelatedTemplates(correction: ProjectCorrection): Promise<void> {
    // Find templates with similar patterns
    const relatedTemplates = await this.findRelatedTemplates(correction);

    for (const template of relatedTemplates) {
      // Apply correction as learning data
      await customTemplatesService.learnFromCorrections({
        templateId: template.id,
        corrections: [{
          filePath: correction.filePath,
          originalContent: correction.originalContent,
          correctedContent: correction.correctedContent,
          correctionType: correction.correctionType,
          confidence: correction.confidence,
        }],
      });
    }
  }

  private async autoCreateTemplate(candidate: TemplateCandidate): Promise<void> {
    // Get project details to create manifest
    const project = await prisma.project.findUnique({
      where: { id: candidate.projectId },
      include: {
        files: true,
      },
    });

    if (!project) {
      return;
    }

    // Create manifest from project with corrections applied
    const manifest = await this.createManifestFromProject(project, candidate.corrections);

    // Create template
    await customTemplatesService.createTemplate({
      userId: candidate.userId,
      name: candidate.suggestedName,
      description: candidate.description,
      manifest,
      category: candidate.category,
      tags: candidate.tags,
      isPublic: false,
      sourceProjectId: candidate.projectId,
    });
  }

  private analyzeCorrectionPatterns(corrections: ProjectCorrection[]): Record<string, number> {
    const patterns: Record<string, number> = {};

    corrections.forEach(correction => {
      patterns[correction.correctionType] = (patterns[correction.correctionType] || 0) + 1;
    });

    return patterns;
  }

  private inferCategory(project: any, corrections: ProjectCorrection[]): string {
    // Use project category if available
    if (project.category && this.config.categoryMappings[project.category]) {
      return this.config.categoryMappings[project.category];
    }

    // Infer from correction patterns
    const hasBackendCorrections = corrections.some(c =>
      c.filePath.includes('api/') || c.filePath.includes('server') || c.filePath.includes('.go') || c.filePath.includes('.py')
    );

    const hasFrontendCorrections = corrections.some(c =>
      c.filePath.includes('components/') || c.filePath.includes('.tsx') || c.filePath.includes('.jsx')
    );

    if (hasBackendCorrections && hasFrontendCorrections) {
      return 'Full Stack';
    } else if (hasBackendCorrections) {
      return 'Backend';
    } else if (hasFrontendCorrections) {
      return 'Frontend';
    }

    return 'General';
  }

  private generateTags(project: any, corrections: ProjectCorrection[]): string[] {
    const tags: Set<string> = new Set();

    // Add project-based tags
    if (project.metadata?.framework) {
      tags.add(project.metadata.framework.toLowerCase());
    }

    // Add correction-based tags
    corrections.forEach(correction => {
      if (correction.filePath.includes('.ts')) tags.add('typescript');
      if (correction.filePath.includes('.js')) tags.add('javascript');
      if (correction.filePath.includes('.py')) tags.add('python');
      if (correction.filePath.includes('.go')) tags.add('go');
      if (correction.filePath.includes('api/')) tags.add('api');
      if (correction.filePath.includes('components/')) tags.add('components');
      if (correction.correctionType === 'security') tags.add('security');
      if (correction.correctionType === 'optimization') tags.add('performance');
    });

    return Array.from(tags).slice(0, 8); // Limit to 8 tags
  }

  private generateDescription(project: any, corrections: ProjectCorrection[]): string {
    const correctionSummary = this.analyzeCorrectionPatterns(corrections);
    const topCorrections = Object.entries(correctionSummary)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3)
      .map(([type, count]) => `${count} ${type}`)
      .join(', ');

    return `Template based on ${project.name} with learned improvements: ${topCorrections} corrections applied.`;
  }

  private calculatePriority(corrections: ProjectCorrection[], avgConfidence: number): 'low' | 'medium' | 'high' {
    const securityCorrections = corrections.filter(c => c.correctionType === 'security').length;
    const totalCorrections = corrections.length;

    if (securityCorrections > 0 || avgConfidence > 0.9) {
      return 'high';
    } else if (totalCorrections >= 5 || avgConfidence > 0.8) {
      return 'medium';
    }

    return 'low';
  }

  private calculateTemplateRelevance(template: any, correction: ProjectCorrection): number {
    let relevance = 0;

    // Check category match
    if (template.category === this.inferCategory({ category: 'unknown' }, [correction])) {
      relevance += 0.3;
    }

    // Check tag overlap
    const correctionTags = this.generateTags({}, [correction]);
    const sharedTags = template.tags.filter((tag: string) => correctionTags.includes(tag));
    relevance += (sharedTags.length / Math.max(template.tags.length, correctionTags.length)) * 0.4;

    // Check file pattern similarity
    if (template.manifest?.files) {
      const templateFiles = Object.keys(template.manifest.files);
      const hasMatchingPattern = templateFiles.some((file: string) =>
        file.includes(correction.filePath.split('/').pop()?.split('.').pop() || '')
      );
      if (hasMatchingPattern) {
        relevance += 0.3;
      }
    }

    return relevance;
  }

  private async queueTemplateUpdate(templateId: string, correction: ProjectCorrection): Promise<void> {
    // Store queued update for batch processing
    await prisma.templateUpdateQueue.create({
      data: {
        templateId,
        correctionData: {
          filePath: correction.filePath,
          originalContent: correction.originalContent,
          correctedContent: correction.correctedContent,
          correctionType: correction.correctionType,
          confidence: correction.confidence,
        },
        priority: this.calculatePriority([correction], correction.confidence),
        scheduledFor: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes delay for batching
      },
    });
  }

  private async findRelatedTemplates(correction: ProjectCorrection): Promise<any[]> {
    // Find templates that might benefit from this correction
    const allTemplates = await customTemplatesService.listTemplates({
      userId: correction.userId,
      includePublic: true,
    });

    return allTemplates.templates.filter(template =>
      this.calculateTemplateRelevance(template, correction) > 0.5
    );
  }

  private async createManifestFromProject(project: any, corrections: ProjectCorrection[]): Promise<any> {
    // Build manifest with corrections applied
    const files: Record<string, string> = {};

    // Process project files and apply corrections
    for (const file of project.files) {
      const applicableCorrections = corrections.filter(c => c.filePath === file.path);

      let content = file.content;
      for (const correction of applicableCorrections) {
        content = content.replace(correction.originalContent, correction.correctedContent);
      }

      files[file.path] = content;
    }

    return {
      version: '1.0.0',
      name: project.name,
      description: `Template generated from ${project.name} with learned corrections`,
      variables: this.extractVariables(files),
      files,
      dependencies: project.metadata?.dependencies || {},
      learningData: {
        sourceCorrections: corrections.map(c => ({
          originalContent: c.originalContent,
          correctedContent: c.correctedContent,
          correctionType: c.correctionType,
          frequency: 1,
        })),
        userFeedback: [],
        usagePatterns: {},
      },
    };
  }

  private extractVariables(files: Record<string, string>): any[] {
    // Extract template variables from file contents
    const variables: any[] = [];
    const variablePattern = /\{\{(\w+)\}\}/g;

    Object.values(files).forEach(content => {
      let match;
      while ((match = variablePattern.exec(content)) !== null) {
        const varName = match[1];
        if (!variables.find(v => v.name === varName)) {
          variables.push({
            name: varName,
            type: 'string',
            description: `Variable: ${varName}`,
            required: true,
          });
        }
      }
    });

    return variables;
  }

  private calculateFeedbackRating(corrections: ProjectCorrection[]): number {
    const avgConfidence = corrections.reduce((sum, c) => sum + c.confidence, 0) / corrections.length;
    return Math.round(avgConfidence * 5);
  }

  private generateImprovementSuggestions(corrections: ProjectCorrection[]): string[] {
    const suggestions: string[] = [];

    const patterns = this.analyzeCorrectionPatterns(corrections);

    Object.entries(patterns).forEach(([type, count]) => {
      if (count > 1) {
        suggestions.push(`Consider reviewing ${type} patterns (${count} corrections needed)`);
      }
    });

    return suggestions;
  }
}

export const templateFeedbackIntegration = TemplateFeedbackIntegration.getInstance();