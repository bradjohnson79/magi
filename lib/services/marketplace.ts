import { Database } from '@/lib/database';
import {
  MarketplaceItem,
  MarketplaceInstallation,
  MarketplaceSearchFilters,
  MarketplaceSearchResult,
  InstallPluginRequest,
  CreateFromTemplateRequest,
  MarketplaceReview,
  PluginPermission,
  ManifestValidator,
  PermissionValidator,
  Manifest,
  MarketplaceItemType,
  MarketplaceItemStatus
} from '@/lib/types/marketplace';

export class MarketplaceService {
  private static instance: MarketplaceService;
  private db: Database;

  constructor() {
    this.db = Database.getInstance();
  }

  static getInstance(): MarketplaceService {
    if (!MarketplaceService.instance) {
      MarketplaceService.instance = new MarketplaceService();
    }
    return MarketplaceService.instance;
  }

  /**
   * Search and list marketplace items
   */
  async searchItems(filters: MarketplaceSearchFilters = {}): Promise<MarketplaceSearchResult> {
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
        sortBy = 'relevance',
        sortOrder = 'desc',
        limit = 20,
        offset = 0
      } = filters;

      let whereClause = 'WHERE mi.status = $1';
      const params: any[] = ['approved'];
      let paramIndex = 2;

      // Build WHERE clause
      if (type) {
        whereClause += ` AND mi.type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (category) {
        whereClause += ` AND mi.category = $${paramIndex}`;
        params.push(category);
        paramIndex++;
      }

      if (tags && tags.length > 0) {
        whereClause += ` AND mi.tags && $${paramIndex}`;
        params.push(tags);
        paramIndex++;
      }

      if (verified !== undefined) {
        whereClause += ` AND mi.verified = $${paramIndex}`;
        params.push(verified);
        paramIndex++;
      }

      if (featured !== undefined) {
        whereClause += ` AND mi.featured = $${paramIndex}`;
        params.push(featured);
        paramIndex++;
      }

      if (runtime) {
        whereClause += ` AND mi.runtime = $${paramIndex}`;
        params.push(runtime);
        paramIndex++;
      }

      if (minRating) {
        whereClause += ` AND mi.rating_average >= $${paramIndex}`;
        params.push(minRating);
        paramIndex++;
      }

      if (priceMin !== undefined) {
        whereClause += ` AND mi.price >= $${paramIndex}`;
        params.push(priceMin);
        paramIndex++;
      }

      if (priceMax !== undefined) {
        whereClause += ` AND mi.price <= $${paramIndex}`;
        params.push(priceMax);
        paramIndex++;
      }

      if (query) {
        whereClause += ` AND mi.search_vector @@ plainto_tsquery('english', $${paramIndex})`;
        params.push(query);
        paramIndex++;
      }

      // Build ORDER BY clause
      let orderClause = '';
      switch (sortBy) {
        case 'installs':
          orderClause = `ORDER BY mi.installs ${sortOrder.toUpperCase()}`;
          break;
        case 'rating':
          orderClause = `ORDER BY mi.rating_average ${sortOrder.toUpperCase()}, mi.rating_count DESC`;
          break;
        case 'recent':
          orderClause = `ORDER BY mi.created_at ${sortOrder.toUpperCase()}`;
          break;
        case 'name':
          orderClause = `ORDER BY mi.name ${sortOrder.toUpperCase()}`;
          break;
        case 'relevance':
        default:
          if (query) {
            orderClause = `ORDER BY ts_rank(mi.search_vector, plainto_tsquery('english', '${query}')) DESC, mi.featured DESC, mi.installs DESC`;
          } else {
            orderClause = `ORDER BY mi.featured DESC, mi.rating_average DESC, mi.installs DESC`;
          }
          break;
      }

      const searchQuery = `
        SELECT
          mi.*,
          COUNT(*) OVER() as total_count
        FROM marketplace_items mi
        ${whereClause}
        ${orderClause}
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `;

      params.push(limit, offset);
      const result = await this.db.query(searchQuery, params);

      const items = result.rows.map(row => this.mapMarketplaceItemFromRow(row));
      const total = result.rows.length > 0 ? parseInt(result.rows[0].total_count, 10) : 0;

      // Get facets for filtering
      const facets = await this.getFacets(filters);

      return {
        items,
        total,
        hasMore: offset + items.length < total,
        facets
      };
    } catch (error) {
      console.error('Error searching marketplace items:', error);
      throw new Error('Failed to search marketplace items');
    }
  }

  /**
   * Get marketplace item by ID
   */
  async getItemById(itemId: string): Promise<MarketplaceItem | null> {
    try {
      const query = `
        SELECT * FROM marketplace_items
        WHERE id = $1 AND status = 'approved'
      `;

      const result = await this.db.query(query, [itemId]);

      if (result.rows.length === 0) {
        return null;
      }

      return this.mapMarketplaceItemFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error getting marketplace item:', error);
      throw new Error('Failed to get marketplace item');
    }
  }

  /**
   * Create new marketplace item
   */
  async createItem(
    authorId: string,
    type: MarketplaceItemType,
    manifest: Manifest,
    additionalData: Partial<MarketplaceItem> = {}
  ): Promise<MarketplaceItem> {
    try {
      // Validate manifest
      const validation = ManifestValidator.validate(manifest);
      if (!validation.valid) {
        throw new Error(`Invalid manifest: ${validation.errors.join(', ')}`);
      }

      // Validate permissions for plugins
      if (type === 'plugin' && manifest.permissions) {
        const permissionValidation = PermissionValidator.validatePermissions(manifest.permissions);
        if (!permissionValidation.valid) {
          throw new Error(`Invalid permissions: ${permissionValidation.risks.join(', ')}`);
        }
      }

      // Generate slug from name
      const slug = this.generateSlug(manifest.name);

      const query = `
        INSERT INTO marketplace_items (
          type, slug, name, description, author_id, author_name,
          version, manifest, category, tags, icon_url, repository_url,
          license, runtime, entry_point, permissions, dependencies,
          template_type, price, currency
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20
        ) RETURNING *
      `;

      const values = [
        type,
        slug,
        manifest.name,
        manifest.description,
        authorId,
        manifest.author,
        manifest.version,
        JSON.stringify(manifest),
        additionalData.category || manifest.category,
        manifest.tags || [],
        manifest.icon,
        manifest.repository,
        manifest.license || 'MIT',
        type === 'plugin' ? (manifest as any).runtime : null,
        type === 'plugin' ? (manifest as any).entryPoint : null,
        type === 'plugin' ? JSON.stringify((manifest as any).permissions || []) : JSON.stringify([]),
        type === 'plugin' ? JSON.stringify((manifest as any).dependencies || {}) : JSON.stringify({}),
        type === 'template' ? (manifest as any).templateType : null,
        additionalData.price || 0,
        additionalData.currency || 'USD'
      ];

      const result = await this.db.query(query, values);
      return this.mapMarketplaceItemFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error creating marketplace item:', error);
      throw error;
    }
  }

  /**
   * Install marketplace item
   */
  async installItem(userId: string, request: InstallPluginRequest): Promise<MarketplaceInstallation> {
    try {
      const { itemId, projectId, config = {}, autoUpdate = true } = request;

      // Check if item exists and is approved
      const item = await this.getItemById(itemId);
      if (!item) {
        throw new Error('Marketplace item not found or not approved');
      }

      // Check if already installed
      const existingQuery = `
        SELECT * FROM marketplace_installations
        WHERE item_id = $1 AND user_id = $2 AND (project_id = $3 OR ($3 IS NULL AND project_id IS NULL))
        AND is_active = true
      `;

      const existingResult = await this.db.query(existingQuery, [itemId, userId, projectId]);

      if (existingResult.rows.length > 0) {
        throw new Error('Item already installed');
      }

      // Validate configuration against schema
      if (item.type === 'plugin' && item.configSchema) {
        this.validateConfig(config, item.configSchema);
      }

      // Create installation
      const installQuery = `
        INSERT INTO marketplace_installations (
          item_id, user_id, project_id, installed_version, is_active, auto_update, config
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `;

      const installResult = await this.db.query(installQuery, [
        itemId,
        userId,
        projectId,
        item.version,
        true,
        autoUpdate,
        JSON.stringify(config)
      ]);

      return this.mapInstallationFromRow(installResult.rows[0]);
    } catch (error) {
      console.error('Error installing marketplace item:', error);
      throw error;
    }
  }

  /**
   * Uninstall marketplace item
   */
  async uninstallItem(userId: string, itemId: string, projectId?: string): Promise<void> {
    try {
      const query = `
        UPDATE marketplace_installations
        SET is_active = false, updated_at = now()
        WHERE item_id = $1 AND user_id = $2 AND (project_id = $3 OR ($3 IS NULL AND project_id IS NULL))
      `;

      const result = await this.db.query(query, [itemId, userId, projectId]);

      if (result.rowCount === 0) {
        throw new Error('Installation not found');
      }
    } catch (error) {
      console.error('Error uninstalling marketplace item:', error);
      throw error;
    }
  }

  /**
   * Get user installations
   */
  async getUserInstallations(userId: string, projectId?: string): Promise<MarketplaceInstallation[]> {
    try {
      const query = `
        SELECT mi.*, mitem.name as item_name, mitem.type as item_type
        FROM marketplace_installations mi
        JOIN marketplace_items mitem ON mi.item_id = mitem.id
        WHERE mi.user_id = $1 AND mi.is_active = true
        ${projectId ? 'AND mi.project_id = $2' : 'AND mi.project_id IS NULL'}
        ORDER BY mi.installed_at DESC
      `;

      const params = projectId ? [userId, projectId] : [userId];
      const result = await this.db.query(query, params);

      return result.rows.map(row => this.mapInstallationFromRow(row));
    } catch (error) {
      console.error('Error getting user installations:', error);
      throw new Error('Failed to get user installations');
    }
  }

  /**
   * Create from template
   */
  async createFromTemplate(userId: string, request: CreateFromTemplateRequest): Promise<any> {
    try {
      const { itemId, projectName, variables = {}, targetPath = '' } = request;

      // Get template item
      const item = await this.getItemById(itemId);
      if (!item || item.type !== 'template') {
        throw new Error('Template not found');
      }

      const template = item.manifest as any;

      // Validate variables
      if (template.variables) {
        this.validateTemplateVariables(variables, template.variables);
      }

      // Process template files
      const processedFiles = this.processTemplateFiles(template.files, variables);

      // Return the processed template data
      return {
        projectName,
        files: processedFiles,
        targetPath
      };
    } catch (error) {
      console.error('Error creating from template:', error);
      throw error;
    }
  }

  /**
   * Submit item for review
   */
  async submitForReview(itemId: string, authorId: string): Promise<void> {
    try {
      const query = `
        UPDATE marketplace_items
        SET status = 'pending_review', updated_at = now()
        WHERE id = $1 AND author_id = $2 AND status = 'draft'
      `;

      const result = await this.db.query(query, [itemId, authorId]);

      if (result.rowCount === 0) {
        throw new Error('Item not found or not in draft status');
      }
    } catch (error) {
      console.error('Error submitting item for review:', error);
      throw error;
    }
  }

  /**
   * Review item (admin only)
   */
  async reviewItem(
    itemId: string,
    reviewerId: string,
    approved: boolean,
    rejectionReason?: string
  ): Promise<void> {
    try {
      const status = approved ? 'approved' : 'rejected';
      const publishedAt = approved ? 'now()' : null;

      const query = `
        UPDATE marketplace_items
        SET
          status = $1,
          verified = $2,
          verified_at = CASE WHEN $2 THEN now() ELSE NULL END,
          verified_by = CASE WHEN $2 THEN $3 ELSE NULL END,
          published_at = ${publishedAt},
          rejection_reason = $4,
          updated_at = now()
        WHERE id = $5 AND status = 'pending_review'
      `;

      const result = await this.db.query(query, [
        status,
        approved,
        reviewerId,
        rejectionReason,
        itemId
      ]);

      if (result.rowCount === 0) {
        throw new Error('Item not found or not pending review');
      }
    } catch (error) {
      console.error('Error reviewing item:', error);
      throw error;
    }
  }

  /**
   * Add review
   */
  async addReview(
    userId: string,
    itemId: string,
    rating: number,
    title?: string,
    content?: string
  ): Promise<MarketplaceReview> {
    try {
      if (rating < 1 || rating > 5) {
        throw new Error('Rating must be between 1 and 5');
      }

      const query = `
        INSERT INTO marketplace_reviews (item_id, user_id, rating, title, content)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (item_id, user_id)
        DO UPDATE SET rating = $3, title = $4, content = $5, updated_at = now()
        RETURNING *
      `;

      const result = await this.db.query(query, [itemId, userId, rating, title, content]);
      return this.mapReviewFromRow(result.rows[0]);
    } catch (error) {
      console.error('Error adding review:', error);
      throw error;
    }
  }

  /**
   * Get item reviews
   */
  async getItemReviews(itemId: string, limit = 10, offset = 0): Promise<MarketplaceReview[]> {
    try {
      const query = `
        SELECT mr.*, u.first_name || ' ' || u.last_name as user_name
        FROM marketplace_reviews mr
        JOIN users u ON mr.user_id = u.id
        WHERE mr.item_id = $1
        ORDER BY mr.created_at DESC
        LIMIT $2 OFFSET $3
      `;

      const result = await this.db.query(query, [itemId, limit, offset]);
      return result.rows.map(row => this.mapReviewFromRow(row));
    } catch (error) {
      console.error('Error getting item reviews:', error);
      throw new Error('Failed to get item reviews');
    }
  }

  /**
   * Private helper methods
   */
  private async getFacets(filters: MarketplaceSearchFilters): Promise<any> {
    // Implementation for getting search facets would go here
    // This would return category counts, tag counts, etc.
    return {
      categories: [],
      tags: [],
      runtimes: []
    };
  }

  private generateSlug(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '');
  }

  private validateConfig(config: any, schema: any): void {
    // Validate configuration against schema
    for (const [key, schemaField] of Object.entries(schema) as [string, any][]) {
      if (schemaField.required && !(key in config)) {
        throw new Error(`Required configuration field missing: ${key}`);
      }

      if (key in config) {
        const value = config[key];
        this.validateConfigField(value, schemaField, key);
      }
    }
  }

  private validateConfigField(value: any, schema: any, fieldName: string): void {
    switch (schema.type) {
      case 'string':
        if (typeof value !== 'string') {
          throw new Error(`Configuration field ${fieldName} must be a string`);
        }
        break;
      case 'number':
        if (typeof value !== 'number') {
          throw new Error(`Configuration field ${fieldName} must be a number`);
        }
        break;
      case 'boolean':
        if (typeof value !== 'boolean') {
          throw new Error(`Configuration field ${fieldName} must be a boolean`);
        }
        break;
      case 'select':
        if (schema.options && !schema.options.some((opt: any) => opt.value === value)) {
          throw new Error(`Configuration field ${fieldName} has invalid value`);
        }
        break;
    }
  }

  private validateTemplateVariables(variables: any, schema: any): void {
    for (const [key, schemaField] of Object.entries(schema) as [string, any][]) {
      if (schemaField.required && !(key in variables)) {
        throw new Error(`Required template variable missing: ${key}`);
      }

      if (key in variables) {
        const value = variables[key];
        this.validateConfigField(value, schemaField, key);
      }
    }
  }

  private processTemplateFiles(files: any[], variables: any): any[] {
    return files.map(file => {
      if (file.template && file.content) {
        // Simple template processing - replace {{variable}} with values
        let processedContent = file.content;
        for (const [key, value] of Object.entries(variables)) {
          const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
          processedContent = processedContent.replace(regex, String(value));
        }

        return {
          ...file,
          content: processedContent
        };
      }

      return file;
    });
  }

  private mapMarketplaceItemFromRow(row: any): MarketplaceItem {
    return {
      id: row.id,
      type: row.type,
      slug: row.slug,
      name: row.name,
      description: row.description,
      authorId: row.author_id,
      authorName: row.author_name,
      authorEmail: row.author_email,
      version: row.version,
      versionHistory: row.version_history || [],
      manifest: row.manifest,
      category: row.category,
      tags: row.tags || [],
      iconUrl: row.icon_url,
      bannerUrl: row.banner_url,
      screenshots: row.screenshots || [],
      documentationUrl: row.documentation_url,
      repositoryUrl: row.repository_url,
      license: row.license,
      verified: row.verified,
      verifiedAt: row.verified_at ? new Date(row.verified_at) : undefined,
      verifiedBy: row.verified_by,
      featured: row.featured,
      installs: row.installs,
      ratingAverage: parseFloat(row.rating_average) || 0,
      ratingCount: row.rating_count,
      status: row.status,
      rejectionReason: row.rejection_reason,
      runtime: row.runtime,
      entryPoint: row.entry_point,
      permissions: row.permissions || [],
      dependencies: row.dependencies || {},
      configSchema: row.config_schema,
      templateType: row.template_type,
      templateData: row.template_data,
      price: parseFloat(row.price) || 0,
      currency: row.currency,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
      publishedAt: row.published_at ? new Date(row.published_at) : undefined
    };
  }

  private mapInstallationFromRow(row: any): MarketplaceInstallation {
    return {
      id: row.id,
      itemId: row.item_id,
      userId: row.user_id,
      projectId: row.project_id,
      installedVersion: row.installed_version,
      isActive: row.is_active,
      autoUpdate: row.auto_update,
      config: row.config || {},
      lastUsedAt: row.last_used_at ? new Date(row.last_used_at) : undefined,
      usageCount: row.usage_count,
      installedAt: new Date(row.installed_at),
      updatedAt: new Date(row.updated_at)
    };
  }

  private mapReviewFromRow(row: any): MarketplaceReview {
    return {
      id: row.id,
      itemId: row.item_id,
      userId: row.user_id,
      rating: row.rating,
      title: row.title,
      content: row.content,
      helpfulCount: row.helpful_count,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at)
    };
  }
}