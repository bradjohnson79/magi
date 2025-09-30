/**
 * Template Management Service
 *
 * Handles template creation, storage, and scaffolding with intelligent
 * stack recommendations from the AI Matrix intuition layer.
 */

import { prisma } from '@/lib/prisma';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';
import { auditLogger } from '@/services/audit/logger';
import { stackRecommender } from '@/services/orch/recommender';
import { ProjectCategory } from '@/services/orch/classifier';
import { RecommendedStack } from '@/services/orch/recommender';

export interface TemplateCreateInput {
  name: string;
  description?: string;
  category: string;
  tags: string[];
  config: TemplateConfig;
  files: TemplateFile[];
  dependencies?: string[];
  isPublic?: boolean;
  createdBy: string;
}

export interface TemplateConfig {
  projectCategory: ProjectCategory;
  stack: RecommendedStack;
  variables: TemplateVariable[];
  scripts: Record<string, string>;
  environment: Record<string, string>;
  ports: number[];
  services?: TemplateService[];
}

export interface TemplateVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'select' | 'multiselect';
  label: string;
  description?: string;
  defaultValue?: any;
  required: boolean;
  options?: string[];
  validation?: {
    pattern?: string;
    min?: number;
    max?: number;
  };
}

export interface TemplateFile {
  path: string;
  content: string;
  encoding?: 'utf8' | 'base64';
  template?: boolean; // If true, content contains template variables
  executable?: boolean;
}

export interface TemplateService {
  name: string;
  image?: string;
  ports?: number[];
  environment?: Record<string, string>;
  volumes?: string[];
  dependsOn?: string[];
}

export interface ScaffoldOptions {
  projectName: string;
  variables?: Record<string, any>;
  targetDirectory?: string;
  userId: string;
  workspaceId?: string;
}

export class TemplateManager {
  private static instance: TemplateManager;

  public static getInstance(): TemplateManager {
    if (!TemplateManager.instance) {
      TemplateManager.instance = new TemplateManager();
    }
    return TemplateManager.instance;
  }

  /**
   * Create a new template
   */
  async createTemplate(input: TemplateCreateInput): Promise<any> {
    return withSpan('template.create', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_create',
          [SPAN_ATTRIBUTES.USER_ID]: input.createdBy,
          'template.category': input.category,
          'template.files_count': input.files.length,
        });

        // Validate template structure
        this.validateTemplate(input);

