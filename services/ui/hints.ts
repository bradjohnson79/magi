/**
 * Smart UI Hints Service
 *
 * Provides intelligent UI suggestions and hints based on project classification
 * from Phase 10's AI Matrix. Contextual assistance for different project types.
 */

import { prisma } from '@/lib/db';
import { projectClassifier, ProjectCategory } from '@/services/orch/classifier';
import { workspaceManager } from '@/services/workspace/manager';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export interface UIHint {
  id: string;
  type: 'suggestion' | 'warning' | 'info' | 'tip';
  title: string;
  description: string;
  action?: {
    label: string;
    endpoint?: string;
    data?: Record<string, any>;
  };
  priority: 'high' | 'medium' | 'low';
  category: string;
  position: 'header' | 'sidebar' | 'editor' | 'footer' | 'modal';
  dismissible: boolean;
  conditions?: {
    projectStage?: 'setup' | 'development' | 'testing' | 'deployment';
    fileTypes?: string[];
    hasFeatures?: string[];
    missingFeatures?: string[];
  };
  metadata: Record<string, any>;
}

export interface HintContext {
  projectId: string;
  userId: string;
  currentFile?: string;
  projectStage?: 'setup' | 'development' | 'testing' | 'deployment';
  recentActivity?: string[];
  stackInfo?: {
    frameworks: string[];
    languages: string[];
    dependencies: string[];
  };
}

interface ProjectInsights {
  category: ProjectCategory;
  confidence: number;
  suggestedTools: string[];
  commonPatterns: string[];
  potentialIssues: string[];
  nextSteps: string[];
}

export class UIHintsService {
  private static instance: UIHintsService;

  private constructor() {}

  static getInstance(): UIHintsService {
    if (!UIHintsService.instance) {
      UIHintsService.instance = new UIHintsService();
    }
    return UIHintsService.instance;
  }

  /**
   * Get contextual hints for a project
   */
  async getProjectHints(context: HintContext): Promise<UIHint[]> {
    return await withSpan('ui_hints.get_project_hints', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'ui_hints_generation',
          [SPAN_ATTRIBUTES.PROJECT_ID]: context.projectId,
          [SPAN_ATTRIBUTES.USER_ID]: context.userId,
        });

        // Get project details
        const project = await prisma.project.findUnique({
          where: { id: context.projectId },
          include: {
            workspace: true,
          },
        });

        if (!project) {
          throw new Error('Project not found');
        }

        // Check workspace access
        await workspaceManager.checkAccess(project.workspaceId, context.userId);

        // Get project classification and insights
        const insights = await this.getProjectInsights(project);

        // Generate hints based on classification and context
        const hints: UIHint[] = [];

        // Category-specific hints
        hints.push(...await this.getCategorySpecificHints(insights, context));

        // Stage-specific hints
        hints.push(...await this.getStageSpecificHints(context, insights));

        // File-specific hints
        if (context.currentFile) {
          hints.push(...await this.getFileSpecificHints(context.currentFile, insights, context));
        }

        // Performance and best practice hints
        hints.push(...await this.getBestPracticeHints(insights, context));

        // Collaboration hints
        hints.push(...await this.getCollaborationHints(project, context));

        // Filter and prioritize hints
        const filteredHints = this.filterHintsByConditions(hints, context);
        const prioritizedHints = this.prioritizeHints(filteredHints);

        addSpanAttributes(span, {
          'hints.total_generated': hints.length,
          'hints.filtered_count': filteredHints.length,
          'hints.category': insights.category,
        });

