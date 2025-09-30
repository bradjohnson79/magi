import { useState, useCallback, useEffect } from 'react';
import {
  MarketplaceItem,
  MarketplaceInstallation,
  MarketplaceSearchFilters,
  MarketplaceSearchResult,
  InstallPluginRequest,
  CreateFromTemplateRequest,
  ExecutePluginRequest,
  PluginExecutionResult
} from '@/lib/types/marketplace';

interface UseMarketplaceReturn {
  // Search and listing
  searchResult: MarketplaceSearchResult | null;
  loading: boolean;
  error: string | null;

  // User installations
  userInstallations: MarketplaceInstallation[];
  installationsLoading: boolean;

  // Actions
  searchItems: (filters: MarketplaceSearchFilters) => Promise<void>;
  getItem: (itemId: string) => Promise<MarketplaceItem | null>;
  installItem: (request: InstallPluginRequest) => Promise<MarketplaceInstallation>;
  uninstallItem: (itemId: string, projectId?: string) => Promise<void>;
  createFromTemplate: (request: CreateFromTemplateRequest) => Promise<any>;
  executePlugin: (request: ExecutePluginRequest) => Promise<PluginExecutionResult>;

  // Refresh
  refreshInstallations: () => Promise<void>;
}

export function useMarketplace(userId: string, projectId?: string): UseMarketplaceReturn {
  const [searchResult, setSearchResult] = useState<MarketplaceSearchResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [userInstallations, setUserInstallations] = useState<MarketplaceInstallation[]>([]);
  const [installationsLoading, setInstallationsLoading] = useState(false);

  // Search marketplace items
  const searchItems = useCallback(async (filters: MarketplaceSearchFilters) => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          if (Array.isArray(value)) {
            value.forEach(v => params.append(key, v.toString()));
          } else {
            params.append(key, value.toString());
          }
        }
      });

      const response = await fetch(`/api/v1/marketplace?${params}`);

      if (!response.ok) {
        throw new Error('Failed to search marketplace items');
      }

      const result = await response.json();

      // If this is a pagination request (offset > 0), append to existing results
      if (filters.offset && filters.offset > 0 && searchResult) {
        setSearchResult({
          ...result,
          items: [...searchResult.items, ...result.items]
        });
      } else {
        setSearchResult(result);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to search marketplace');
    } finally {
      setLoading(false);
    }
  }, [searchResult]);

  // Get specific item
  const getItem = useCallback(async (itemId: string): Promise<MarketplaceItem | null> => {
    try {
      const response = await fetch(`/api/v1/marketplace/${itemId}`);

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error('Failed to get marketplace item');
      }

      return response.json();
    } catch (err) {
      console.error('Error getting marketplace item:', err);
      return null;
    }
  }, []);

  // Install item
  const installItem = useCallback(async (request: InstallPluginRequest): Promise<MarketplaceInstallation> => {
    try {
      const response = await fetch('/api/v1/marketplace/install', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to install item');
      }

      const installation = await response.json();

      // Refresh installations list
      await refreshInstallations();

      return installation;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to install item');
    }
  }, []);

  // Uninstall item
  const uninstallItem = useCallback(async (itemId: string, projectId?: string): Promise<void> => {
    try {
      const response = await fetch('/api/v1/marketplace/uninstall', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ itemId, projectId })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to uninstall item');
      }

      // Refresh installations list
      await refreshInstallations();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to uninstall item');
    }
  }, []);

  // Create from template
  const createFromTemplate = useCallback(async (request: CreateFromTemplateRequest): Promise<any> => {
    try {
      const response = await fetch('/api/v1/marketplace/template/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create from template');
      }

      return response.json();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create from template');
    }
  }, []);

  // Execute plugin
  const executePlugin = useCallback(async (request: ExecutePluginRequest): Promise<PluginExecutionResult> => {
    try {
      const response = await fetch('/api/v1/plugins/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to execute plugin');
      }

      return response.json();
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Failed to execute plugin'
      };
    }
  }, []);

  // Load user installations
  const refreshInstallations = useCallback(async () => {
    if (!userId) return;

    setInstallationsLoading(true);
    try {
      const params = new URLSearchParams();
      if (projectId) params.append('projectId', projectId);

      const response = await fetch(`/api/v1/marketplace/installations?${params}`);

      if (response.ok) {
        const data = await response.json();
        setUserInstallations(data.installations || []);
      }
    } catch (err) {
      console.error('Failed to load user installations:', err);
    } finally {
      setInstallationsLoading(false);
    }
  }, [userId, projectId]);

  // Load installations on mount and when dependencies change
  useEffect(() => {
    refreshInstallations();
  }, [refreshInstallations]);

  return {
    searchResult,
    loading,
    error,
    userInstallations,
    installationsLoading,
    searchItems,
    getItem,
    installItem,
    uninstallItem,
    createFromTemplate,
    executePlugin,
    refreshInstallations
  };
}

