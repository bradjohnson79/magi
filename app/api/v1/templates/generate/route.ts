/**
 * Template Generation API Routes
 *
 * Handles intelligent template generation from project categories
 * using the AI Matrix intuition layer.
 */

import { NextRequest, NextResponse } from 'next/server';
import { getAuth } from '@clerk/nextjs/server';
import { templateManager } from '@/services/templates/manager';
import { ProjectCategory } from '@/services/orch/classifier';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { rateLimiter } from '@/lib/rate-limiter';

/**
 * POST /api/v1/templates/generate
 * Generate template from project category using AI recommendations
 */
export async function POST(request: NextRequest) {
  return withSpan('api.templates.generate', async (span) => {
    try {
      const { userId } = getAuth(request);

      if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_generate',
        [SPAN_ATTRIBUTES.USER_ID]: userId,
      });

      // Rate limiting
      const rateLimitResult = await rateLimiter.limit(userId, 'template_generate', 5, 3600);
      if (!rateLimitResult.success) {
        return NextResponse.json(
          { error: 'Rate limit exceeded' },
          { status: 429 }
        );
      }

      const body = await request.json();

      // Validate input
      if (!body.category || !Object.values(ProjectCategory).includes(body.category)) {
        return NextResponse.json(
          { error: 'Valid project category is required' },
          { status: 400 }
        );
      }

      if (!body.name || typeof body.name !== 'string') {
        return NextResponse.json(
          { error: 'Template name is required' },
          { status: 400 }
        );
      }

      if (body.name.length < 2 || body.name.length > 100) {
        return NextResponse.json(
          { error: 'Template name must be between 2 and 100 characters' },
          { status: 400 }
        );
      }

      addSpanAttributes(span, {
        'template.category': body.category,
        'template.name': body.name,
      });

      const template = await templateManager.createTemplateFromCategory(
        body.category,
        body.name,
        userId,
        {
          description: body.description,
          userPlan: body.userPlan,
          teamSize: body.teamSize,
          preferences: body.preferences,
        }
      );

      return NextResponse.json({
        success: true,
        data: template,
        message: 'Template generated successfully using AI recommendations',
      }, { status: 201 });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to generate template:', error);

      if ((error as Error).message.includes('validation') || (error as Error).message.includes('required')) {
        return NextResponse.json(
          { error: (error as Error).message },
          { status: 400 }
        );
      }

      return NextResponse.json(
        { error: 'Failed to generate template' },
        { status: 500 }
      );
    }
  });
}

/**
 * GET /api/v1/templates/generate/categories
 * Get available project categories for template generation
 */