        return prioritizedHints;

      } catch (error) {
        span?.recordException?.(error as Error);
        console.error('Failed to get project hints:', error);
        return [];
      }
    });
  }

  /**
   * Get project insights from classification
   */
  private async getProjectInsights(project: any): Promise<ProjectInsights> {
    let category = project.category as ProjectCategory;
    let confidence = 0.8;

    // If no category stored, classify from description
    if (!category && project.description) {
      const classification = await projectClassifier.classifyProjectIntent(
        project.description,
        project.id
      );
      category = classification.category;
      confidence = classification.confidence;

      // Store the classification
      await projectClassifier.storeClassificationResult(project.id, classification);
    }

    return {
      category: category || ProjectCategory.UNKNOWN,
      confidence,
      suggestedTools: this.getSuggestedTools(category),
      commonPatterns: this.getCommonPatterns(category),
      potentialIssues: this.getPotentialIssues(category),
      nextSteps: this.getNextSteps(category),
    };
  }

  /**
   * Generate category-specific hints
   */
  private async getCategorySpecificHints(
    insights: ProjectInsights,
    context: HintContext
  ): Promise<UIHint[]> {
    const hints: UIHint[] = [];

    switch (insights.category) {
      case ProjectCategory.WEB_APP:
        hints.push({
          id: 'web-app-performance',
          type: 'tip',
          title: 'Optimize Web Performance',
          description: 'Consider implementing code splitting and lazy loading for better performance.',
          action: {
            label: 'Add Performance Monitoring',
            endpoint: '/api/v1/templates/generate',
            data: { template: 'performance-monitoring' },
          },
          priority: 'medium',
          category: 'performance',
          position: 'sidebar',
          dismissible: true,
          metadata: { category: insights.category },
        });
        break;

      case ProjectCategory.E_COMMERCE:
        hints.push({
          id: 'ecommerce-security',
          type: 'warning',
          title: 'Security Best Practices',
          description: 'Ensure PCI compliance and secure payment processing implementation.',
          priority: 'high',
          category: 'security',
          position: 'header',
          dismissible: false,
          metadata: { category: insights.category },
        });
        break;

      case ProjectCategory.API_SERVICE:
        hints.push({
          id: 'api-documentation',
          type: 'suggestion',
          title: 'API Documentation',
          description: 'Generate OpenAPI documentation for better developer experience.',
          action: {
            label: 'Setup API Docs',
            endpoint: '/api/v1/templates/generate',
            data: { template: 'openapi-docs' },
          },
          priority: 'medium',
          category: 'documentation',
          position: 'sidebar',
          dismissible: true,
          metadata: { category: insights.category },
        });
        break;

      case ProjectCategory.MOBILE_APP:
        hints.push({
          id: 'mobile-responsive',
          type: 'tip',
          title: 'Mobile Responsiveness',
          description: 'Test your app on various screen sizes and device orientations.',
          priority: 'medium',
          category: 'ui-ux',
          position: 'editor',
          dismissible: true,
          conditions: {
            fileTypes: ['.tsx', '.jsx', '.vue'],
          },
          metadata: { category: insights.category },
        });
        break;

      case ProjectCategory.ML_MODEL:
        hints.push({
          id: 'ml-data-validation',
          type: 'warning',
          title: 'Data Validation',
          description: 'Implement robust data validation and preprocessing pipelines.',
          priority: 'high',
          category: 'data-quality',
          position: 'header',
          dismissible: false,
          metadata: { category: insights.category },
        });
        break;
    }

    return hints;
  }

  /**
   * Generate stage-specific hints
   */
  private async getStageSpecificHints(
    context: HintContext,
    insights: ProjectInsights
  ): Promise<UIHint[]> {
    const hints: UIHint[] = [];

    switch (context.projectStage) {
      case 'setup':
        hints.push({
          id: 'setup-environment',
          type: 'suggestion',
          title: 'Environment Setup',
          description: `Configure your ${insights.category} development environment with recommended tools.`,
          action: {
            label: 'Auto-Setup Environment',
            endpoint: '/api/v1/templates/generate',
            data: { template: `${insights.category}-setup` },
          },
          priority: 'high',
          category: 'setup',
          position: 'modal',
          dismissible: false,
          metadata: { stage: 'setup' },
        });
        break;

      case 'development':
        hints.push({
          id: 'code-quality',
          type: 'tip',
          title: 'Code Quality Tools',
          description: 'Setup linting, formatting, and testing tools for better code quality.',
          action: {
            label: 'Configure Quality Tools',
            endpoint: '/api/v1/templates/generate',
            data: { template: 'quality-tools' },
          },
          priority: 'medium',
          category: 'quality',
          position: 'sidebar',
          dismissible: true,
          metadata: { stage: 'development' },
        });
        break;

      case 'testing':
        hints.push({
          id: 'test-coverage',
          type: 'info',
          title: 'Test Coverage',
          description: 'Aim for at least 80% test coverage for critical business logic.',
          priority: 'medium',
          category: 'testing',
          position: 'footer',
          dismissible: true,
          metadata: { stage: 'testing' },
        });
        break;

      case 'deployment':
        hints.push({
          id: 'deployment-checklist',
          type: 'warning',
          title: 'Deployment Checklist',
          description: 'Review security, performance, and monitoring before going live.',
          priority: 'high',
          category: 'deployment',
          position: 'header',
          dismissible: false,
          metadata: { stage: 'deployment' },
        });
        break;
    }

    return hints;
  }

  /**
   * Generate file-specific hints
   */
  private async getFileSpecificHints(
    filePath: string,
    insights: ProjectInsights,
    context: HintContext
  ): Promise<UIHint[]> {
    const hints: UIHint[] = [];
    const fileExt = filePath.split('.').pop()?.toLowerCase();

    switch (fileExt) {
      case 'tsx':
      case 'jsx':
        hints.push({
          id: 'react-best-practices',
          type: 'tip',
          title: 'React Best Practices',
          description: 'Use React.memo for expensive components and useCallback for event handlers.',
          priority: 'low',
          category: 'performance',
          position: 'editor',
          dismissible: true,
          conditions: {
            fileTypes: ['.tsx', '.jsx'],
          },
          metadata: { fileType: fileExt },
        });
        break;

      case 'py':
        if (insights.category === ProjectCategory.ML_MODEL) {
          hints.push({
            id: 'python-ml-hints',
            type: 'suggestion',
            title: 'ML Development Tips',
            description: 'Consider using type hints and dataclasses for better code maintainability.',
            priority: 'medium',
            category: 'code-quality',
            position: 'editor',
            dismissible: true,
            metadata: { fileType: fileExt },
          });
        }
        break;

      case 'sql':
        hints.push({
          id: 'sql-optimization',
          type: 'tip',
          title: 'SQL Optimization',
          description: 'Use appropriate indexes and avoid SELECT * in production queries.',
          priority: 'medium',
          category: 'performance',
          position: 'editor',
          dismissible: true,
          conditions: {
            fileTypes: ['.sql'],
          },
          metadata: { fileType: fileExt },
        });
        break;
    }

    return hints;
  }

  /**
   * Generate best practice hints
   */
  private async getBestPracticeHints(
    insights: ProjectInsights,
    context: HintContext
  ): Promise<UIHint[]> {
    const hints: UIHint[] = [];

    // Security hints
    hints.push({
      id: 'security-review',
      type: 'warning',
      title: 'Security Review',
      description: 'Regular security audits are recommended for production applications.',
      priority: 'high',
      category: 'security',
      position: 'sidebar',
      dismissible: true,
      conditions: {
        projectStage: 'deployment',
      },
      metadata: { type: 'security' },
    });

    // Performance hints
    if (insights.confidence > 0.8) {
      hints.push({
        id: 'performance-monitoring',
        type: 'suggestion',
        title: 'Performance Monitoring',
        description: `Set up monitoring for ${insights.category} applications to track key metrics.`,
        action: {
          label: 'Add Monitoring',
          endpoint: '/api/v1/templates/generate',
          data: { template: 'monitoring-setup' },
        },
        priority: 'medium',
        category: 'monitoring',
        position: 'sidebar',
        dismissible: true,
        metadata: { type: 'performance' },
      });
    }

    return hints;
  }

  /**
   * Generate collaboration hints
   */
  private async getCollaborationHints(
    project: any,
    context: HintContext
  ): Promise<UIHint[]> {
    const hints: UIHint[] = [];

    // Get workspace member count
    const memberCount = await prisma.workspaceMember.count({
      where: { workspaceId: project.workspaceId },
    });

    if (memberCount > 1) {
      hints.push({
        id: 'collaboration-setup',
        type: 'info',
        title: 'Team Collaboration',
        description: 'Set up branch protection and code review workflows for team projects.',
        action: {
          label: 'Setup Review Process',
          endpoint: '/api/v1/reviews',
        },
        priority: 'medium',
        category: 'collaboration',
        position: 'sidebar',
        dismissible: true,
        metadata: { memberCount },
      });
    }

    return hints;
  }

  /**
   * Filter hints based on conditions
   */
  private filterHintsByConditions(hints: UIHint[], context: HintContext): UIHint[] {
    return hints.filter(hint => {
      if (!hint.conditions) return true;

      const { conditions } = hint;

      // Check project stage
      if (conditions.projectStage && conditions.projectStage !== context.projectStage) {
        return false;
      }

      // Check file types
      if (conditions.fileTypes && context.currentFile) {
        const fileExt = '.' + context.currentFile.split('.').pop();
        if (!conditions.fileTypes.includes(fileExt)) {
          return false;
        }
      }

      return true;
    });
  }

  /**
   * Prioritize and limit hints
   */
  private prioritizeHints(hints: UIHint[]): UIHint[] {
    const priorityOrder = { high: 3, medium: 2, low: 1 };

    return hints
      .sort((a, b) => priorityOrder[b.priority] - priorityOrder[a.priority])
      .slice(0, 8); // Limit to 8 hints to avoid UI clutter
  }

  /**
   * Get suggested tools for category
   */
  private getSuggestedTools(category: ProjectCategory): string[] {
    const toolMap: Record<ProjectCategory, string[]> = {
      [ProjectCategory.WEB_APP]: ['React', 'Next.js', 'Tailwind CSS', 'Vercel'],
      [ProjectCategory.E_COMMERCE]: ['Stripe', 'Shopify', 'WooCommerce', 'Square'],
      [ProjectCategory.API_SERVICE]: ['Express', 'FastAPI', 'Swagger', 'Postman'],
      [ProjectCategory.MOBILE_APP]: ['React Native', 'Flutter', 'Expo', 'Firebase'],
      [ProjectCategory.ML_MODEL]: ['TensorFlow', 'PyTorch', 'Jupyter', 'MLflow'],
      [ProjectCategory.DATABASE_DESIGN]: ['Prisma', 'TypeORM', 'Sequelize', 'Drizzle'],
      [ProjectCategory.DEVOPS_AUTOMATION]: ['Docker', 'Kubernetes', 'GitHub Actions', 'Terraform'],
      [ProjectCategory.DATA_PIPELINE]: ['Apache Airflow', 'Kafka', 'Spark', 'dbt'],
      [ProjectCategory.AI_CHATBOT]: ['OpenAI', 'LangChain', 'Pinecone', 'Supabase'],
      [ProjectCategory.UNKNOWN]: ['VS Code', 'Git', 'Docker', 'GitHub'],
    };

    return toolMap[category] || toolMap[ProjectCategory.UNKNOWN];
  }

  /**
   * Get common patterns for category
   */
  private getCommonPatterns(category: ProjectCategory): string[] {
    const patternMap: Record<ProjectCategory, string[]> = {
      [ProjectCategory.WEB_APP]: ['Component-based architecture', 'State management', 'Routing'],
      [ProjectCategory.E_COMMERCE]: ['Shopping cart', 'Payment processing', 'Inventory management'],
      [ProjectCategory.API_SERVICE]: ['RESTful design', 'Authentication', 'Rate limiting'],
      [ProjectCategory.MOBILE_APP]: ['Navigation patterns', 'Offline support', 'Push notifications'],
      [ProjectCategory.ML_MODEL]: ['Data preprocessing', 'Model training', 'Feature engineering'],
      [ProjectCategory.UNKNOWN]: ['Clean code', 'Testing', 'Documentation'],
    };

    return patternMap[category] || patternMap[ProjectCategory.UNKNOWN];
  }

  /**
   * Get potential issues for category
   */
  private getPotentialIssues(category: ProjectCategory): string[] {
    const issueMap: Record<ProjectCategory, string[]> = {
      [ProjectCategory.WEB_APP]: ['Bundle size', 'SEO optimization', 'Accessibility'],
      [ProjectCategory.E_COMMERCE]: ['Security vulnerabilities', 'Payment failures', 'Performance'],
      [ProjectCategory.API_SERVICE]: ['Rate limiting', 'Authentication', 'Documentation'],
      [ProjectCategory.MOBILE_APP]: ['Platform differences', 'Performance', 'Battery usage'],
      [ProjectCategory.ML_MODEL]: ['Data quality', 'Model drift', 'Overfitting'],
      [ProjectCategory.UNKNOWN]: ['Code quality', 'Testing coverage', 'Documentation'],
    };

    return issueMap[category] || issueMap[ProjectCategory.UNKNOWN];
  }

  /**
   * Get next steps for category
   */
  private getNextSteps(category: ProjectCategory): string[] {
    const stepsMap: Record<ProjectCategory, string[]> = {
      [ProjectCategory.WEB_APP]: ['Setup routing', 'Add state management', 'Implement authentication'],
      [ProjectCategory.E_COMMERCE]: ['Setup payment gateway', 'Add product catalog', 'Implement cart'],
      [ProjectCategory.API_SERVICE]: ['Design endpoints', 'Add authentication', 'Write documentation'],
      [ProjectCategory.MOBILE_APP]: ['Setup navigation', 'Add core screens', 'Test on devices'],
      [ProjectCategory.ML_MODEL]: ['Prepare data', 'Train baseline model', 'Evaluate performance'],
      [ProjectCategory.UNKNOWN]: ['Define requirements', 'Choose tech stack', 'Setup project structure'],
    };

    return stepsMap[category] || stepsMap[ProjectCategory.UNKNOWN];
  }

  /**
   * Dismiss a hint for a user
   */
  async dismissHint(hintId: string, userId: string, projectId: string): Promise<void> {
    try {
      // Store dismissed hint in user preferences or project metadata
      await prisma.project.update({
        where: { id: projectId },
        data: {
          metadata: {
            dismissedHints: {
              [userId]: {
                [hintId]: new Date().toISOString(),
              },
            },
          },
        },
      });
    } catch (error) {
      console.error('Failed to dismiss hint:', error);
      throw error;
    }
  }

  /**
   * Get hint analytics for project optimization
   */
  async getHintAnalytics(projectId: string): Promise<{
    totalShown: number;
    dismissed: number;
    acted: number;
    topCategories: Array<{ category: string; count: number }>;
  }> {
    // This would query hint interaction data
    // For now, return mock structure
    return {
      totalShown: 0,
      dismissed: 0,
      acted: 0,
      topCategories: [],
    };
  }
}

// Export singleton instance
export const uiHintsService = UIHintsService.getInstance();