        const template = await prisma.template.create({
          data: {
            name: input.name,
            description: input.description,
            category: input.category,
            tags: input.tags,
            config: input.config,
            files: input.files,
            dependencies: input.dependencies || [],
            isPublic: input.isPublic || false,
            createdBy: input.createdBy,
          },
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        // Log audit
        await auditLogger.log({
          userId: input.createdBy,
          action: 'template.created',
          resource: 'template',
          resourceId: template.id,
          details: {
            name: template.name,
            category: template.category,
            filesCount: input.files.length,
          },
          severity: 'info',
          outcome: 'success',
        });

        return template;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get template by ID
   */
  async getTemplate(templateId: string, userId?: string): Promise<any> {
    return withSpan('template.get', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_get',
          [SPAN_ATTRIBUTES.USER_ID]: userId || 'anonymous',
          'template.id': templateId,
        });

        const template = await prisma.template.findUnique({
          where: { id: templateId },
          include: {
            creator: {
              select: {
                id: true,
                name: true,
                email: true,
              },
            },
          },
        });

        if (!template) {
          throw new Error('Template not found');
        }

        // Check access permissions
        if (!template.isPublic && template.createdBy !== userId) {
          throw new Error('Access denied');
        }

        // Increment download count if accessing files
        await prisma.template.update({
          where: { id: templateId },
          data: { downloads: { increment: 1 } },
        });

        return template;
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * List templates with filtering
   */
  async listTemplates(options: {
    category?: string;
    tags?: string[];
    search?: string;
    userId?: string;
    includePrivate?: boolean;
    limit?: number;
    offset?: number;
  } = {}): Promise<{ templates: any[]; total: number }> {
    return withSpan('template.list', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_list',
          'query.category': options.category || 'all',
          'query.tags_count': options.tags?.length || 0,
        });

        const where: any = {};

        // Public templates or user's private templates
        if (options.includePrivate && options.userId) {
          where.OR = [
            { isPublic: true },
            { createdBy: options.userId },
          ];
        } else {
          where.isPublic = true;
        }

        // Category filter
        if (options.category) {
          where.category = options.category;
        }

        // Tags filter
        if (options.tags && options.tags.length > 0) {
          where.tags = {
            hasEvery: options.tags,
          };
        }

        // Search filter
        if (options.search) {
          where.OR = [
            { name: { contains: options.search, mode: 'insensitive' } },
            { description: { contains: options.search, mode: 'insensitive' } },
            { tags: { has: options.search } },
          ];
        }

        const [templates, total] = await Promise.all([
          prisma.template.findMany({
            where,
            include: {
              creator: {
                select: {
                  id: true,
                  name: true,
                  email: true,
                },
              },
            },
            orderBy: [
              { isOfficial: 'desc' },
              { downloads: 'desc' },
              { rating: 'desc' },
              { createdAt: 'desc' },
            ],
            take: options.limit || 20,
            skip: options.offset || 0,
          }),
          prisma.template.count({ where }),
        ]);

        return { templates, total };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Scaffold project from template
   */
  async scaffoldProject(
    templateId: string,
    options: ScaffoldOptions
  ): Promise<{
    projectId: string;
    files: TemplateFile[];
    config: any;
  }> {
    return withSpan('template.scaffold', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_scaffold',
          [SPAN_ATTRIBUTES.USER_ID]: options.userId,
          'template.id': templateId,
          'project.name': options.projectName,
        });

        // Get template
        const template = await this.getTemplate(templateId, options.userId);

        // Process template variables
        const processedFiles = this.processTemplateFiles(
          template.files as TemplateFile[],
          {
            projectName: options.projectName,
            ...options.variables,
          }
        );

        // Create project
        const project = await prisma.project.create({
          data: {
            name: options.projectName,
            category: (template.config as TemplateConfig).projectCategory,
            type: 'template',
            ownerId: options.userId,
            workspaceId: options.workspaceId,
            metadata: {
              templateId,
              templateName: template.name,
              scaffoldedAt: new Date().toISOString(),
              variables: options.variables,
            },
            config: {
              template: template.config,
              stack: (template.config as TemplateConfig).stack,
            },
          },
        });

        // Log activity
        await auditLogger.log({
          userId: options.userId,
          action: 'project.scaffolded_from_template',
          resource: 'project',
          resourceId: project.id,
          details: {
            templateId,
            templateName: template.name,
            projectName: options.projectName,
            filesCount: processedFiles.length,
          },
          severity: 'info',
          outcome: 'success',
        });

        return {
          projectId: project.id,
          files: processedFiles,
          config: template.config,
        };
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Create template from project category
   */
  async createTemplateFromCategory(
    category: ProjectCategory,
    name: string,
    userId: string,
    options: {
      description?: string;
      userPlan?: string;
      teamSize?: number;
      preferences?: Record<string, any>;
    } = {}
  ): Promise<any> {
    return withSpan('template.create_from_category', async (span) => {
      try {
        addSpanAttributes(span, {
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'template_create_from_category',
          [SPAN_ATTRIBUTES.USER_ID]: userId,
          'template.category': category,
        });

        // Get stack recommendation
        const stack = await stackRecommender.recommendStack(category, {
          userId,
          userPlan: options.userPlan,
          teamSize: options.teamSize,
          preferences: options.preferences,
        });

        // Generate template files based on stack
        const files = await this.generateTemplateFiles(category, stack);

        // Create template config
        const config: TemplateConfig = {
          projectCategory: category,
          stack,
          variables: this.getDefaultVariables(category),
          scripts: this.getDefaultScripts(category, stack),
          environment: this.getDefaultEnvironment(category, stack),
          ports: this.getDefaultPorts(category, stack),
          services: this.getDefaultServices(category, stack),
        };

        // Create template
        const templateInput: TemplateCreateInput = {
          name,
          description: options.description || `${category} template with ${stack.frontend.framework}`,
          category: category,
          tags: this.generateTags(category, stack),
          config,
          files,
          dependencies: this.getDependencies(stack),
          isPublic: false,
          createdBy: userId,
        };

        return await this.createTemplate(templateInput);
      } catch (error) {
        span?.recordException?.(error as Error);
        throw error;
      }
    });
  }

  /**
   * Get official templates
   */
  async getOfficialTemplates(): Promise<any[]> {
    return await prisma.template.findMany({
      where: {
        isOfficial: true,
        isPublic: true,
      },
      include: {
        creator: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
      },
      orderBy: [
        { downloads: 'desc' },
        { rating: 'desc' },
      ],
    });
  }

  /**
   * Rate template
   */
  async rateTemplate(
    templateId: string,
    userId: string,
    rating: number
  ): Promise<void> {
    if (rating < 1 || rating > 5) {
      throw new Error('Rating must be between 1 and 5');
    }

    // For simplicity, just update the average rating
    // In production, you'd want a separate ratings table
    const template = await prisma.template.findUnique({
      where: { id: templateId },
      select: { rating: true, downloads: true },
    });

    if (!template) {
      throw new Error('Template not found');
    }

    const currentRating = Number(template.rating) || 0;
    const ratingsCount = template.downloads || 1;
    const newRating = ((currentRating * ratingsCount) + rating) / (ratingsCount + 1);

    await prisma.template.update({
      where: { id: templateId },
      data: { rating: newRating },
    });
  }

  /**
   * Validate template structure
   */
  private validateTemplate(input: TemplateCreateInput): void {
    if (!input.name || input.name.length < 2) {
      throw new Error('Template name must be at least 2 characters');
    }

    if (!input.category) {
      throw new Error('Template category is required');
    }

    if (!input.files || input.files.length === 0) {
      throw new Error('Template must have at least one file');
    }

    // Validate files
    input.files.forEach((file, index) => {
      if (!file.path) {
        throw new Error(`File ${index} must have a path`);
      }

      if (!file.content && file.encoding !== 'base64') {
        throw new Error(`File ${index} must have content`);
      }
    });

    // Validate config
    if (!input.config) {
      throw new Error('Template config is required');
    }
  }

  /**
   * Process template files with variable substitution
   */
  private processTemplateFiles(
    files: TemplateFile[],
    variables: Record<string, any>
  ): TemplateFile[] {
    return files.map(file => {
      if (!file.template) {
        return file;
      }

      let processedContent = file.content;

      // Replace template variables
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        processedContent = processedContent.replace(regex, String(value));
      });

      // Replace path variables
      let processedPath = file.path;
      Object.entries(variables).forEach(([key, value]) => {
        const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
        processedPath = processedPath.replace(regex, String(value));
      });

      return {
        ...file,
        path: processedPath,
        content: processedContent,
      };
    });
  }

