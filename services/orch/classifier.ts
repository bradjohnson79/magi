/**
 * Project Intent Classifier
 *
 * Intelligent classification of project intents using rule-based keyword
 * matching with LLM fallback for uncertain cases. Provides confidence
 * scoring and learning capabilities.
 */

import { prisma } from '@/lib/db';
import { getSecret } from '@/services/secrets';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

export enum ProjectCategory {
  // Web Development
  WEB_APP = 'web_app',
  E_COMMERCE = 'e_commerce',
  BLOG_CMS = 'blog_cms',
  PORTFOLIO = 'portfolio',
  LANDING_PAGE = 'landing_page',

  // Mobile Development
  MOBILE_APP = 'mobile_app',
  CROSS_PLATFORM = 'cross_platform',

  // Backend & APIs
  API_SERVICE = 'api_service',
  MICROSERVICE = 'microservice',
  DATABASE_DESIGN = 'database_design',

  // Data & Analytics
  DATA_PIPELINE = 'data_pipeline',
  ANALYTICS_DASHBOARD = 'analytics_dashboard',
  ML_MODEL = 'ml_model',
  DATA_VISUALIZATION = 'data_visualization',

  // DevOps & Infrastructure
  DEVOPS_AUTOMATION = 'devops_automation',
  INFRASTRUCTURE = 'infrastructure',
  MONITORING = 'monitoring',

  // AI & Machine Learning
  AI_CHATBOT = 'ai_chatbot',
  NLP_PROCESSING = 'nlp_processing',
  COMPUTER_VISION = 'computer_vision',
  RECOMMENDATION_ENGINE = 'recommendation_engine',

  // Enterprise & Business
  ENTERPRISE_SOFTWARE = 'enterprise_software',
  WORKFLOW_AUTOMATION = 'workflow_automation',
  INTEGRATION = 'integration',

  // Gaming & Entertainment
  GAME_DEVELOPMENT = 'game_development',
  INTERACTIVE_MEDIA = 'interactive_media',

  // Other
  PROTOTYPE = 'prototype',
  UNKNOWN = 'unknown',
}

interface ClassificationResult {
  category: ProjectCategory;
  confidence: number;
  method: 'rule_based' | 'llm' | 'admin_override';
  reasoning: string;
  keywords: string[];
  alternatives: Array<{
    category: ProjectCategory;
    confidence: number;
  }>;
}

interface RuleBasedPattern {
  category: ProjectCategory;
  keywords: string[];
  weight: number;
  mustHave?: string[];
  mustNotHave?: string[];
}

