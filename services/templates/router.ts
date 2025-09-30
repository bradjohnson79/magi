/**
 * Intelligent Template Router
 *
 * Routes template requests with user precedence - checks user's custom templates
 * before falling back to system defaults. Includes learning and recommendation logic.
 */

import { customTemplatesService, CustomTemplateInfo } from '@/services/templates/custom';
import { templatesManager } from '@/services/templates/manager';
import { ProjectCategory } from '@/services/orch/classifier';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface TemplateRequest {
  userId?: string;
  category?: string;
  tags?: string[];
  searchTerm?: string;
  projectType?: string;
  requirements?: {
    framework?: string;
    language?: string;
    features?: string[];
  };
  includeSystemTemplates?: boolean;
  preferenceWeight?: number; // 0-1, how much to weight user preferences
}

export interface TemplateResult {
  template: CustomTemplateInfo | any; // Custom or system template
  source: 'custom' | 'system' | 'recommended';
  score: number;
  reason: string;
  alternatives?: Array<{
    template: CustomTemplateInfo | any;
    source: 'custom' | 'system' | 'recommended';
    score: number;
  }>;
}

export interface TemplateRecommendation {
  templates: TemplateResult[];
  userPreferences: {
    frequentCategories: string[];
    preferredTags: string[];
    recentUsage: Array<{
      templateId: string;
      templateName: string;
      usedAt: Date;
      source: string;
    }>;
  };
  learningInsights: {
    suggestedImprovements: string[];
    commonCorrections: Array<{
      type: string;
      frequency: number;
      suggestion: string;
    }>;
  };
}

export class TemplateRouter {
  private static instance: TemplateRouter;

  private constructor() {}

  static getInstance(): TemplateRouter {
    if (!TemplateRouter.instance) {
      TemplateRouter.instance = new TemplateRouter();
    }
    return TemplateRouter.instance;
  }

  /**
   * Find best matching template with user precedence
   */
  async findBestTemplate(request: TemplateRequest): Promise<TemplateResult | null> {
    return await withSpan('template_router.find_best', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_router_find_best',
          [SPAN_ATTRIBUTES.USER_ID]: request.userId || 'anonymous',
          'request.category': request.category || 'any',
          'request.has_requirements': !!request.requirements,
        });

        const candidates: TemplateResult[] = [];

        // 1. Check user's custom templates first
        if (request.userId) {
          const customTemplates = await this.getUserCustomTemplates(request);
          for (const template of customTemplates) {
            const score = this.calculateTemplateScore(template, request, 'custom');
            if (score > 0.3) { // Minimum threshold
              candidates.push({
                template,
                source: 'custom',
                score,
                reason: this.generateScoreReason(template, request, score, 'custom'),
              });
            }
          }
        }

        // 2. Check system templates if no good custom match or if requested
        if (candidates.length === 0 || request.includeSystemTemplates) {
          const systemTemplates = await this.getSystemTemplates(request);
          for (const template of systemTemplates) {
            const score = this.calculateTemplateScore(template, request, 'system');
            // Lower threshold for system templates if no custom templates found
            const threshold = candidates.length > 0 ? 0.6 : 0.3;
            if (score > threshold) {
              candidates.push({
                template,
                source: 'system',
                score: score * 0.8, // Slight penalty for system templates when custom exist
                reason: this.generateScoreReason(template, request, score, 'system'),
              });
            }
          }
        }

        // 3. Sort by score and return best match
        candidates.sort((a, b) => b.score - a.score);

        if (candidates.length === 0) {
          return null;
        }

        const bestTemplate = candidates[0];
        const alternatives = candidates.slice(1, 4); // Top 3 alternatives

        addSpanAttributes(span, {
          'result.source': bestTemplate.source,
          'result.score': bestTemplate.score,
          'alternatives.count': alternatives.length,
        });

        // Record usage for learning
        if (request.userId) {
          await this.recordTemplateSelection(request.userId, bestTemplate);
        }

