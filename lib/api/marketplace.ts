import { NextApiRequest, NextApiResponse } from 'next';
import { MarketplaceService } from '@/lib/services/marketplace';
import {
  MarketplaceSearchFilters,
  InstallPluginRequest,
  CreateFromTemplateRequest,
  ExecutePluginRequest
} from '@/lib/types/marketplace';

const marketplaceService = MarketplaceService.getInstance();

/**
 * GET /api/v1/marketplace
 * List and search marketplace items
 */
export async function listMarketplaceItems(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const {
      query,
      type,
      category,
      tags,
      verified,
      featured,
      runtime,
      minRating,
      priceMin,
      priceMax,
      sortBy,
      sortOrder,
      limit,
      offset
    } = req.query;

    const filters: MarketplaceSearchFilters = {
      query: query as string,
      type: type as any,
      category: category as string,
      tags: typeof tags === 'string' ? [tags] : tags as string[],
      verified: verified === 'true',
      featured: featured === 'true',
      runtime: runtime as any,
      minRating: minRating ? parseFloat(minRating as string) : undefined,
      priceMin: priceMin ? parseFloat(priceMin as string) : undefined,
      priceMax: priceMax ? parseFloat(priceMax as string) : undefined,
      sortBy: sortBy as any || 'relevance',
      sortOrder: sortOrder as any || 'desc',
      limit: limit ? parseInt(limit as string, 10) : 20,
      offset: offset ? parseInt(offset as string, 10) : 0
    };

    const result = await marketplaceService.searchItems(filters);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error listing marketplace items:', error);
    res.status(500).json({
      error: 'Failed to list marketplace items',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/[itemId]
 * Get specific marketplace item
 */
export async function getMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string
) {
  try {
    const item = await marketplaceService.getItemById(itemId);

    if (!item) {
      return res.status(404).json({ error: 'Marketplace item not found' });
    }

    res.status(200).json(item);
  } catch (error) {
    console.error('Error getting marketplace item:', error);
    res.status(500).json({
      error: 'Failed to get marketplace item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace
 * Create new marketplace item
 */
export async function createMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const { type, manifest, ...additionalData } = req.body;

    if (!type || !manifest) {
      return res.status(400).json({
        error: 'Missing required fields: type, manifest'
      });
    }

    const item = await marketplaceService.createItem(
      userId,
      type,
      manifest,
      additionalData
    );

    res.status(201).json(item);
  } catch (error) {
    console.error('Error creating marketplace item:', error);
    res.status(400).json({
      error: 'Failed to create marketplace item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace/install
 * Install marketplace item
 */
export async function installMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const request: InstallPluginRequest = req.body;

    if (!request.itemId) {
      return res.status(400).json({
        error: 'Missing required field: itemId'
      });
    }

    const installation = await marketplaceService.installItem(userId, request);
    res.status(200).json(installation);
  } catch (error) {
    console.error('Error installing marketplace item:', error);
    res.status(400).json({
      error: 'Failed to install marketplace item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * DELETE /api/v1/marketplace/uninstall
 * Uninstall marketplace item
 */
export async function uninstallMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const { itemId, projectId } = req.body;

    if (!itemId) {
      return res.status(400).json({
        error: 'Missing required field: itemId'
      });
    }

    await marketplaceService.uninstallItem(userId, itemId, projectId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error uninstalling marketplace item:', error);
    res.status(400).json({
      error: 'Failed to uninstall marketplace item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/installations
 * Get user installations
 */
export async function getUserInstallations(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const { projectId } = req.query;

    const installations = await marketplaceService.getUserInstallations(
      userId,
      projectId as string
    );

    res.status(200).json({ installations });
  } catch (error) {
    console.error('Error getting user installations:', error);
    res.status(500).json({
      error: 'Failed to get user installations',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace/template/create
 * Create project from template
 */
export async function createFromTemplate(
  req: NextApiRequest,
  res: NextApiResponse,
  userId: string
) {
  try {
    const request: CreateFromTemplateRequest = req.body;

    if (!request.itemId || !request.projectName) {
      return res.status(400).json({
        error: 'Missing required fields: itemId, projectName'
      });
    }

    const result = await marketplaceService.createFromTemplate(userId, request);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error creating from template:', error);
    res.status(400).json({
      error: 'Failed to create from template',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace/[itemId]/submit
 * Submit item for review
 */
export async function submitItemForReview(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string,
  userId: string
) {
  try {
    await marketplaceService.submitForReview(itemId, userId);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error submitting item for review:', error);
    res.status(400).json({
      error: 'Failed to submit item for review',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace/[itemId]/review
 * Review item (admin only)
 */
export async function reviewMarketplaceItem(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string,
  reviewerId: string
) {
  try {
    const { approved, rejectionReason } = req.body;

    if (typeof approved !== 'boolean') {
      return res.status(400).json({
        error: 'Missing required field: approved (boolean)'
      });
    }

    await marketplaceService.reviewItem(itemId, reviewerId, approved, rejectionReason);
    res.status(200).json({ success: true });
  } catch (error) {
    console.error('Error reviewing marketplace item:', error);
    res.status(400).json({
      error: 'Failed to review marketplace item',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * POST /api/v1/marketplace/[itemId]/reviews
 * Add review for item
 */
export async function addItemReview(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string,
  userId: string
) {
  try {
    const { rating, title, content } = req.body;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({
        error: 'Rating must be between 1 and 5'
      });
    }

    const review = await marketplaceService.addReview(
      userId,
      itemId,
      rating,
      title,
      content
    );

    res.status(200).json(review);
  } catch (error) {
    console.error('Error adding item review:', error);
    res.status(400).json({
      error: 'Failed to add item review',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/[itemId]/reviews
 * Get reviews for item
 */
export async function getItemReviews(
  req: NextApiRequest,
  res: NextApiResponse,
  itemId: string
) {
  try {
    const { limit = '10', offset = '0' } = req.query;

    const reviews = await marketplaceService.getItemReviews(
      itemId,
      parseInt(limit as string, 10),
      parseInt(offset as string, 10)
    );

    res.status(200).json({ reviews });
  } catch (error) {
    console.error('Error getting item reviews:', error);
    res.status(500).json({
      error: 'Failed to get item reviews',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/stats
 * Get marketplace statistics
 */
export async function getMarketplaceStats(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    // This would implement marketplace-wide statistics
    // For now, return mock data
    const stats = {
      totalItems: 0,
      totalPlugins: 0,
      totalTemplates: 0,
      totalInstalls: 0,
      featuredItems: [],
      popularCategories: [],
      recentItems: []
    };

    res.status(200).json(stats);
  } catch (error) {
    console.error('Error getting marketplace stats:', error);
    res.status(500).json({
      error: 'Failed to get marketplace stats',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/categories
 * Get available categories
 */
export async function getMarketplaceCategories(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const categories = [
      { id: 'ai', name: 'AI & Machine Learning', icon: '🤖' },
      { id: 'automation', name: 'Automation', icon: '⚡' },
      { id: 'data', name: 'Data Processing', icon: '📊' },
      { id: 'development', name: 'Development Tools', icon: '🛠️' },
      { id: 'design', name: 'Design & UI', icon: '🎨' },
      { id: 'productivity', name: 'Productivity', icon: '📈' },
      { id: 'collaboration', name: 'Collaboration', icon: '👥' },
      { id: 'integration', name: 'Integrations', icon: '🔗' },
      { id: 'utility', name: 'Utilities', icon: '🔧' },
      { id: 'template', name: 'Templates', icon: '📄' }
    ];

    res.status(200).json({ categories });
  } catch (error) {
    console.error('Error getting marketplace categories:', error);
    res.status(500).json({
      error: 'Failed to get marketplace categories',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * GET /api/v1/marketplace/permissions
 * Get available permissions
 */
export async function getAvailablePermissions(
  req: NextApiRequest,
  res: NextApiResponse
) {
  try {
    const permissions = [
      { name: 'filesystem:read', description: 'Read files from the project', riskLevel: 'low' },
      { name: 'filesystem:write', description: 'Write files to the project', riskLevel: 'medium' },
      { name: 'filesystem:delete', description: 'Delete files from the project', riskLevel: 'high' },
      { name: 'network:http', description: 'Make HTTP requests', riskLevel: 'medium' },
      { name: 'network:websocket', description: 'Open WebSocket connections', riskLevel: 'medium' },
      { name: 'ai:generate', description: 'Use AI generation', riskLevel: 'low' },
      { name: 'ai:analyze', description: 'Use AI analysis', riskLevel: 'low' },
      { name: 'database:read', description: 'Read from database', riskLevel: 'medium' },
      { name: 'database:write', description: 'Write to database', riskLevel: 'high' },
      { name: 'execute:command', description: 'Execute system commands', riskLevel: 'critical' },
      { name: 'execute:script', description: 'Execute scripts', riskLevel: 'high' },
      { name: 'env:read', description: 'Read environment variables', riskLevel: 'medium' },
      { name: 'env:write', description: 'Write environment variables', riskLevel: 'high' }
    ];

    res.status(200).json({ permissions });
  } catch (error) {
    console.error('Error getting available permissions:', error);
    res.status(500).json({
      error: 'Failed to get available permissions',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}