  /**
   * Generate template files for category and stack
   */
  private async generateTemplateFiles(
    category: ProjectCategory,
    stack: RecommendedStack
  ): Promise<TemplateFile[]> {
    const files: TemplateFile[] = [];

    // Package.json for frontend projects
    if (stack.frontend) {
      files.push({
        path: 'package.json',
        content: JSON.stringify(
          this.generatePackageJson(category, stack),
          null,
          2
        ),
        template: true,
      });
    }

    // README.md
    files.push({
      path: 'README.md',
      content: this.generateReadme(category, stack),
      template: true,
    });

    // Environment file
    files.push({
      path: '.env.example',
      content: this.generateEnvFile(category, stack),
      template: true,
    });

    // Docker files
    if (stack.complexity !== 'simple') {
      files.push({
        path: 'Dockerfile',
        content: this.generateDockerfile(category, stack),
        template: false,
      });

      files.push({
        path: 'docker-compose.yml',
        content: this.generateDockerCompose(category, stack),
        template: true,
      });
    }

    // Frontend-specific files
    if (stack.frontend) {
      files.push(...this.generateFrontendFiles(category, stack));
    }

    // Backend-specific files
    if (stack.backend) {
      files.push(...this.generateBackendFiles(category, stack));
    }

    return files;
  }

