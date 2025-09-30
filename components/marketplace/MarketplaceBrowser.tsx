import React, { useState, useEffect, useMemo } from 'react';
import { Search, Filter, Star, Download, Shield, Tag, Grid, List } from 'lucide-react';
import {
  MarketplaceItem,
  MarketplaceSearchFilters,
  MarketplaceSearchResult,
  MarketplaceItemType
} from '@/lib/types/marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { Slider } from '@/components/ui/slider';
import { useMarketplace } from '@/lib/hooks/useMarketplace';
import { MarketplaceItemCard } from './MarketplaceItemCard';
import { MarketplaceItemDetails } from './MarketplaceItemDetails';

interface MarketplaceBrowserProps {
  userId: string;
  projectId?: string;
  onInstall?: (item: MarketplaceItem) => void;
  className?: string;
}

const CATEGORIES = [
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

const SORT_OPTIONS = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'installs', label: 'Most Installed' },
  { value: 'rating', label: 'Highest Rated' },
  { value: 'recent', label: 'Recently Added' },
  { value: 'name', label: 'Name' }
];

export function MarketplaceBrowser({
  userId,
  projectId,
  onInstall,
  className = ''
}: MarketplaceBrowserProps) {
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showFilters, setShowFilters] = useState(false);

  const [filters, setFilters] = useState<MarketplaceSearchFilters>({
    limit: 20,
    offset: 0,
    sortBy: 'relevance'
  });

  const {
    searchResult,
    loading,
    error,
    searchItems,
    installItem,
    uninstallItem,
    userInstallations
  } = useMarketplace(userId, projectId);

  // Search when filters change
  useEffect(() => {
    searchItems(filters);
  }, [filters, searchItems]);

  const handleFilterChange = (key: keyof MarketplaceSearchFilters, value: any) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      offset: 0 // Reset pagination when filters change
    }));
  };

  const handleSearch = (query: string) => {
    handleFilterChange('query', query);
  };

  const handleInstall = async (item: MarketplaceItem) => {
    try {
      await installItem({
        itemId: item.id,
        projectId,
        autoUpdate: true
      });

      onInstall?.(item);
    } catch (error) {
      console.error('Failed to install item:', error);
    }
  };

  const handleUninstall = async (item: MarketplaceItem) => {
    try {
      await uninstallItem(item.id, projectId);
    } catch (error) {
      console.error('Failed to uninstall item:', error);
    }
  };

  const isInstalled = (itemId: string) => {
    return userInstallations.some(inst => inst.itemId === itemId && inst.isActive);
  };

  const loadMore = () => {
    if (searchResult && searchResult.hasMore) {
      setFilters(prev => ({
        ...prev,
        offset: prev.offset! + prev.limit!
      }));
    }
  };

  if (selectedItem) {
    return (
      <MarketplaceItemDetails
        item={selectedItem}
        isInstalled={isInstalled(selectedItem.id)}
        onInstall={() => handleInstall(selectedItem)}
        onUninstall={() => handleUninstall(selectedItem)}
        onBack={() => setSelectedItem(null)}
        className={className}
      />
    );
  }

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Marketplace</h1>
              <p className="text-muted-foreground">
                Discover and install plugins and templates
              </p>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              >
                {viewMode === 'grid' ? <List className="h-4 w-4" /> : <Grid className="h-4 w-4" />}
              </Button>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowFilters(!showFilters)}
              >
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
            </div>
          </div>

          {/* Search and Quick Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search plugins and templates..."
                value={filters.query || ''}
                onChange={(e) => handleSearch(e.target.value)}
                className="pl-9"
              />
            </div>

            <Tabs
              value={filters.type || 'all'}
              onValueChange={(value) => handleFilterChange('type', value === 'all' ? undefined : value)}
            >
              <TabsList>
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="plugin">Plugins</TabsTrigger>
                <TabsTrigger value="template">Templates</TabsTrigger>
              </TabsList>
            </Tabs>

            <Select
              value={filters.sortBy}
              onValueChange={(value) => handleFilterChange('sortBy', value)}
            >
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Advanced Filters */}
        {showFilters && (
          <div className="border-t p-6 bg-muted/30">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Categories */}
              <div>
                <h3 className="font-medium mb-3">Categories</h3>
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {CATEGORIES.map(category => (
                    <div key={category.id} className="flex items-center space-x-2">
                      <Checkbox
                        id={category.id}
                        checked={filters.category === category.id}
                        onCheckedChange={(checked) =>
                          handleFilterChange('category', checked ? category.id : undefined)
                        }
                      />
                      <label
                        htmlFor={category.id}
                        className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
                      >
                        {category.icon} {category.name}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              {/* Verification and Features */}
              <div>
                <h3 className="font-medium mb-3">Verification</h3>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="verified"
                      checked={filters.verified}
                      onCheckedChange={(checked) =>
                        handleFilterChange('verified', checked || undefined)
                      }
                    />
                    <label htmlFor="verified" className="text-sm cursor-pointer">
                      <Shield className="h-4 w-4 inline mr-1" />
                      Verified only
                    </label>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="featured"
                      checked={filters.featured}
                      onCheckedChange={(checked) =>
                        handleFilterChange('featured', checked || undefined)
                      }
                    />
                    <label htmlFor="featured" className="text-sm cursor-pointer">
                      <Star className="h-4 w-4 inline mr-1" />
                      Featured only
                    </label>
                  </div>
                </div>
              </div>

              {/* Rating and Price */}
              <div>
                <h3 className="font-medium mb-3">Rating & Price</h3>
                <div className="space-y-4">
                  <div>
                    <label className="text-sm text-muted-foreground mb-2 block">
                      Minimum Rating: {filters.minRating || 0}
                    </label>
                    <Slider
                      value={[filters.minRating || 0]}
                      onValueChange={([value]) => handleFilterChange('minRating', value)}
                      max={5}
                      step={0.5}
                      className="w-full"
                    />
                  </div>

                  <div className="flex gap-2">
                    <div className="flex-1">
                      <label className="text-sm text-muted-foreground mb-1 block">
                        Min Price
                      </label>
                      <Input
                        type="number"
                        placeholder="0"
                        value={filters.priceMin || ''}
                        onChange={(e) => handleFilterChange('priceMin', parseFloat(e.target.value) || undefined)}
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-sm text-muted-foreground mb-1 block">
                        Max Price
                      </label>
                      <Input
                        type="number"
                        placeholder="∞"
                        value={filters.priceMax || ''}
                        onChange={(e) => handleFilterChange('priceMax', parseFloat(e.target.value) || undefined)}
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-between mt-4">
              <Button
                variant="outline"
                onClick={() => setFilters({ limit: 20, offset: 0, sortBy: 'relevance' })}
              >
                Clear Filters
              </Button>

              <div className="text-sm text-muted-foreground">
                {searchResult?.total || 0} items found
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {loading && !searchResult ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-destructive mb-2">Failed to load marketplace items</p>
              <Button variant="outline" onClick={() => searchItems(filters)}>
                Retry
              </Button>
            </div>
          </div>
        ) : !searchResult || searchResult.items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <p className="text-muted-foreground mb-2">No items found</p>
              <p className="text-sm text-muted-foreground">
                Try adjusting your search or filters
              </p>
            </div>
          </div>
        ) : (
          <div className="h-full overflow-y-auto p-6">
            <div
              className={
                viewMode === 'grid'
                  ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6'
                  : 'space-y-4'
              }
            >
              {searchResult.items.map((item) => (
                <MarketplaceItemCard
                  key={item.id}
                  item={item}
                  viewMode={viewMode}
                  isInstalled={isInstalled(item.id)}
                  onInstall={() => handleInstall(item)}
                  onUninstall={() => handleUninstall(item)}
                  onViewDetails={() => setSelectedItem(item)}
                />
              ))}
            </div>

            {/* Load More */}
            {searchResult.hasMore && (
              <div className="flex justify-center mt-8">
                <Button
                  variant="outline"
                  onClick={loadMore}
                  disabled={loading}
                >
                  {loading ? 'Loading...' : 'Load More'}
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}