// Comprehensive rule-based patterns for classification
const CLASSIFICATION_RULES: RuleBasedPattern[] = [
  // Web Development
  {
    category: ProjectCategory.WEB_APP,
    keywords: ['web app', 'webapp', 'web application', 'react', 'vue', 'angular', 'next.js', 'nuxt'],
    weight: 3,
  },
  {
    category: ProjectCategory.E_COMMERCE,
    keywords: ['e-commerce', 'ecommerce', 'online store', 'shopping cart', 'payment', 'stripe', 'paypal', 'checkout'],
    weight: 4,
  },
  {
    category: ProjectCategory.BLOG_CMS,
    keywords: ['blog', 'cms', 'content management', 'wordpress', 'strapi', 'sanity', 'contentful'],
    weight: 3,
  },
  {
    category: ProjectCategory.PORTFOLIO,
    keywords: ['portfolio', 'personal website', 'showcase', 'resume', 'cv'],
    weight: 3,
  },
  {
    category: ProjectCategory.LANDING_PAGE,
    keywords: ['landing page', 'marketing page', 'product page', 'conversion', 'lead generation'],
    weight: 2,
  },

  // Mobile Development
  {
    category: ProjectCategory.MOBILE_APP,
    keywords: ['mobile app', 'ios app', 'android app', 'swift', 'kotlin', 'java android'],
    weight: 4,
  },
  {
    category: ProjectCategory.CROSS_PLATFORM,
    keywords: ['react native', 'flutter', 'xamarin', 'ionic', 'cordova', 'cross platform'],
    weight: 3,
  },

  // Backend & APIs
  {
    category: ProjectCategory.API_SERVICE,
    keywords: ['api', 'rest api', 'graphql', 'endpoint', 'web service', 'backend'],
    weight: 3,
  },
  {
    category: ProjectCategory.MICROSERVICE,
    keywords: ['microservice', 'microservices', 'service mesh', 'docker', 'kubernetes'],
    weight: 4,
  },
  {
    category: ProjectCategory.DATABASE_DESIGN,
    keywords: ['database', 'db design', 'schema', 'postgresql', 'mysql', 'mongodb', 'prisma'],
    weight: 3,
  },

  // Data & Analytics
  {
    category: ProjectCategory.DATA_PIPELINE,
    keywords: ['data pipeline', 'etl', 'data processing', 'spark', 'airflow', 'kafka'],
    weight: 4,
  },
  {
    category: ProjectCategory.ANALYTICS_DASHBOARD,
    keywords: ['dashboard', 'analytics', 'reporting', 'charts', 'visualization', 'metrics'],
    weight: 3,
  },
  {
    category: ProjectCategory.ML_MODEL,
    keywords: ['machine learning', 'ml model', 'neural network', 'tensorflow', 'pytorch', 'scikit'],
    weight: 4,
  },
  {
    category: ProjectCategory.DATA_VISUALIZATION,
    keywords: ['data viz', 'visualization', 'd3.js', 'chart.js', 'plotly', 'tableau'],
    weight: 3,
  },

  // DevOps & Infrastructure
  {
    category: ProjectCategory.DEVOPS_AUTOMATION,
    keywords: ['devops', 'ci/cd', 'automation', 'jenkins', 'github actions', 'deployment'],
    weight: 4,
  },
  {
    category: ProjectCategory.INFRASTRUCTURE,
    keywords: ['infrastructure', 'aws', 'azure', 'gcp', 'terraform', 'cloudformation'],
    weight: 3,
  },
  {
    category: ProjectCategory.MONITORING,
    keywords: ['monitoring', 'logging', 'observability', 'prometheus', 'grafana', 'elk stack'],
    weight: 3,
  },

  // AI & Machine Learning
  {
    category: ProjectCategory.AI_CHATBOT,
    keywords: ['chatbot', 'conversational ai', 'dialogue system', 'openai', 'claude', 'gpt'],
    weight: 4,
  },
  {
    category: ProjectCategory.NLP_PROCESSING,
    keywords: ['nlp', 'natural language', 'text processing', 'sentiment analysis', 'spacy', 'nltk'],
    weight: 4,
  },
  {
    category: ProjectCategory.COMPUTER_VISION,
    keywords: ['computer vision', 'image processing', 'opencv', 'yolo', 'object detection'],
    weight: 4,
  },
  {
    category: ProjectCategory.RECOMMENDATION_ENGINE,
    keywords: ['recommendation', 'recommender system', 'collaborative filtering', 'content based'],
    weight: 4,
  },

  // Enterprise & Business
  {
    category: ProjectCategory.ENTERPRISE_SOFTWARE,
    keywords: ['enterprise', 'erp', 'crm', 'business software', 'saas', 'b2b'],
    weight: 3,
  },
  {
    category: ProjectCategory.WORKFLOW_AUTOMATION,
    keywords: ['workflow', 'automation', 'business process', 'zapier', 'make', 'n8n'],
    weight: 3,
  },
  {
    category: ProjectCategory.INTEGRATION,
    keywords: ['integration', 'api integration', 'third party', 'webhook', 'sync'],
    weight: 2,
  },

  // Gaming & Entertainment
  {
    category: ProjectCategory.GAME_DEVELOPMENT,
    keywords: ['game', 'gaming', 'unity', 'unreal', 'game engine', 'phaser'],
    weight: 4,
  },
  {
    category: ProjectCategory.INTERACTIVE_MEDIA,
    keywords: ['interactive', 'media', 'animation', 'three.js', 'webgl', 'creative'],
    weight: 3,
  },

  // Other
  {
    category: ProjectCategory.PROTOTYPE,
    keywords: ['prototype', 'proof of concept', 'poc', 'mvp', 'demo'],
    weight: 2,
  },
];

export class ProjectClassifier {
  private static instance: ProjectClassifier;
  private confidenceThreshold = 0.7;

  private constructor() {}

  static getInstance(): ProjectClassifier {
    if (!ProjectClassifier.instance) {
      ProjectClassifier.instance = new ProjectClassifier();
    }
    return ProjectClassifier.instance;
  }

  /**
   * Classify project intent with confidence scoring
   */
  async classifyProjectIntent(
    intent: string,
    projectId?: string,
    userId?: string
  ): Promise<ClassificationResult> {
    return await withSpan('classifier.classify_project', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'project_classification',
          'project.id': projectId || 'unknown',
          'intent.length': intent.length,
        });

        // First, try rule-based classification
        const ruleBasedResult = await this.classifyWithRules(intent);

        // If confidence is high enough, use rule-based result
        if (ruleBasedResult.confidence >= this.confidenceThreshold) {
          const result: ClassificationResult = {
            ...ruleBasedResult,
            method: 'rule_based',
          };

          await this.logClassification(result, intent, projectId, userId);
          return result;
        }