        return {
          ...bestTemplate,
          alternatives,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to find best template:', error);
        throw error;
      }
    });
  }

  /**
   * Get personalized template recommendations
   */
  async getRecommendations(userId: string, limit: number = 10): Promise<TemplateRecommendation> {
    return await withSpan('template_router.get_recommendations', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_router_recommendations',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'limit': limit,
        });

        // Get user preferences and usage patterns
        const userPreferences = await this.analyzeUserPreferences(userId);

        // Get learning insights from user's templates
        const learningInsights = await this.extractLearningInsights(userId);

        // Generate recommendations based on preferences and trends
        const recommendations: TemplateResult[] = [];

        // 1. User's most used templates
        const userTemplates = await customTemplatesService.listTemplates({
          userId,
          limit: 20,
        });

        for (const template of userTemplates.templates) {
          const score = this.calculateRecommendationScore(template, userPreferences);
          if (score > 0.4) {
            recommendations.push({
              template,
              source: 'custom',
              score,
              reason: `Frequently used template in ${template.category}`,
            });
          }
        }

        // 2. Popular public templates in user's categories
        for (const category of userPreferences.frequentCategories.slice(0, 3)) {
          const publicTemplates = await customTemplatesService.listTemplates({
            category,
            isPublic: true,
            limit: 5,
          });

          for (const template of publicTemplates.templates) {
            if (template.userId !== userId) { // Exclude user's own templates
              const score = this.calculateRecommendationScore(template, userPreferences) * 0.7;
              if (score > 0.3) {
                recommendations.push({
                  template,
                  source: 'recommended',
                  score,
                  reason: `Popular template in ${category} category`,
                });
              }
            }
          }
        }

        // 3. System templates that match preferences
        const systemRequest: TemplateRequest = {
          userId,
          includeSystemTemplates: true,
          tags: userPreferences.preferredTags.slice(0, 5),
        };

        const systemTemplates = await this.getSystemTemplates(systemRequest);
        for (const template of systemTemplates.slice(0, 5)) {
          const score = this.calculateRecommendationScore(template, userPreferences) * 0.6;
          if (score > 0.3) {
            recommendations.push({
              template,
              source: 'system',
              score,
              reason: 'Matches your preferred technologies',
            });
          }
        }

        // Sort and limit recommendations
        recommendations.sort((a, b) => b.score - a.score);

        addSpanAttributes(span, {
          'recommendations.total': recommendations.length,
          'recommendations.custom': recommendations.filter(r => r.source === 'custom').length,
          'recommendations.system': recommendations.filter(r => r.source === 'system').length,
          'user.frequent_categories': userPreferences.frequentCategories.length,
        });

        return {
          templates: recommendations.slice(0, limit),
          userPreferences,
          learningInsights,
        };

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to get template recommendations:', error);
        throw error;
      }
    });
  }

  /**
   * Get user's custom templates based on request
   */
  private async getUserCustomTemplates(request: TemplateRequest): Promise<CustomTemplateInfo[]> {
    if (!request.userId) return [];

    const filter: any = {
      userId: request.userId,
      limit: 50, // Check more custom templates for better matching
    };

    if (request.category) {
      filter.category = request.category;
    }

    if (request.tags && request.tags.length > 0) {
      filter.tags = request.tags;
    }

    if (request.searchTerm) {
      filter.searchTerm = request.searchTerm;
    }

    const result = await customTemplatesService.listTemplates(filter);
    return result.templates;
  }

  /**
   * Get system templates based on request
   */
  private async getSystemTemplates(request: TemplateRequest): Promise<any[]> {
    // This would integrate with the existing template manager
    // For now, return a mock implementation
    const filter: any = {
      limit: 20,
    };

    if (request.category) {
      filter.category = request.category;
    }

    if (request.tags) {
      filter.tags = request.tags;
    }

    if (request.searchTerm) {
      filter.search = request.searchTerm;
    }

    try {
      const result = await templatesManager.listTemplates(filter);
      return result.templates || [];
    } catch (error) {
      console.warn('Failed to get system templates:', error);
      return [];
    }
  }

  /**
   * Calculate template score based on request criteria
   */
  private calculateTemplateScore(
    template: CustomTemplateInfo | any,
    request: TemplateRequest,
    source: 'custom' | 'system'
  ): number {
    let score = 0;

    // Base score for source type
    score += source === 'custom' ? 0.3 : 0.2;

    // Category match
    if (request.category && template.category === request.category) {
      score += 0.3;
    }

    // Tags match
    if (request.tags && request.tags.length > 0) {
      const matchingTags = template.tags?.filter((tag: string) =>
        request.tags!.some(reqTag => tag.toLowerCase().includes(reqTag.toLowerCase()))
      ) || [];
      score += (matchingTags.length / request.tags.length) * 0.2;
    }

    // Search term match
    if (request.searchTerm) {
      const searchLower = request.searchTerm.toLowerCase();
      if (template.name?.toLowerCase().includes(searchLower)) {
        score += 0.15;
      }
      if (template.description?.toLowerCase().includes(searchLower)) {
        score += 0.1;
      }
    }

    // Requirements match (for custom templates with manifest)
    if (request.requirements && template.manifest?.config) {
      const config = template.manifest.config;
      if (request.requirements.framework && config.framework === request.requirements.framework) {
        score += 0.2;
      }
      if (request.requirements.language && config.language === request.requirements.language) {
        score += 0.15;
      }
    }

    // Usage popularity (for custom templates)
    if (source === 'custom' && template.usageCount) {
      score += Math.min(template.usageCount / 100, 0.1); // Cap at 0.1
    }

    // Recent updates (prefer recently updated templates)
    if (template.updatedAt) {
      const daysSinceUpdate = (Date.now() - new Date(template.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 30) {
        score += 0.05;
      }
    }

    return Math.min(score, 1.0); // Cap at 1.0
  }

  /**
   * Calculate recommendation score based on user preferences
   */
  private calculateRecommendationScore(
    template: CustomTemplateInfo | any,
    preferences: any
  ): number {
    let score = 0;

    // Category preference
    if (preferences.frequentCategories.includes(template.category)) {
      const categoryIndex = preferences.frequentCategories.indexOf(template.category);
      score += 0.3 * (1 - categoryIndex * 0.1); // Higher score for more frequent categories
    }

    // Tag preferences
    const matchingTags = template.tags?.filter((tag: string) =>
      preferences.preferredTags.includes(tag)
    ) || [];
    score += (matchingTags.length / Math.max(preferences.preferredTags.length, 1)) * 0.2;

    // Usage count (popularity)
    if (template.usageCount) {
      score += Math.min(template.usageCount / 50, 0.15);
    }

    // Recency
    if (template.updatedAt) {
      const daysSinceUpdate = (Date.now() - new Date(template.updatedAt).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceUpdate < 7) {
        score += 0.1;
      } else if (daysSinceUpdate < 30) {
        score += 0.05;
      }
    }

    return Math.min(score, 1.0);
  }

  /**
   * Generate human-readable reason for template score
   */
  private generateScoreReason(
    template: CustomTemplateInfo | any,
    request: TemplateRequest,
    score: number,
    source: 'custom' | 'system'
  ): string {
    const reasons = [];

    if (source === 'custom') {
      reasons.push('Your custom template');
    }

    if (request.category && template.category === request.category) {
      reasons.push(`matches ${request.category} category`);
    }

    if (request.tags && request.tags.length > 0) {
      const matchingTags = template.tags?.filter((tag: string) =>
        request.tags!.includes(tag)
      ) || [];
      if (matchingTags.length > 0) {
        reasons.push(`includes ${matchingTags.join(', ')} tags`);
      }
    }

    if (template.usageCount > 10) {
      reasons.push('frequently used');
    }

    if (score > 0.8) {
      reasons.push('excellent match');
    } else if (score > 0.6) {
      reasons.push('good match');
    }

    return reasons.length > 0 ? reasons.join(', ') : 'Basic template match';
  }

  /**
   * Analyze user preferences from template usage
   */
  private async analyzeUserPreferences(userId: string): Promise<any> {
    const userTemplates = await customTemplatesService.listTemplates({
      userId,
      limit: 100,
    });

    const categoryCount: Record<string, number> = {};
    const tagCount: Record<string, number> = {};
    const recentUsage: any[] = [];

    for (const template of userTemplates.templates) {
      // Count categories
      if (template.category) {
        categoryCount[template.category] = (categoryCount[template.category] || 0) + template.usageCount;
      }

      // Count tags
      for (const tag of template.tags) {
        tagCount[tag] = (tagCount[tag] || 0) + template.usageCount;
      }

      // Recent usage
      if (template.usageCount > 0) {
        recentUsage.push({
          templateId: template.id,
          templateName: template.name,
          usedAt: template.updatedAt,
          source: 'custom',
        });
      }
    }

    // Sort by frequency
    const frequentCategories = Object.entries(categoryCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([category]) => category);

    const preferredTags = Object.entries(tagCount)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([tag]) => tag);

    recentUsage.sort((a, b) => new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime());

    return {
      frequentCategories,
      preferredTags,
      recentUsage: recentUsage.slice(0, 10),
    };
  }

  /**
   * Extract learning insights from user's templates
   */
  private async extractLearningInsights(userId: string): Promise<any> {
    const userTemplates = await customTemplatesService.listTemplates({
      userId,
      limit: 50,
    });

    const correctionTypes: Record<string, number> = {};
    const suggestions: string[] = [];

    for (const template of userTemplates.templates) {
      if (template.manifest.learningData?.sourceCorrections) {
        for (const correction of template.manifest.learningData.sourceCorrections) {
          correctionTypes[correction.correctionType] =
            (correctionTypes[correction.correctionType] || 0) + correction.frequency;
        }
      }
    }

    // Generate suggestions based on common corrections
    const commonCorrections = Object.entries(correctionTypes)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, frequency]) => ({
        type,
        frequency,
        suggestion: this.generateCorrectionSuggestion(type),
      }));

    if (commonCorrections.length > 0) {
      suggestions.push('Consider creating templates with improved patterns based on frequent corrections');
    }

    return {
      suggestedImprovements: suggestions,
      commonCorrections,
    };
  }

  /**
   * Generate suggestion based on correction type
   */
  private generateCorrectionSuggestion(correctionType: string): string {
    const suggestions: Record<string, string> = {
      syntax: 'Include linting configuration in your templates',
      logic: 'Add more comprehensive examples and comments',
      style: 'Include code formatting rules and prettier configuration',
      optimization: 'Consider adding performance best practices',
      security: 'Include security scanning tools and secure coding patterns',
    };

    return suggestions[correctionType] || 'Review and improve template patterns';
  }

  /**
   * Record template selection for learning
   */
  private async recordTemplateSelection(
    userId: string,
    templateResult: TemplateResult
  ): Promise<void> {
    try {
      // If it's a custom template, increment usage count
      if (templateResult.source === 'custom' && templateResult.template.id) {
        await customTemplatesService.incrementUsage(templateResult.template.id);
      }

      // Could also log to analytics for further insights
      console.log(`User ${userId} selected template ${templateResult.template.name} (${templateResult.source})`);

    } catch (error) {
      console.warn('Failed to record template selection:', error);
    }
  }
}

// Export singleton instance
export const templateRouter = TemplateRouter.getInstance();