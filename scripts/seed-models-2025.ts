/**
 * Model Registry Seeder for 2025 AI Models
 *
 * Seeds the database with the latest AI model versions and configurations
 * for the AI orchestration layer.
 */

import { PrismaClient } from '@prisma/client';
import { ModelRole, ModelProvider } from '@/services/models/registry';

const prisma = new PrismaClient();

interface ModelSeedData {
  name: string;
  provider: string;
  role: string;
  versionTag: string;
  status: 'stable' | 'canary' | 'disabled';
  config: Record<string, any>;
  capabilities: string[];
}

const MODEL_SEEDS: ModelSeedData[] = [
  // Claude - Code Architect & Guardrails
  {
    name: 'Claude',
    provider: ModelProvider.ANTHROPIC,
    role: ModelRole.CODE_ARCHITECT,
    versionTag: 'claude-4.xx',
    status: 'stable',
    config: {
      baseUrl: 'https://api.anthropic.com',
      maxTokens: 8192,
      temperature: 0.1,
      topP: 0.95,
      timeout: 30000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
      },
      security: {
        allowDataCollection: false,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'code_generation',
      'code_review',
      'security_analysis',
      'architectural_guidance',
      'guardrails_enforcement',
      'best_practices',
      'refactoring',
      'debugging',
    ],
  },

  // GPT (OpenAI) - Conversational UX & Generalist
  {
    name: 'GPT (OpenAI)',
    provider: ModelProvider.OPENAI,
    role: ModelRole.CONVERSATIONAL_UX,
    versionTag: 'gpt-5.0',
    status: 'stable',
    config: {
      baseUrl: 'https://api.openai.com/v1',
      maxTokens: 4096,
      temperature: 0.7,
      topP: 0.9,
      frequencyPenalty: 0.1,
      presencePenalty: 0.1,
      timeout: 30000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 60,
        tokensPerMinute: 150000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'conversational_ui',
      'natural_language',
      'content_generation',
      'summarization',
      'translation',
      'creative_writing',
      'general_assistance',
      'reasoning',
    ],
  },

  // Gemini - Multimodal Designer
  {
    name: 'Gemini',
    provider: ModelProvider.GOOGLE,
    role: ModelRole.MULTIMODAL_DESIGNER,
    versionTag: 'gemini-2.5-pro',
    status: 'stable',
    config: {
      baseUrl: 'https://generativelanguage.googleapis.com',
      maxTokens: 8192,
      temperature: 0.4,
      topP: 0.8,
      timeout: 45000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 40,
        tokensPerMinute: 120000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'multimodal_processing',
      'image_generation',
      'image_analysis',
      'ui_design',
      'visual_content',
      'diagram_creation',
      'layout_design',
      'accessibility_review',
    ],
  },

  // Grok - Systems Debugger & Infra
  {
    name: 'Grok',
    provider: ModelProvider.XAI,
    role: ModelRole.SYSTEMS_DEBUGGER,
    versionTag: 'grok-4.0',
    status: 'canary',
    config: {
      baseUrl: 'https://api.x.ai',
      maxTokens: 4096,
      temperature: 0.2,
      topP: 0.9,
      timeout: 30000,
      retries: 2,
      rateLimits: {
        requestsPerMinute: 30,
        tokensPerMinute: 80000,
      },
      security: {
        allowDataCollection: false,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 14,
      },
    },
    capabilities: [
      'systems_debugging',
      'infrastructure_analysis',
      'performance_optimization',
      'monitoring_setup',
      'troubleshooting',
      'log_analysis',
      'devops_automation',
      'real_time_analysis',
    ],
  },

  // Perplexity - Research Fetcher
  {
    name: 'Perplexity',
    provider: ModelProvider.PERPLEXITY,
    role: ModelRole.RESEARCH_FETCHER,
    versionTag: 'ppx-2.5',
    status: 'stable',
    config: {
      baseUrl: 'https://api.perplexity.ai',
      maxTokens: 4096,
      temperature: 0.3,
      topP: 0.9,
      timeout: 60000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 20,
        tokensPerMinute: 60000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 60,
      },
    },
    capabilities: [
      'web_search',
      'research_synthesis',
      'fact_checking',
      'citation_generation',
      'current_events',
      'academic_research',
      'market_analysis',
      'trend_identification',
    ],
  },

  // DeepSeek - Code Generator & Optimizer
  {
    name: 'DeepSeek',
    provider: ModelProvider.DEEPSEEK,
    role: ModelRole.CODE_GENERATOR,
    versionTag: 'deepseek-v1.2',
    status: 'stable',
    config: {
      baseUrl: 'https://api.deepseek.com',
      maxTokens: 8192,
      temperature: 0.1,
      topP: 0.95,
      timeout: 30000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 45,
        tokensPerMinute: 90000,
      },
      security: {
        allowDataCollection: false,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'code_generation',
      'code_optimization',
      'algorithm_design',
      'performance_tuning',
      'competitive_programming',
      'mathematical_computation',
      'data_structures',
      'system_design',
    ],
  },

  // Mistral - Security & Policy Checker
  {
    name: 'Mistral',
    provider: ModelProvider.MISTRAL,
    role: ModelRole.SECURITY_CHECKER,
    versionTag: 'mixtral-8x7b-v2',
    status: 'stable',
    config: {
      baseUrl: 'https://api.mistral.ai',
      maxTokens: 4096,
      temperature: 0.1,
      topP: 0.9,
      timeout: 30000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 40,
        tokensPerMinute: 100000,
      },
      security: {
        allowDataCollection: false,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 90,
      },
    },
    capabilities: [
      'security_analysis',
      'vulnerability_detection',
      'policy_enforcement',
      'compliance_checking',
      'threat_modeling',
      'penetration_testing',
      'cryptographic_review',
      'access_control',
    ],
  },

  // Llama - Knowledge Base Synthesizer
  {
    name: 'Llama',
    provider: ModelProvider.META,
    role: ModelRole.KNOWLEDGE_SYNTHESIZER,
    versionTag: 'llama-3.0',
    status: 'stable',
    config: {
      baseUrl: 'https://api.meta.ai',
      maxTokens: 8192,
      temperature: 0.5,
      topP: 0.9,
      timeout: 45000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 35,
        tokensPerMinute: 120000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 45,
      },
    },
    capabilities: [
      'knowledge_synthesis',
      'information_extraction',
      'document_analysis',
      'concept_mapping',
      'learning_materials',
      'educational_content',
      'research_compilation',
      'knowledge_graphs',
    ],
  },

  // Cohere - Retriever & Context Engine
  {
    name: 'Cohere',
    provider: ModelProvider.COHERE,
    role: ModelRole.RETRIEVER_ENGINE,
    versionTag: 'command-r-v2.3',
    status: 'stable',
    config: {
      baseUrl: 'https://api.cohere.ai',
      maxTokens: 4096,
      temperature: 0.3,
      topP: 0.8,
      timeout: 30000,
      retries: 3,
      rateLimits: {
        requestsPerMinute: 50,
        tokensPerMinute: 100000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'semantic_search',
      'retrieval_augmentation',
      'context_ranking',
      'embedding_generation',
      'similarity_matching',
      'vector_operations',
      'information_retrieval',
      'relevance_scoring',
    ],
  },

  // Stability AI - Creative Asset Generator
  {
    name: 'Stability AI',
    provider: ModelProvider.STABILITY,
    role: ModelRole.CREATIVE_GENERATOR,
    versionTag: 'sdxl-v1.0',
    status: 'stable',
    config: {
      baseUrl: 'https://api.stability.ai',
      maxTokens: 2048,
      temperature: 0.8,
      topP: 0.9,
      timeout: 120000, // Longer timeout for image generation
      retries: 2,
      rateLimits: {
        requestsPerMinute: 10,
        tokensPerMinute: 20000,
      },
      security: {
        allowDataCollection: true,
        requireSecureContext: true,
        contentFiltering: true,
      },
      provenance: {
        trackInputs: true,
        trackOutputs: true,
        retentionDays: 30,
      },
    },
    capabilities: [
      'image_generation',
      'art_creation',
      'style_transfer',
      'logo_design',
      'illustration',
      'concept_art',
      'texture_generation',
      'visual_effects',
    ],
  },
];

