/**
 * Templates and Scaffolding Tests
 *
 * Tests template creation, variable substitution, and AI-powered scaffolding
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { templatesManager } from '@/services/templates/manager';
import { ProjectCategory } from '@/services/orch/classifier';
import { prisma } from '@/lib/db';

// Mock Prisma
vi.mock('@/lib/db', () => ({
  prisma: {
    template: {
      create: vi.fn(),
      findUnique: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    project: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

// Mock workspace manager
vi.mock('@/services/workspace/manager', () => ({
  workspaceManager: {
    checkAccess: vi.fn(),
    canEdit: vi.fn(),
  },
}));

// Mock stack recommender
vi.mock('@/services/orch/recommender', () => ({
  stackRecommender: {
    getRecommendation: vi.fn(),
  },
}));

// Mock activity logger
vi.mock('@/services/activity/logger', () => ({
  activityLogger: {
    logActivity: vi.fn(),
  },
}));

describe('Templates and Scaffolding', () => {
  const mockTemplate = {
    id: 'template-1',
    name: 'React Component',
    description: 'Basic React component template',
    category: ProjectCategory.WEB_APP,
    files: {
      'src/components/{{componentName}}.tsx': `import React from 'react';

interface {{componentName}}Props {
  // Define your props here
}

export default function {{componentName}}({ }: {{componentName}}Props) {
  return (
    <div className="{{componentName}}-container">
      <h1>{{title}}</h1>
    </div>
  );
}
`,
      'src/components/{{componentName}}.test.tsx': `import { render, screen } from '@testing-library/react';
import {{componentName}} from './{{componentName}}';

describe('{{componentName}}', () => {
  it('should render successfully', () => {
    render(<{{componentName}} />);
    expect(screen.getByText('{{title}}')).toBeInTheDocument();
  });
});
`,
    },
    variables: [
      {
        name: 'componentName',
        type: 'string',
        required: true,
        description: 'Name of the React component',
        validation: '^[A-Z][a-zA-Z0-9]*$',
      },
      {
        name: 'title',
        type: 'string',
        required: false,
        default: 'Hello World',
        description: 'Default title text',
      },
    ],
    metadata: {},
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockProject = {
    id: 'project-1',
    workspaceId: 'workspace-1',
    name: 'Test Project',
    category: ProjectCategory.WEB_APP,
  };

  beforeEach(() => {
    vi.clearAllMocks();

    // Mock project access
    (prisma.project.findUnique as any).mockResolvedValue(mockProject);

    // Mock workspace access
    const { workspaceManager } = require('@/services/workspace/manager');
    workspaceManager.checkAccess.mockResolvedValue(true);
    workspaceManager.canEdit.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Template Creation', () => {
    it('should create template with valid data', async () => {
      const templateData = {
        name: 'API Endpoint',
        description: 'Express.js API endpoint template',
        category: ProjectCategory.API_SERVICE,
        files: {
          'src/routes/{{routeName}}.ts': 'export default function {{routeName}}() {}',
        },
        variables: [
          {
            name: 'routeName',
            type: 'string' as const,
            required: true,
            description: 'Name of the API route',
          },
        ],
        userId: 'user-1',
      };

      (prisma.template.create as any).mockResolvedValue({
        ...mockTemplate,
        ...templateData,
      });

      const result = await templatesManager.createTemplate(templateData);

      expect(result).toMatchObject({
        name: templateData.name,
        description: templateData.description,
        category: templateData.category,
      });

      expect(prisma.template.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          name: templateData.name,
          category: templateData.category,
          files: templateData.files,
          variables: templateData.variables,
        }),
      });
    });

    it('should validate template variables', async () => {
      const invalidTemplate = {
        name: 'Invalid Template',
        category: ProjectCategory.WEB_APP,
        files: {
          'test.js': 'console.log({{missingVariable}});',
        },
        variables: [], // No variables defined but used in template
        userId: 'user-1',
      };

      await expect(templatesManager.createTemplate(invalidTemplate))
        .rejects.toThrow('missingVariable');
    });

    it('should reject templates with invalid variable names', async () => {
      const invalidTemplate = {
        name: 'Invalid Variable Template',
        category: ProjectCategory.WEB_APP,
        files: { 'test.js': 'test' },
        variables: [
          {
            name: '123invalid', // Invalid variable name
            type: 'string' as const,
            required: true,
            description: 'Invalid variable',
          },
        ],
        userId: 'user-1',
      };

      await expect(templatesManager.createTemplate(invalidTemplate))
        .rejects.toThrow('Invalid variable name');
    });
  });

  describe('Template Application', () => {
    beforeEach(() => {
      (prisma.template.findUnique as any).mockResolvedValue(mockTemplate);
    });

    it('should apply template with variable substitution', async () => {
      const variables = {
        componentName: 'UserProfile',
        title: 'User Profile Component',
      };

      const result = await templatesManager.applyTemplate(
        'template-1',
        'project-1',
        'user-1',
        variables
      );

      expect(result.files).toHaveProperty('src/components/UserProfile.tsx');
      expect(result.files).toHaveProperty('src/components/UserProfile.test.tsx');

      const componentContent = result.files['src/components/UserProfile.tsx'];
      expect(componentContent).toContain('function UserProfile');
      expect(componentContent).toContain('UserProfile-container');
      expect(componentContent).toContain('User Profile Component');
    });

    it('should use default values for optional variables', async () => {
      const variables = {
        componentName: 'SimpleButton',
        // title not provided, should use default
      };

      const result = await templatesManager.applyTemplate(
        'template-1',
        'project-1',
        'user-1',
        variables
      );

      const componentContent = result.files['src/components/SimpleButton.tsx'];
      expect(componentContent).toContain('Hello World'); // Default title
    });

    it('should validate required variables', async () => {
      const variables = {
        // componentName is required but not provided
        title: 'Some Title',
      };

      await expect(templatesManager.applyTemplate(
        'template-1',
        'project-1',
        'user-1',
        variables
      )).rejects.toThrow('componentName is required');
    });

    it('should validate variable patterns', async () => {
      const variables = {
        componentName: 'invalid-component-name', // Should start with uppercase
        title: 'Valid Title',
      };

      await expect(templatesManager.applyTemplate(
        'template-1',
        'project-1',
        'user-1',
        variables
      )).rejects.toThrow('validation');
    });

    it('should handle nested directory structures', async () => {
      const templateWithNesting = {
        ...mockTemplate,
        files: {
          'src/components/{{folder}}/{{componentName}}/index.tsx': 'export * from "./{{componentName}}";',
          'src/components/{{folder}}/{{componentName}}/{{componentName}}.tsx': 'component content',
          'src/components/{{folder}}/{{componentName}}/styles.css': '.{{componentName}} {}',
        },
      };

      (prisma.template.findUnique as any).mockResolvedValue(templateWithNesting);

      const variables = {
        componentName: 'Button',
        folder: 'ui',
      };

      const result = await templatesManager.applyTemplate(
        'template-1',
        'project-1',
        'user-1',
        variables
      );

      expect(result.files).toHaveProperty('src/components/ui/Button/index.tsx');
      expect(result.files).toHaveProperty('src/components/ui/Button/Button.tsx');
      expect(result.files).toHaveProperty('src/components/ui/Button/styles.css');
    });
  });

  describe('AI-Powered Scaffolding', () => {
    it('should create project from category with AI recommendations', async () => {
      const { stackRecommender } = require('@/services/orch/recommender');

      const mockRecommendation = {
        stack: {
          frontend: ['React', 'TypeScript', 'Tailwind CSS'],
          backend: ['Node.js', 'Express', 'Prisma'],
          database: ['PostgreSQL'],
          deployment: ['Vercel'],
        },
        reasoning: 'Modern web app stack with TypeScript for type safety',
        confidence: 0.85,
      };

      stackRecommender.getRecommendation.mockResolvedValue(mockRecommendation);

      (prisma.project.create as any).mockResolvedValue({
        ...mockProject,
        name: 'E-commerce Store',
        category: ProjectCategory.E_COMMERCE,
      });

      const scaffoldData = {
        category: ProjectCategory.E_COMMERCE,
        name: 'E-commerce Store',
        description: 'Modern e-commerce platform',
        userId: 'user-1',
        workspaceId: 'workspace-1',
      };

      const result = await templatesManager.createTemplateFromCategory(
        ProjectCategory.E_COMMERCE,
        'E-commerce Store',
        'user-1'
      );

      expect(result.files).toHaveProperty('package.json');
      expect(result.files).toHaveProperty('README.md');
      expect(result.files).toHaveProperty('docker-compose.yml');

      const packageJson = JSON.parse(result.files['package.json']);
      expect(packageJson.name).toBe('e-commerce-store');
      expect(packageJson.dependencies).toHaveProperty('react');
      expect(packageJson.dependencies).toHaveProperty('express');
    });

    it('should generate appropriate file structure for different categories', async () => {
      const { stackRecommender } = require('@/services/orch/recommender');

      stackRecommender.getRecommendation.mockResolvedValue({
        stack: {
          backend: ['FastAPI', 'Python'],
          database: ['PostgreSQL'],
          ml: ['TensorFlow', 'scikit-learn'],
        },
        reasoning: 'Python stack for ML model development',
        confidence: 0.9,
      });

      const result = await templatesManager.createTemplateFromCategory(
        ProjectCategory.ML_MODEL,
        'Sentiment Analysis Model',
        'user-1'
      );

      expect(result.files).toHaveProperty('requirements.txt');
      expect(result.files).toHaveProperty('src/model/train.py');
      expect(result.files).toHaveProperty('src/model/predict.py');
      expect(result.files).toHaveProperty('notebooks/exploratory_analysis.ipynb');
      expect(result.files).toHaveProperty('data/README.md');

      const requirements = result.files['requirements.txt'];
      expect(requirements).toContain('tensorflow');
      expect(requirements).toContain('scikit-learn');
    });

    it('should handle mobile app scaffolding', async () => {
      const { stackRecommender } = require('@/services/orch/recommender');

      stackRecommender.getRecommendation.mockResolvedValue({
        stack: {
          mobile: ['React Native', 'TypeScript'],
          state: ['Redux Toolkit'],
          navigation: ['React Navigation'],
        },
        reasoning: 'Cross-platform mobile development with React Native',
        confidence: 0.8,
      });

      const result = await templatesManager.createTemplateFromCategory(
        ProjectCategory.MOBILE_APP,
        'Fitness Tracker',
        'user-1'
      );

      expect(result.files).toHaveProperty('App.tsx');
      expect(result.files).toHaveProperty('src/screens/HomeScreen.tsx');
      expect(result.files).toHaveProperty('src/navigation/AppNavigator.tsx');
      expect(result.files).toHaveProperty('src/store/index.ts');
      expect(result.files).toHaveProperty('android/app/build.gradle');
      expect(result.files).toHaveProperty('ios/Podfile');
    });
  });

  describe('Template Management', () => {
    it('should list templates by category', async () => {
      const mockTemplates = [
        { ...mockTemplate, id: 'template-1', name: 'React Component' },
        { ...mockTemplate, id: 'template-2', name: 'React Hook' },
      ];

      (prisma.template.findMany as any).mockResolvedValue(mockTemplates);

      const result = await templatesManager.listTemplates({
        category: ProjectCategory.WEB_APP,
        userId: 'user-1',
      });

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('React Component');
      expect(result[1].name).toBe('React Hook');

      expect(prisma.template.findMany).toHaveBeenCalledWith({
        where: {
          category: ProjectCategory.WEB_APP,
          OR: [
            { isPublic: true },
            { createdBy: 'user-1' },
          ],
        },
        orderBy: { name: 'asc' },
      });
    });

    it('should get template details with preview', async () => {
      (prisma.template.findUnique as any).mockResolvedValue(mockTemplate);

      const result = await templatesManager.getTemplate('template-1', 'user-1');

      expect(result).toMatchObject({
        id: 'template-1',
        name: 'React Component',
        files: expect.any(Object),
        variables: expect.any(Array),
      });

      expect(result.preview).toBeDefined();
      expect(result.preview.files).toHaveProperty('src/components/ExampleComponent.tsx');
    });

    it('should update template with version control', async () => {
      const existingTemplate = {
        ...mockTemplate,
        version: 1,
        createdBy: 'user-1',
      };

      (prisma.template.findUnique as any).mockResolvedValue(existingTemplate);

      const updateData = {
        templateId: 'template-1',
        userId: 'user-1',
        name: 'Updated React Component',
        description: 'Updated description',
        files: {
          ...mockTemplate.files,
          'src/components/{{componentName}}.stories.tsx': 'Storybook stories',
        },
      };

      (prisma.template.update as any).mockResolvedValue({
        ...existingTemplate,
        ...updateData,
        version: 2,
        updatedAt: new Date(),
      });

      const result = await templatesManager.updateTemplate(updateData);

      expect(result.version).toBe(2);
      expect(result.name).toBe('Updated React Component');
      expect(result.files).toHaveProperty('src/components/{{componentName}}.stories.tsx');
    });
  });

  describe('Template Validation', () => {
    it('should validate template syntax', async () => {
      const invalidTemplate = {
        name: 'Invalid Template',
        category: ProjectCategory.WEB_APP,
        files: {
          'invalid.js': 'console.log({{unclosedVariable);', // Syntax error
        },
        variables: [
          {
            name: 'unclosedVariable',
            type: 'string' as const,
            required: true,
            description: 'Test variable',
          },
        ],
        userId: 'user-1',
      };

      await expect(templatesManager.validateTemplate(invalidTemplate))
        .rejects.toThrow('Invalid template syntax');
    });

    it('should validate circular dependencies in variables', async () => {
      const circularTemplate = {
        name: 'Circular Template',
        category: ProjectCategory.WEB_APP,
        files: {
          'test.js': '{{varA}} and {{varB}}',
        },
        variables: [
          {
            name: 'varA',
            type: 'string' as const,
            required: true,
            default: '{{varB}}', // Circular reference
            description: 'Variable A',
          },
          {
            name: 'varB',
            type: 'string' as const,
            required: true,
            default: '{{varA}}', // Circular reference
            description: 'Variable B',
          },
        ],
        userId: 'user-1',
      };

      await expect(templatesManager.validateTemplate(circularTemplate))
        .rejects.toThrow('Circular dependency detected');
    });
  });
});