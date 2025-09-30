import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { MarketplaceService } from '@/lib/services/marketplace';
import { Database } from '@/lib/database';
import {
  MarketplaceItem,
  MarketplaceSearchFilters,
  InstallPluginRequest,
  CreateFromTemplateRequest,
  PluginManifest,
  TemplateManifest
} from '@/lib/types/marketplace';

// Mock the database
jest.mock('@/lib/database');

describe('MarketplaceService', () => {
  let marketplaceService: MarketplaceService;
  let mockDb: jest.Mocked<Database>;

  const mockUserId = 'user-123';
  const mockItemId = 'item-456';
  const mockProjectId = 'project-789';

  const mockPluginManifest: PluginManifest = {
    name: 'Test Plugin',
    version: '1.0.0',
    description: 'A test plugin',
    author: 'Test Author',
    runtime: 'nodejs',
    entryPoint: 'index.js',
    inputs: {
      text: {
        type: 'string',
        description: 'Input text',
        required: true
      }
    },
    outputs: {
      result: {
        type: 'string',
        description: 'Processed text'
      }
    },
    permissions: ['filesystem:read', 'ai:generate'],
    sandboxed: true,
    dependencies: {},
    config: {},
    category: 'ai',
    tags: ['text', 'ai'],
    license: 'MIT'
  };

  const mockTemplateManifest: TemplateManifest = {
    name: 'Test Template',
    version: '1.0.0',
    description: 'A test template',
    author: 'Test Author',
    templateType: 'project',
    variables: {
      projectName: {
        type: 'string',
        label: 'Project Name',
        required: true
      }
    },
    files: [
      {
        path: 'README.md',
        content: '# {{projectName}}\n\nA new project.',
        template: true
      }
    ],
    category: 'template',
    tags: ['starter'],
    license: 'MIT'
  };

  const mockMarketplaceItem: Partial<any> = {
    id: mockItemId,
    type: 'plugin',
    slug: 'test-plugin',
    name: 'Test Plugin',
    description: 'A test plugin',
    author_id: mockUserId,
    author_name: 'Test Author',
    version: '1.0.0',
    manifest: mockPluginManifest,
    category: 'ai',
    tags: ['text', 'ai'],
    verified: false,
    featured: false,
    installs: 0,
    rating_average: 0,
    rating_count: 0,
    status: 'draft',
    runtime: 'nodejs',
    entry_point: 'index.js',
    permissions: JSON.stringify(['filesystem:read', 'ai:generate']),
    dependencies: JSON.stringify({}),
    price: 0,
    currency: 'USD',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };

  beforeEach(() => {
    mockDb = {
      query: jest.fn(),
      getInstance: jest.fn()
    } as any;

    (Database.getInstance as jest.Mock).mockReturnValue(mockDb);
    marketplaceService = MarketplaceService.getInstance();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('searchItems', () => {
    it('should search marketplace items with default filters', async () => {
      const mockSearchResult = {
        rows: [
          { ...mockMarketplaceItem, total_count: '1' }
        ]
      };

      mockDb.query.mockResolvedValueOnce(mockSearchResult);

      const result = await marketplaceService.searchItems();

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE mi.status = $1'),
        expect.arrayContaining(['approved'])
      );

      expect(result.items).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.hasMore).toBe(false);
    });

    it('should apply search filters correctly', async () => {
      const filters: MarketplaceSearchFilters = {
        query: 'test',
        type: 'plugin',
        category: 'ai',
        verified: true,
        minRating: 4.0
      };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await marketplaceService.searchItems(filters);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('mi.type = $2'),
        expect.arrayContaining(['approved', 'plugin', 'ai', true, 4.0, 'test'])
      );
    });

    it('should handle pagination correctly', async () => {
      const filters: MarketplaceSearchFilters = {
        limit: 10,
        offset: 20
      };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await marketplaceService.searchItems(filters);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT $2 OFFSET $3'),
        expect.arrayContaining(['approved', 10, 20])
      );
    });

    it('should sort by different criteria', async () => {
      const filters: MarketplaceSearchFilters = {
        sortBy: 'installs',
        sortOrder: 'desc'
      };

      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await marketplaceService.searchItems(filters);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY mi.installs DESC'),
        expect.any(Array)
      );
    });
  });

  describe('getItemById', () => {
    it('should return marketplace item by ID', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockMarketplaceItem]
      });

      const result = await marketplaceService.getItemById(mockItemId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('WHERE id = $1 AND status = \'approved\''),
        [mockItemId]
      );

      expect(result).toBeDefined();
      expect(result?.id).toBe(mockItemId);
      expect(result?.name).toBe('Test Plugin');
    });

    it('should return null for non-existent item', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      const result = await marketplaceService.getItemById('non-existent');

      expect(result).toBeNull();
    });
  });

  describe('createItem', () => {
    it('should create a new plugin item', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockMarketplaceItem]
      });

      const result = await marketplaceService.createItem(
        mockUserId,
        'plugin',
        mockPluginManifest
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO marketplace_items'),
        expect.arrayContaining([
          'plugin',
          'test-plugin',
          'Test Plugin',
          'A test plugin',
          mockUserId,
          'Test Author'
        ])
      );

      expect(result.id).toBe(mockItemId);
      expect(result.type).toBe('plugin');
    });

    it('should create a new template item', async () => {
      const mockTemplateItem = {
        ...mockMarketplaceItem,
        type: 'template',
        manifest: mockTemplateManifest
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockTemplateItem]
      });

      const result = await marketplaceService.createItem(
        mockUserId,
        'template',
        mockTemplateManifest
      );

      expect(result.type).toBe('template');
    });

    it('should validate manifest before creating', async () => {
      const invalidManifest = {
        ...mockPluginManifest,
        version: 'invalid-version'
      };

      await expect(
        marketplaceService.createItem(mockUserId, 'plugin', invalidManifest as any)
      ).rejects.toThrow('Invalid manifest');
    });

    it('should validate permissions for plugins', async () => {
      const dangerousManifest = {
        ...mockPluginManifest,
        permissions: ['execute:command', 'filesystem:delete']
      };

      await expect(
        marketplaceService.createItem(mockUserId, 'plugin', dangerousManifest)
      ).rejects.toThrow('Invalid permissions');
    });
  });

  describe('installItem', () => {
    it('should install a marketplace item', async () => {
      const mockInstallation = {
        id: 'installation-123',
        item_id: mockItemId,
        user_id: mockUserId,
        project_id: mockProjectId,
        installed_version: '1.0.0',
        is_active: true,
        auto_update: true,
        config: {},
        usage_count: 0,
        installed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      // Mock getting the item
      mockDb.query
        .mockResolvedValueOnce({
          rows: [mockMarketplaceItem]
        })
        // Mock checking existing installation
        .mockResolvedValueOnce({
          rows: []
        })
        // Mock creating installation
        .mockResolvedValueOnce({
          rows: [mockInstallation]
        });

      const request: InstallPluginRequest = {
        itemId: mockItemId,
        projectId: mockProjectId,
        config: { apiKey: 'test' },
        autoUpdate: true
      };

      const result = await marketplaceService.installItem(mockUserId, request);

      expect(result.itemId).toBe(mockItemId);
      expect(result.userId).toBe(mockUserId);
      expect(result.config).toEqual({ apiKey: 'test' });
    });

    it('should prevent duplicate installations', async () => {
      // Mock existing installation
      mockDb.query
        .mockResolvedValueOnce({
          rows: [mockMarketplaceItem]
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'existing-installation' }]
        });

      const request: InstallPluginRequest = {
        itemId: mockItemId,
        projectId: mockProjectId
      };

      await expect(
        marketplaceService.installItem(mockUserId, request)
      ).rejects.toThrow('Item already installed');
    });

    it('should validate configuration against schema', async () => {
      const itemWithConfigSchema = {
        ...mockMarketplaceItem,
        config_schema: {
          apiKey: {
            type: 'string',
            required: true
          }
        }
      };

      mockDb.query
        .mockResolvedValueOnce({
          rows: [itemWithConfigSchema]
        })
        .mockResolvedValueOnce({
          rows: []
        });

      const request: InstallPluginRequest = {
        itemId: mockItemId,
        config: {} // Missing required apiKey
      };

      await expect(
        marketplaceService.installItem(mockUserId, request)
      ).rejects.toThrow('Required configuration field missing: apiKey');
    });
  });

  describe('uninstallItem', () => {
    it('should uninstall a marketplace item', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1
      });

      await marketplaceService.uninstallItem(mockUserId, mockItemId, mockProjectId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE marketplace_installations SET is_active = false'),
        [mockItemId, mockUserId, mockProjectId]
      );
    });

    it('should throw error if installation not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0
      });

      await expect(
        marketplaceService.uninstallItem(mockUserId, 'non-existent')
      ).rejects.toThrow('Installation not found');
    });
  });

  describe('createFromTemplate', () => {
    it('should create project from template', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          ...mockMarketplaceItem,
          type: 'template',
          manifest: mockTemplateManifest
        }]
      });

      const request: CreateFromTemplateRequest = {
        itemId: mockItemId,
        projectName: 'My New Project',
        variables: {
          projectName: 'My New Project'
        }
      };

      const result = await marketplaceService.createFromTemplate(mockUserId, request);

      expect(result.projectName).toBe('My New Project');
      expect(result.files).toBeDefined();
      expect(result.files[0].content).toContain('My New Project');
    });

    it('should validate template variables', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{
          ...mockMarketplaceItem,
          type: 'template',
          manifest: mockTemplateManifest
        }]
      });

      const request: CreateFromTemplateRequest = {
        itemId: mockItemId,
        projectName: 'Test Project',
        variables: {} // Missing required projectName
      };

      await expect(
        marketplaceService.createFromTemplate(mockUserId, request)
      ).rejects.toThrow('Required template variable missing: projectName');
    });
  });

  describe('submitForReview', () => {
    it('should submit item for review', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1
      });

      await marketplaceService.submitForReview(mockItemId, mockUserId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = \'pending_review\''),
        [mockItemId, mockUserId]
      );
    });

    it('should only allow draft items to be submitted', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 0
      });

      await expect(
        marketplaceService.submitForReview(mockItemId, mockUserId)
      ).rejects.toThrow('Item not found or not in draft status');
    });
  });

  describe('reviewItem', () => {
    it('should approve an item', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1
      });

      await marketplaceService.reviewItem(mockItemId, 'reviewer-123', true);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        ['approved', true, 'reviewer-123', undefined, mockItemId]
      );
    });

    it('should reject an item with reason', async () => {
      mockDb.query.mockResolvedValueOnce({
        rowCount: 1
      });

      const rejectionReason = 'Security concerns with permissions';

      await marketplaceService.reviewItem(
        mockItemId,
        'reviewer-123',
        false,
        rejectionReason
      );

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('SET status = $1'),
        ['rejected', false, 'reviewer-123', rejectionReason, mockItemId]
      );
    });
  });

  describe('addReview', () => {
    it('should add a review for an item', async () => {
      const mockReview = {
        id: 'review-123',
        item_id: mockItemId,
        user_id: mockUserId,
        rating: 5,
        title: 'Great plugin!',
        content: 'This plugin works perfectly.',
        helpful_count: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockReview]
      });

      const result = await marketplaceService.addReview(
        mockUserId,
        mockItemId,
        5,
        'Great plugin!',
        'This plugin works perfectly.'
      );

      expect(result.rating).toBe(5);
      expect(result.title).toBe('Great plugin!');
    });

    it('should validate rating range', async () => {
      await expect(
        marketplaceService.addReview(mockUserId, mockItemId, 6)
      ).rejects.toThrow('Rating must be between 1 and 5');

      await expect(
        marketplaceService.addReview(mockUserId, mockItemId, 0)
      ).rejects.toThrow('Rating must be between 1 and 5');
    });
  });

  describe('getUserInstallations', () => {
    it('should get user installations', async () => {
      const mockInstallations = [
        {
          id: 'installation-1',
          item_id: mockItemId,
          user_id: mockUserId,
          project_id: mockProjectId,
          installed_version: '1.0.0',
          is_active: true,
          auto_update: true,
          config: {},
          usage_count: 5,
          installed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          item_name: 'Test Plugin',
          item_type: 'plugin'
        }
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockInstallations
      });

      const result = await marketplaceService.getUserInstallations(mockUserId, mockProjectId);

      expect(result).toHaveLength(1);
      expect(result[0].itemId).toBe(mockItemId);
      expect(result[0].isActive).toBe(true);
    });

    it('should filter by project when specified', async () => {
      mockDb.query.mockResolvedValueOnce({ rows: [] });

      await marketplaceService.getUserInstallations(mockUserId, mockProjectId);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('AND mi.project_id = $2'),
        [mockUserId, mockProjectId]
      );
    });
  });
});