  /**
   * Generate package.json content
   */
  private generatePackageJson(category: ProjectCategory, stack: RecommendedStack): any {
    const packageJson: any = {
      name: '{{projectName}}',
      version: '1.0.0',
      description: '{{description}}',
      scripts: {
        dev: 'next dev',
        build: 'next build',
        start: 'next start',
        lint: 'next lint',
        test: 'jest',
        'test:watch': 'jest --watch',
      },
      dependencies: {},
      devDependencies: {},
    };

    // Add dependencies based on stack
    if (stack.frontend.framework === 'Next.js') {
      packageJson.dependencies = {
        next: '^14.0.0',
        react: '^18.0.0',
        'react-dom': '^18.0.0',
        ...packageJson.dependencies,
      };
    }

    if (stack.frontend.language === 'TypeScript') {
      packageJson.devDependencies = {
        '@types/node': '^20.0.0',
        '@types/react': '^18.0.0',
        '@types/react-dom': '^18.0.0',
        typescript: '^5.0.0',
        ...packageJson.devDependencies,
      };
    }

    if (stack.frontend.styling === 'Tailwind CSS') {
      packageJson.dependencies.tailwindcss = '^3.0.0';
      packageJson.devDependencies = {
        autoprefixer: '^10.0.0',
        postcss: '^8.0.0',
        ...packageJson.devDependencies,
      };
    }

    return packageJson;
  }

  /**
   * Generate README.md content
   */
  private generateReadme(category: ProjectCategory, stack: RecommendedStack): string {
    return `# {{projectName}}

{{description}}

## Tech Stack

- **Frontend**: ${stack.frontend.framework} with ${stack.frontend.language}
- **Styling**: ${stack.frontend.styling}
- **Database**: ${stack.database.primary}
- **Authentication**: ${stack.auth.provider}
- **Hosting**: ${stack.hosting.platform}

## Getting Started

1. Clone the repository
2. Install dependencies: \`npm install\`
3. Copy \`.env.example\` to \`.env\` and fill in your environment variables
4. Run the development server: \`npm run dev\`

## Project Structure

\`\`\`
{{projectName}}/
├── src/
│   ├── components/
│   ├── pages/
│   ├── styles/
│   └── utils/
├── public/
├── .env.example
├── package.json
└── README.md
\`\`\`

## Features

- Modern ${stack.frontend.framework} setup
- ${stack.frontend.language} for type safety
- ${stack.frontend.styling} for styling
- ${stack.auth.provider} authentication
- ${stack.database.primary} database integration
- Responsive design
- SEO optimized

## Deployment

Deploy to ${stack.hosting.platform} by following their deployment guide.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

MIT License
`;
  }

  /**
   * Generate environment variables file
   */
  private generateEnvFile(category: ProjectCategory, stack: RecommendedStack): string {
    const envVars = [
      '# Database',
      'DATABASE_URL="postgresql://username:password@localhost:5432/{{projectName}}"',
      '',
      '# Authentication',
      'NEXTAUTH_SECRET="your-secret-here"',
      'NEXTAUTH_URL="http://localhost:3000"',
      '',
    ];

    if (stack.auth.provider === 'Auth0') {
      envVars.push(
        '# Auth0',
        'AUTH0_SECRET="your-auth0-secret"',
        'AUTH0_BASE_URL="http://localhost:3000"',
        'AUTH0_ISSUER_BASE_URL="https://your-domain.auth0.com"',
        'AUTH0_CLIENT_ID="your-client-id"',
        'AUTH0_CLIENT_SECRET="your-client-secret"',
        ''
      );
    }

    if (category === ProjectCategory.E_COMMERCE) {
      envVars.push(
        '# Payment Processing',
        'STRIPE_PUBLISHABLE_KEY="pk_test_..."',
        'STRIPE_SECRET_KEY="sk_test_..."',
        'STRIPE_WEBHOOK_SECRET="whsec_..."',
        ''
      );
    }

    return envVars.join('\n');
  }