        // Fallback to LLM classification
        try {
          const llmResult = await this.classifyWithLLM(intent, ruleBasedResult);
          const result: ClassificationResult = {
            ...llmResult,
            method: 'llm',
            alternatives: [
              ...llmResult.alternatives,
              {
                category: ruleBasedResult.category,
                confidence: ruleBasedResult.confidence,
              },
            ],
          };

          await this.logClassification(result, intent, projectId, userId);
          return result;

        } catch (llmError) {
          console.warn('LLM classification failed, using rule-based result:', llmError);

          const result: ClassificationResult = {
            ...ruleBasedResult,
            method: 'rule_based',
            reasoning: `LLM unavailable, using rule-based classification: ${ruleBasedResult.reasoning}`,
          };

          await this.logClassification(result, intent, projectId, userId);
          return result;
        }

      } catch (error) {
        console.error('Classification failed:', error);

        const fallbackResult: ClassificationResult = {
          category: ProjectCategory.UNKNOWN,
          confidence: 0.1,
          method: 'rule_based',
          reasoning: 'Classification failed, defaulting to unknown',
          keywords: [],
          alternatives: [],
        };

        await this.logClassification(fallbackResult, intent, projectId, userId);
        return fallbackResult;
      }
    });
  }

  /**
   * Rule-based classification using keyword matching
   */
  private async classifyWithRules(intent: string): Promise<Omit<ClassificationResult, 'method'>> {
    const normalizedIntent = intent.toLowerCase();
    const scores = new Map<ProjectCategory, number>();
    const matchedKeywords = new Set<string>();

    // Calculate scores for each category
    for (const rule of CLASSIFICATION_RULES) {
      let score = 0;
      const ruleKeywords: string[] = [];

      // Check keyword matches
      for (const keyword of rule.keywords) {
        if (normalizedIntent.includes(keyword.toLowerCase())) {
          score += rule.weight;
          matchedKeywords.add(keyword);
          ruleKeywords.push(keyword);
        }
      }

      // Apply must-have constraints
      if (rule.mustHave) {
        const hasRequired = rule.mustHave.every(required =>
          normalizedIntent.includes(required.toLowerCase())
        );
        if (!hasRequired) {
          score = 0;
        }
      }

      // Apply must-not-have constraints
      if (rule.mustNotHave) {
        const hasExcluded = rule.mustNotHave.some(excluded =>
          normalizedIntent.includes(excluded.toLowerCase())
        );
        if (hasExcluded) {
          score = 0;
        }
      }

      if (score > 0) {
        scores.set(rule.category, (scores.get(rule.category) || 0) + score);
      }
    }

    // Find best match
    let bestCategory = ProjectCategory.UNKNOWN;
    let bestScore = 0;
    const alternatives: Array<{ category: ProjectCategory; confidence: number }> = [];

    for (const [category, score] of scores.entries()) {
      const confidence = Math.min(score / 10, 1.0); // Normalize to 0-1

      if (score > bestScore) {
        if (bestScore > 0) {
          alternatives.push({
            category: bestCategory,
            confidence: Math.min(bestScore / 10, 1.0),
          });
        }
        bestCategory = category;
        bestScore = score;
      } else if (score > 0) {
        alternatives.push({ category, confidence });
      }
    }

    const confidence = Math.min(bestScore / 10, 1.0);
    const keywords = Array.from(matchedKeywords);

    return {
      category: bestCategory,
      confidence,
      reasoning: `Matched keywords: ${keywords.join(', ')} (score: ${bestScore})`,
      keywords,
      alternatives: alternatives.sort((a, b) => b.confidence - a.confidence).slice(0, 3),
    };
  }

  /**
   * LLM-based classification for uncertain cases
   */
  private async classifyWithLLM(
    intent: string,
    ruleBasedResult: Omit<ClassificationResult, 'method'>
  ): Promise<Omit<ClassificationResult, 'method'>> {
    try {
      const openaiKey = await getSecret('openai_api_key');

      const prompt = `
You are an expert project classifier. Analyze the following project intent and classify it into one of these categories:

Categories:
${Object.values(ProjectCategory).map(cat => `- ${cat}`).join('\n')}

Project Intent: "${intent}"

Rule-based analysis suggested: ${ruleBasedResult.category} (confidence: ${ruleBasedResult.confidence})
Matched keywords: ${ruleBasedResult.keywords.join(', ')}

Provide your classification in this JSON format:
{
  "category": "selected_category",
  "confidence": 0.8,
  "reasoning": "Why you chose this category",
  "alternatives": [
    {"category": "alternative1", "confidence": 0.6},
    {"category": "alternative2", "confidence": 0.4}
  ]
}

Consider:
1. The specific technologies and frameworks mentioned
2. The overall goal and use case
3. The complexity and scope implied
4. Industry-standard categorizations

Be precise and confident in your classification.`;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4',
          messages: [
            {
              role: 'system',
              content: 'You are an expert project classifier. Always respond with valid JSON.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1,
          max_tokens: 500,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices[0]?.message?.content;

      if (!content) {
        throw new Error('No response from OpenAI');
      }

      // Parse LLM response
      const llmResult = JSON.parse(content);

      // Validate and normalize the result
      const category = this.validateCategory(llmResult.category);
      const confidence = Math.max(0, Math.min(1, llmResult.confidence || 0.5));

      return {
        category,
        confidence,
        reasoning: llmResult.reasoning || 'LLM classification',
        keywords: this.extractKeywordsFromReasoning(llmResult.reasoning || ''),
        alternatives: (llmResult.alternatives || [])
          .map((alt: any) => ({
            category: this.validateCategory(alt.category),
            confidence: Math.max(0, Math.min(1, alt.confidence || 0)),
          }))
          .filter((alt: any) => alt.category !== ProjectCategory.UNKNOWN)
          .slice(0, 3),
      };

    } catch (error) {
      console.error('LLM classification error:', error);
      throw error;
    }
  }

  /**
   * Validate and normalize category values
   */
  private validateCategory(category: string): ProjectCategory {
    const normalizedCategory = category?.toLowerCase().replace(/[-\s]/g, '_');

    for (const validCategory of Object.values(ProjectCategory)) {
      if (validCategory === normalizedCategory) {
        return validCategory as ProjectCategory;
      }
    }

    return ProjectCategory.UNKNOWN;
  }

  /**
   * Extract keywords from LLM reasoning
   */
  private extractKeywordsFromReasoning(reasoning: string): string[] {
    const keywords: string[] = [];
    const lowerReasoning = reasoning.toLowerCase();

    // Extract quoted terms
    const quoted = reasoning.match(/"([^"]+)"/g);
    if (quoted) {
      keywords.push(...quoted.map(q => q.replace(/"/g, '')));
    }

    // Extract common technology terms
    const techTerms = [
      'react', 'vue', 'angular', 'next.js', 'express', 'fastapi',
      'typescript', 'javascript', 'python', 'java', 'go',
      'mongodb', 'postgresql', 'mysql', 'redis',
      'aws', 'azure', 'gcp', 'docker', 'kubernetes',
      'api', 'rest', 'graphql', 'microservice',
      'ml', 'ai', 'nlp', 'computer vision',
    ];

    for (const term of techTerms) {
      if (lowerReasoning.includes(term)) {
        keywords.push(term);
      }
    }

    return [...new Set(keywords)]; // Remove duplicates
  }

  /**
   * Store classification result in project
   */
  async storeClassificationResult(
    projectId: string,
    result: ClassificationResult
  ): Promise<void> {
    try {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          category: result.category,
          metadata: {
            ...((await prisma.project.findUnique({ where: { id: projectId } }))?.metadata || {}),
            classification: {
              confidence: result.confidence,
              method: result.method,
              reasoning: result.reasoning,
              keywords: result.keywords,
              alternatives: result.alternatives,
              classifiedAt: new Date().toISOString(),
            },
          },
        },
      });

      console.log(`Stored classification for project ${projectId}: ${result.category}`);
    } catch (error) {
      console.error('Failed to store classification result:', error);
      throw error;
    }
  }

  /**
   * Log classification for audit and learning
   */
  private async logClassification(
    result: ClassificationResult,
    intent: string,
    projectId?: string,
    userId?: string
  ): Promise<void> {
    try {
      await auditLogger.logSystem('system.project_classified', {
        projectId,
        category: result.category,
        confidence: result.confidence,
        method: result.method,
        intentLength: intent.length,
        keywordCount: result.keywords.length,
        alternativeCount: result.alternatives.length,
      });
    } catch (error) {
      console.warn('Failed to log classification:', error);
    }
  }

  /**
   * Get classification statistics for improvements
   */
  async getClassificationStats(timeRange?: { start: Date; end: Date }): Promise<{
    totalClassifications: number;
    byCategory: Array<{ category: ProjectCategory; count: number }>;
    byMethod: Array<{ method: string; count: number }>;
    averageConfidence: number;
    lowConfidenceCount: number;
  }> {
    // This would query audit logs or a dedicated classification tracking table
    // For now, return mock data structure
    return {
      totalClassifications: 0,
      byCategory: [],
      byMethod: [],
      averageConfidence: 0,
      lowConfidenceCount: 0,
    };
  }

  /**
   * Update confidence threshold based on performance
   */
  setConfidenceThreshold(threshold: number): void {
    this.confidenceThreshold = Math.max(0.1, Math.min(1.0, threshold));
  }

  /**
   * Get current confidence threshold
   */
  getConfidenceThreshold(): number {
    return this.confidenceThreshold;
  }
}

// Export singleton instance
export const projectClassifier = ProjectClassifier.getInstance();