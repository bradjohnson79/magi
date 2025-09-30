import React, { useState, useEffect } from 'react';
import {
  ArrowLeft, Star, Download, Shield, ExternalLink, Github, Book,
  Settings, ChevronDown, ChevronUp, Tag, Clock, User, AlertTriangle
} from 'lucide-react';
import { MarketplaceItem, MarketplaceReview, PluginManifest, TemplateManifest } from '@/lib/types/marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { Avatar } from '@/components/ui/avatar';
import { Progress } from '@/components/ui/progress';
import { formatDistanceToNow } from 'date-fns';

interface MarketplaceItemDetailsProps {
  item: MarketplaceItem;
  isInstalled: boolean;
  onInstall: () => void;
  onUninstall: () => void;
  onBack: () => void;
  className?: string;
}

export function MarketplaceItemDetails({
  item,
  isInstalled,
  onInstall,
  onUninstall,
  onBack,
  className = ''
}: MarketplaceItemDetailsProps) {
  const [reviews, setReviews] = useState<MarketplaceReview[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(false);
  const [showAllScreenshots, setShowAllScreenshots] = useState(false);
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['overview']));

  useEffect(() => {
    loadReviews();
  }, [item.id]);

  const loadReviews = async () => {
    setLoadingReviews(true);
    try {
      // Load reviews from API
      const response = await fetch(`/api/v1/marketplace/${item.id}/reviews`);
      const data = await response.json();
      setReviews(data.reviews || []);
    } catch (error) {
      console.error('Failed to load reviews:', error);
    } finally {
      setLoadingReviews(false);
    }
  };

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const getRatingDistribution = () => {
    const distribution = [0, 0, 0, 0, 0];
    reviews.forEach(review => {
      distribution[review.rating - 1]++;
    });
    return distribution.reverse(); // 5 stars first
  };

  const formatInstalls = (count: number) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const manifest = item.manifest as PluginManifest | TemplateManifest;
  const isPlugin = item.type === 'plugin';
  const pluginManifest = isPlugin ? manifest as PluginManifest : null;
  const templateManifest = !isPlugin ? manifest as TemplateManifest : null;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-6">
          <div className="flex items-center gap-4 mb-4">
            <Button variant="ghost" size="sm" onClick={onBack}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
          </div>

          <div className="flex flex-col lg:flex-row gap-6">
            {/* Item Icon and Basic Info */}
            <div className="flex items-start gap-4">
              {item.iconUrl ? (
                <img
                  src={item.iconUrl}
                  alt={item.name}
                  className="w-24 h-24 rounded-xl object-cover"
                />
              ) : (
                <div className="w-24 h-24 rounded-xl bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                  <span className="text-white font-bold text-3xl">
                    {item.name.charAt(0).toUpperCase()}
                  </span>
                </div>
              )}

              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h1 className="text-3xl font-bold">{item.name}</h1>
                  {item.verified && (
                    <Shield className="h-6 w-6 text-blue-600" title="Verified" />
                  )}
                  {item.featured && (
                    <Star className="h-6 w-6 text-yellow-500" title="Featured" />
                  )}
                </div>

                <p className="text-muted-foreground text-lg mb-3">
                  {item.description}
                </p>

                <div className="flex items-center gap-4 text-sm text-muted-foreground mb-4">
                  <div className="flex items-center gap-2">
                    <Avatar className="h-6 w-6">
                      <div className="w-full h-full bg-gradient-to-br from-gray-400 to-gray-600 flex items-center justify-center text-white text-xs">
                        {item.authorName.charAt(0).toUpperCase()}
                      </div>
                    </Avatar>
                    <span>by {item.authorName}</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Star className="h-4 w-4 fill-current text-yellow-400" />
                    <span className="font-medium">{item.ratingAverage.toFixed(1)}</span>
                    <span>({item.ratingCount} reviews)</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Download className="h-4 w-4" />
                    <span>{formatInstalls(item.installs)} installs</span>
                  </div>

                  <div className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    <span>Updated {formatDistanceToNow(item.updatedAt, { addSuffix: true })}</span>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2 mb-4">
                  <Badge variant="secondary">{item.type}</Badge>
                  {item.category && (
                    <Badge variant="outline">{item.category}</Badge>
                  )}
                  {item.runtime && (
                    <Badge variant="outline">{item.runtime}</Badge>
                  )}
                  <Badge variant="outline">v{item.version}</Badge>
                  <Badge variant="outline">{item.license}</Badge>
                </div>

                {item.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {item.tags.map(tag => (
                      <Badge key={tag} variant="outline" className="text-xs">
                        <Tag className="h-2 w-2 mr-1" />
                        {tag}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Actions and Links */}
            <div className="lg:w-64 flex-shrink-0">
              <div className="space-y-3">
                {isInstalled ? (
                  <Button onClick={onUninstall} variant="outline" className="w-full">
                    Uninstall
                  </Button>
                ) : (
                  <Button onClick={onInstall} className="w-full" size="lg">
                    Install {item.price > 0 && `($${item.price})`}
                  </Button>
                )}

                <div className="flex gap-2">
                  {item.repositoryUrl && (
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer">
                        <Github className="h-4 w-4 mr-1" />
                        Source
                      </a>
                    </Button>
                  )}

                  {item.documentationUrl && (
                    <Button variant="outline" size="sm" asChild className="flex-1">
                      <a href={item.documentationUrl} target="_blank" rel="noopener noreferrer">
                        <Book className="h-4 w-4 mr-1" />
                        Docs
                      </a>
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="p-6">
          <Tabs defaultValue="overview" className="w-full">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="reviews">Reviews</TabsTrigger>
              <TabsTrigger value="details">Details</TabsTrigger>
              <TabsTrigger value="permissions">Permissions</TabsTrigger>
            </TabsList>

            <TabsContent value="overview" className="mt-6">
              <div className="space-y-6">
                {/* Screenshots */}
                {item.screenshots.length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Screenshots</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {(showAllScreenshots ? item.screenshots : item.screenshots.slice(0, 6)).map((screenshot, index) => (
                        <img
                          key={index}
                          src={screenshot}
                          alt={`Screenshot ${index + 1}`}
                          className="rounded-lg border object-cover w-full h-48"
                        />
                      ))}
                    </div>
                    {item.screenshots.length > 6 && (
                      <Button
                        variant="outline"
                        onClick={() => setShowAllScreenshots(!showAllScreenshots)}
                        className="mt-3"
                      >
                        {showAllScreenshots ? 'Show Less' : `Show All (${item.screenshots.length})`}
                      </Button>
                    )}
                  </div>
                )}

                {/* Description */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Description</h3>
                  <div className="prose prose-sm max-w-none">
                    <p>{item.description}</p>
                  </div>
                </div>

                {/* Configuration Options */}
                {isPlugin && pluginManifest?.config && Object.keys(pluginManifest.config).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Configuration Options</h3>
                    <div className="space-y-3">
                      {Object.entries(pluginManifest.config).map(([key, config]) => (
                        <div key={key} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{config.label}</h4>
                            {config.required && (
                              <Badge variant="destructive" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {config.description && (
                            <p className="text-sm text-muted-foreground mb-2">{config.description}</p>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Type: {config.type}
                            {config.default && ` • Default: ${JSON.stringify(config.default)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template Variables */}
                {!isPlugin && templateManifest?.variables && Object.keys(templateManifest.variables).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Template Variables</h3>
                    <div className="space-y-3">
                      {Object.entries(templateManifest.variables).map(([key, variable]) => (
                        <div key={key} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="font-medium">{variable.label}</h4>
                            {variable.required && (
                              <Badge variant="destructive" className="text-xs">Required</Badge>
                            )}
                          </div>
                          {variable.description && (
                            <p className="text-sm text-muted-foreground mb-2">{variable.description}</p>
                          )}
                          <div className="text-xs text-muted-foreground">
                            Type: {variable.type}
                            {variable.default && ` • Default: ${JSON.stringify(variable.default)}`}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="reviews" className="mt-6">
              <div className="space-y-6">
                {/* Rating Summary */}
                <div className="flex flex-col md:flex-row gap-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold mb-2">{item.ratingAverage.toFixed(1)}</div>
                    <div className="flex items-center justify-center gap-1 mb-2">
                      {[1, 2, 3, 4, 5].map(star => (
                        <Star
                          key={star}
                          className={`h-4 w-4 ${
                            star <= Math.round(item.ratingAverage)
                              ? 'fill-current text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        />
                      ))}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.ratingCount} reviews
                    </div>
                  </div>

                  <div className="flex-1">
                    {getRatingDistribution().map((count, index) => {
                      const stars = 5 - index;
                      const percentage = item.ratingCount > 0 ? (count / item.ratingCount) * 100 : 0;
                      return (
                        <div key={stars} className="flex items-center gap-2 mb-1">
                          <div className="flex items-center gap-1 w-16">
                            <span className="text-sm">{stars}</span>
                            <Star className="h-3 w-3 fill-current text-yellow-400" />
                          </div>
                          <Progress value={percentage} className="flex-1 h-2" />
                          <span className="text-sm text-muted-foreground w-12 text-right">
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator />

                {/* Reviews List */}
                {loadingReviews ? (
                  <div className="text-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                  </div>
                ) : reviews.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">No reviews yet</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {reviews.map(review => (
                      <div key={review.id} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1">
                              {[1, 2, 3, 4, 5].map(star => (
                                <Star
                                  key={star}
                                  className={`h-3 w-3 ${
                                    star <= review.rating
                                      ? 'fill-current text-yellow-400'
                                      : 'text-gray-300'
                                  }`}
                                />
                              ))}
                            </div>
                            <span className="font-medium text-sm">Anonymous User</span>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDistanceToNow(review.createdAt, { addSuffix: true })}
                          </span>
                        </div>
                        {review.title && (
                          <h4 className="font-medium mb-1">{review.title}</h4>
                        )}
                        {review.content && (
                          <p className="text-sm text-muted-foreground">{review.content}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="details" className="mt-6">
              <div className="space-y-6">
                {/* Basic Information */}
                <div>
                  <h3 className="text-lg font-semibold mb-3">Information</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <div><strong>Version:</strong> {item.version}</div>
                      <div><strong>Type:</strong> {item.type}</div>
                      <div><strong>Category:</strong> {item.category || 'None'}</div>
                      <div><strong>License:</strong> {item.license}</div>
                      {item.runtime && <div><strong>Runtime:</strong> {item.runtime}</div>}
                    </div>
                    <div className="space-y-2">
                      <div><strong>Author:</strong> {item.authorName}</div>
                      <div><strong>Created:</strong> {formatDistanceToNow(item.createdAt, { addSuffix: true })}</div>
                      <div><strong>Updated:</strong> {formatDistanceToNow(item.updatedAt, { addSuffix: true })}</div>
                      <div><strong>Installs:</strong> {formatInstalls(item.installs)}</div>
                    </div>
                  </div>
                </div>

                {/* Dependencies */}
                {isPlugin && pluginManifest?.dependencies && Object.keys(pluginManifest.dependencies).length > 0 && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Dependencies</h3>
                    <div className="space-y-2">
                      {Object.entries(pluginManifest.dependencies).map(([name, version]) => (
                        <div key={name} className="flex items-center justify-between p-2 border rounded">
                          <span className="font-mono text-sm">{name}</span>
                          <Badge variant="outline" className="text-xs">{version}</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Template Files */}
                {!isPlugin && templateManifest?.files && (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Template Files</h3>
                    <div className="space-y-1">
                      {templateManifest.files.map((file, index) => (
                        <div key={index} className="flex items-center justify-between p-2 border rounded text-sm">
                          <span className="font-mono">{file.path}</span>
                          <div className="flex gap-1">
                            {file.template && <Badge variant="outline" className="text-xs">Template</Badge>}
                            {file.binary && <Badge variant="outline" className="text-xs">Binary</Badge>}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="permissions" className="mt-6">
              <div className="space-y-6">
                <div className="flex items-start gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                  <div>
                    <h4 className="font-medium text-yellow-800">Security Notice</h4>
                    <p className="text-sm text-yellow-700 mt-1">
                      Review the permissions this {item.type} requires before installing.
                      Only install from trusted authors.
                    </p>
                  </div>
                </div>

                {isPlugin && pluginManifest?.permissions ? (
                  <div>
                    <h3 className="text-lg font-semibold mb-3">Required Permissions</h3>
                    <div className="space-y-3">
                      {pluginManifest.permissions.map((permission) => {
                        const [category, action] = permission.split(':');
                        const isHighRisk = permission.includes('execute:') || permission.includes('delete');

                        return (
                          <div key={permission} className="flex items-center justify-between p-3 border rounded-lg">
                            <div className="flex items-center gap-3">
                              <div className={`w-2 h-2 rounded-full ${
                                isHighRisk ? 'bg-red-500' : 'bg-yellow-500'
                              }`} />
                              <div>
                                <div className="font-medium">{permission}</div>
                                <div className="text-sm text-muted-foreground">
                                  {getPermissionDescription(permission)}
                                </div>
                              </div>
                            </div>
                            <Badge variant={isHighRisk ? 'destructive' : 'secondary'} className="text-xs">
                              {isHighRisk ? 'High Risk' : 'Medium Risk'}
                            </Badge>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <p className="text-muted-foreground">
                      This {item.type} doesn't require any special permissions.
                    </p>
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}

function getPermissionDescription(permission: string): string {
  const descriptions: Record<string, string> = {
    'filesystem:read': 'Read files from your project',
    'filesystem:write': 'Create and modify files in your project',
    'filesystem:delete': 'Delete files from your project',
    'network:http': 'Make HTTP requests to external services',
    'network:websocket': 'Open WebSocket connections',
    'ai:generate': 'Use AI generation capabilities',
    'ai:analyze': 'Use AI analysis capabilities',
    'database:read': 'Read from project database',
    'database:write': 'Modify project database',
    'execute:command': 'Execute system commands',
    'execute:script': 'Run scripts on your system',
    'env:read': 'Read environment variables',
    'env:write': 'Modify environment variables'
  };

  return descriptions[permission] || 'Permission description not available';
}