export async function GET(request: NextRequest) {
  return withSpan('api.templates.categories', async (span) => {
    try {
      addSpanAttributes(span, {
        [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_categories_list',
      });

      const categories = Object.values(ProjectCategory).map(category => ({
        value: category,
        label: category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        description: this.getCategoryDescription(category),
        complexity: this.getCategoryComplexity(category),
        tags: this.getCategoryTags(category),
      }));

      return NextResponse.json({
        success: true,
        data: categories,
      });
    } catch (error) {
      span?.recordException?.(error as Error);
      console.error('Failed to get categories:', error);
      return NextResponse.json(
        { error: 'Failed to get categories' },
        { status: 500 }
      );
    }
  });

  function getCategoryDescription(category: ProjectCategory): string {
    const descriptions: Record<ProjectCategory, string> = {
      [ProjectCategory.WEB_APP]: 'General-purpose web application',
      [ProjectCategory.E_COMMERCE]: 'Online store with payment processing',
      [ProjectCategory.BLOG_PLATFORM]: 'Content management and blogging platform',
      [ProjectCategory.PORTFOLIO]: 'Personal or professional portfolio website',
      [ProjectCategory.MOBILE_APP]: 'Cross-platform mobile application',
      [ProjectCategory.API_SERVICE]: 'RESTful API and microservices',
      [ProjectCategory.AI_CHATBOT]: 'Conversational AI and chatbot interface',
      [ProjectCategory.SOCIAL_PLATFORM]: 'Social networking and community platform',
      [ProjectCategory.CMS]: 'Content management system',
      [ProjectCategory.DASHBOARD]: 'Analytics and admin dashboard',
      [ProjectCategory.LANDING_PAGE]: 'Marketing and promotional landing page',
      [ProjectCategory.SAAS_PLATFORM]: 'Software-as-a-Service platform',
      [ProjectCategory.MARKETPLACE]: 'Multi-vendor marketplace platform',
      [ProjectCategory.BOOKING_SYSTEM]: 'Reservation and booking management',
      [ProjectCategory.LMS]: 'Learning management system',
      [ProjectCategory.CRM]: 'Customer relationship management',
      [ProjectCategory.PROJECT_MANAGEMENT]: 'Task and project management tool',
      [ProjectCategory.FORUM]: 'Discussion forum and community board',
      [ProjectCategory.WIKI]: 'Knowledge base and documentation platform',
      [ProjectCategory.MESSAGING_APP]: 'Real-time messaging and chat application',
      [ProjectCategory.IOT_PLATFORM]: 'Internet of Things device management',
      [ProjectCategory.GAME]: 'Web-based game or gaming platform',
      [ProjectCategory.ML_PLATFORM]: 'Machine learning and AI platform',
      [ProjectCategory.BUSINESS_INTELLIGENCE]: 'Data analytics and reporting platform',
      [ProjectCategory.INVENTORY_SYSTEM]: 'Inventory and warehouse management',
      [ProjectCategory.FINTECH]: 'Financial technology and payment processing',
    };

    return descriptions[category] || 'Custom application type';
  }

  function getCategoryComplexity(category: ProjectCategory): 'simple' | 'moderate' | 'complex' {
    const complexCategories = [
      ProjectCategory.SAAS_PLATFORM,
      ProjectCategory.MARKETPLACE,
      ProjectCategory.ML_PLATFORM,
      ProjectCategory.IOT_PLATFORM,
      ProjectCategory.BUSINESS_INTELLIGENCE,
      ProjectCategory.FINTECH,
    ];

    const moderateCategories = [
      ProjectCategory.E_COMMERCE,
      ProjectCategory.SOCIAL_PLATFORM,
      ProjectCategory.CMS,
      ProjectCategory.BOOKING_SYSTEM,
      ProjectCategory.LMS,
      ProjectCategory.CRM,
      ProjectCategory.PROJECT_MANAGEMENT,
      ProjectCategory.MESSAGING_APP,
    ];

    if (complexCategories.includes(category)) return 'complex';
    if (moderateCategories.includes(category)) return 'moderate';
    return 'simple';
  }

  function getCategoryTags(category: ProjectCategory): string[] {
    const tagMap: Record<ProjectCategory, string[]> = {
      [ProjectCategory.WEB_APP]: ['web', 'fullstack'],
      [ProjectCategory.E_COMMERCE]: ['ecommerce', 'payments', 'shopping'],
      [ProjectCategory.BLOG_PLATFORM]: ['blog', 'cms', 'content'],
      [ProjectCategory.PORTFOLIO]: ['portfolio', 'showcase', 'personal'],
      [ProjectCategory.MOBILE_APP]: ['mobile', 'react-native', 'cross-platform'],
      [ProjectCategory.API_SERVICE]: ['api', 'backend', 'microservices'],
      [ProjectCategory.AI_CHATBOT]: ['ai', 'chatbot', 'nlp'],
      [ProjectCategory.SOCIAL_PLATFORM]: ['social', 'community', 'networking'],
      [ProjectCategory.CMS]: ['cms', 'content', 'admin'],
      [ProjectCategory.DASHBOARD]: ['dashboard', 'analytics', 'admin'],
      [ProjectCategory.LANDING_PAGE]: ['landing', 'marketing', 'seo'],
      [ProjectCategory.SAAS_PLATFORM]: ['saas', 'subscription', 'enterprise'],
      [ProjectCategory.MARKETPLACE]: ['marketplace', 'multi-vendor', 'commerce'],
      [ProjectCategory.BOOKING_SYSTEM]: ['booking', 'reservation', 'scheduling'],
      [ProjectCategory.LMS]: ['learning', 'education', 'courses'],
      [ProjectCategory.CRM]: ['crm', 'sales', 'customers'],
      [ProjectCategory.PROJECT_MANAGEMENT]: ['project', 'tasks', 'collaboration'],
      [ProjectCategory.FORUM]: ['forum', 'discussion', 'community'],
      [ProjectCategory.WIKI]: ['wiki', 'documentation', 'knowledge'],
      [ProjectCategory.MESSAGING_APP]: ['messaging', 'chat', 'realtime'],
      [ProjectCategory.IOT_PLATFORM]: ['iot', 'devices', 'sensors'],
      [ProjectCategory.GAME]: ['game', 'gaming', 'entertainment'],
      [ProjectCategory.ML_PLATFORM]: ['ml', 'ai', 'machine-learning'],
      [ProjectCategory.BUSINESS_INTELLIGENCE]: ['bi', 'analytics', 'reporting'],
      [ProjectCategory.INVENTORY_SYSTEM]: ['inventory', 'warehouse', 'logistics'],
      [ProjectCategory.FINTECH]: ['fintech', 'finance', 'payments'],
    };

    return tagMap[category] || [];
  }
}