  /**
   * Generate Dockerfile
   */
  private generateDockerfile(category: ProjectCategory, stack: RecommendedStack): string {
    return `FROM node:18-alpine AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

FROM node:18-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
ENV NODE_ENV production
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
`;
  }

  /**
   * Generate docker-compose.yml
   */
  private generateDockerCompose(category: ProjectCategory, stack: RecommendedStack): string {
    return `version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=postgresql://postgres:password@db:5432/{{projectName}}
    depends_on:
      - db

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: {{projectName}}
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

volumes:
  postgres_data:
`;
  }

  /**
   * Generate frontend-specific files
   */
  private generateFrontendFiles(category: ProjectCategory, stack: RecommendedStack): TemplateFile[] {
    const files: TemplateFile[] = [];

    // Next.js config
    if (stack.frontend.framework === 'Next.js') {
      files.push({
        path: 'next.config.js',
        content: `/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    appDir: true,
  },
}

module.exports = nextConfig
`,
        template: false,
      });
    }

    // TypeScript config
    if (stack.frontend.language === 'TypeScript') {
      files.push({
        path: 'tsconfig.json',
        content: JSON.stringify({
          compilerOptions: {
            target: 'es5',
            lib: ['dom', 'dom.iterable', 'es6'],
            allowJs: true,
            skipLibCheck: true,
            strict: true,
            forceConsistentCasingInFileNames: true,
            noEmit: true,
            esModuleInterop: true,
            module: 'esnext',
            moduleResolution: 'node',
            resolveJsonModule: true,
            isolatedModules: true,
            jsx: 'preserve',
            incremental: true,
            plugins: [{ name: 'next' }],
            baseUrl: '.',
            paths: {
              '@/*': ['./src/*'],
            },
          },
          include: ['next-env.d.ts', '**/*.ts', '**/*.tsx', '.next/types/**/*.ts'],
          exclude: ['node_modules'],
        }, null, 2),
        template: false,
      });
    }

    return files;
  }

  /**
   * Generate backend-specific files
   */
  private generateBackendFiles(category: ProjectCategory, stack: RecommendedStack): TemplateFile[] {
    // Implementation would depend on backend framework
    return [];
  }

  /**
   * Helper methods for template generation
   */
  private getDefaultVariables(category: ProjectCategory): TemplateVariable[] {
    return [
      {
        name: 'projectName',
        type: 'string',
        label: 'Project Name',
        description: 'The name of your project',
        required: true,
        validation: {
          pattern: '^[a-z0-9-]+$',
        },
      },
      {
        name: 'description',
        type: 'string',
        label: 'Description',
        description: 'A brief description of your project',
        required: false,
      },
    ];
  }

  private getDefaultScripts(category: ProjectCategory, stack: RecommendedStack): Record<string, string> {
    return {
      dev: 'npm run dev',
      build: 'npm run build',
      start: 'npm start',
      test: 'npm test',
    };
  }

  private getDefaultEnvironment(category: ProjectCategory, stack: RecommendedStack): Record<string, string> {
    return {
      NODE_ENV: 'development',
      PORT: '3000',
    };
  }

  private getDefaultPorts(category: ProjectCategory, stack: RecommendedStack): number[] {
    return [3000];
  }

  private getDefaultServices(category: ProjectCategory, stack: RecommendedStack): TemplateService[] {
    return [];
  }

  private generateTags(category: ProjectCategory, stack: RecommendedStack): string[] {
    const tags = [category, stack.frontend.framework];

    if (stack.frontend.language) {
      tags.push(stack.frontend.language.toLowerCase());
    }

    if (stack.database.primary) {
      tags.push(stack.database.primary.toLowerCase());
    }

    return tags;
  }

  private getDependencies(stack: RecommendedStack): string[] {
    return [];
  }
}

export const templateManager = TemplateManager.getInstance();