// Hook for plugin execution
export function usePluginExecution(userId: string, projectId?: string) {
  const [executions, setExecutions] = useState<Record<string, PluginExecutionResult>>({});
  const [loading, setLoading] = useState<Record<string, boolean>>({});

  const executePlugin = useCallback(async (
    installationId: string,
    inputs: Record<string, any>
  ): Promise<PluginExecutionResult> => {
    setLoading(prev => ({ ...prev, [installationId]: true }));

    try {
      const response = await fetch('/api/v1/plugins/execute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          installationId,
          inputs,
          projectId
        })
      });

      const result = await response.json();

      setExecutions(prev => ({ ...prev, [installationId]: result }));

      return result;
    } catch (err) {
      const errorResult: PluginExecutionResult = {
        success: false,
        error: err instanceof Error ? err.message : 'Execution failed'
      };

      setExecutions(prev => ({ ...prev, [installationId]: errorResult }));

      return errorResult;
    } finally {
      setLoading(prev => ({ ...prev, [installationId]: false }));
    }
  }, [projectId]);

  const getExecutionResult = useCallback((installationId: string) => {
    return executions[installationId] || null;
  }, [executions]);

  const isExecuting = useCallback((installationId: string) => {
    return loading[installationId] || false;
  }, [loading]);

  return {
    executePlugin,
    getExecutionResult,
    isExecuting
  };
}

// Hook for marketplace statistics
export function useMarketplaceStats() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(false);

  const loadStats = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/v1/marketplace/stats');
      if (response.ok) {
        const data = await response.json();
        setStats(data);
      }
    } catch (err) {
      console.error('Failed to load marketplace stats:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  return { stats, loading, refresh: loadStats };
}

// Hook for managing user's own marketplace items
export function useMyMarketplaceItems(userId: string) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(false);

  const loadMyItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/v1/marketplace/my-items`);
      if (response.ok) {
        const data = await response.json();
        setItems(data.items || []);
      }
    } catch (err) {
      console.error('Failed to load my marketplace items:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const createItem = useCallback(async (itemData: any): Promise<MarketplaceItem> => {
    try {
      const response = await fetch('/api/v1/marketplace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(itemData)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to create item');
      }

      const newItem = await response.json();
      setItems(prev => [newItem, ...prev]);

      return newItem;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to create item');
    }
  }, []);

  const updateItem = useCallback(async (itemId: string, updates: any): Promise<MarketplaceItem> => {
    try {
      const response = await fetch(`/api/v1/marketplace/${itemId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update item');
      }

      const updatedItem = await response.json();
      setItems(prev => prev.map(item => item.id === itemId ? updatedItem : item));

      return updatedItem;
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to update item');
    }
  }, []);

  const submitForReview = useCallback(async (itemId: string): Promise<void> => {
    try {
      const response = await fetch(`/api/v1/marketplace/${itemId}/submit`, {
        method: 'POST'
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit for review');
      }

      // Refresh items to get updated status
      await loadMyItems();
    } catch (err) {
      throw err instanceof Error ? err : new Error('Failed to submit for review');
    }
  }, [loadMyItems]);

  useEffect(() => {
    if (userId) {
      loadMyItems();
    }
  }, [userId, loadMyItems]);

  return {
    items,
    loading,
    createItem,
    updateItem,
    submitForReview,
    refresh: loadMyItems
  };
}