async function seedModels() {
  console.log('🌱 Seeding 2025 AI models...');

  try {
    // Clear existing models (optional - comment out if you want to preserve existing data)
    await prisma.model.deleteMany({});
    console.log('Cleared existing models');

    const createdModels = [];

    for (const modelData of MODEL_SEEDS) {
      console.log(`Creating model: ${modelData.name} (${modelData.versionTag})`);

      const model = await prisma.model.create({
        data: {
          name: modelData.name,
          provider: modelData.provider,
          role: modelData.role,
          versionTag: modelData.versionTag,
          config: modelData.config,
          capabilities: modelData.capabilities,
          status: modelData.status,
          isActive: true,
        },
      });

      createdModels.push(model);
      console.log(`✅ Created: ${model.name} (${model.id})`);
    }

    console.log(`\n🎉 Successfully seeded ${createdModels.length} AI models!`);

    // Display summary
    const summary = createdModels.reduce((acc, model) => {
      acc[model.status] = (acc[model.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log('\n📊 Summary:');
    Object.entries(summary).forEach(([status, count]) => {
      console.log(`  ${status}: ${count} models`);
    });

    console.log('\n🔧 Model roles covered:');
    const roles = [...new Set(createdModels.map(m => m.role))];
    roles.forEach(role => {
      console.log(`  • ${role}`);
    });

  } catch (error) {
    console.error('❌ Error seeding models:', error);
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

// Run the seeder
if (require.main === module) {
  seedModels()
    .then(() => {
      console.log('\n✨ Model seeding completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Model seeding failed:', error);
      process.exit(1);
    });
}

export { seedModels, MODEL_SEEDS };