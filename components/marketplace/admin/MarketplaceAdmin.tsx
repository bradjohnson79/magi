import React, { useState, useEffect } from 'react';
import {
  Check, X, Eye, AlertTriangle, Shield, Clock, User, Tag,
  Filter, Search, ExternalLink, FileText, Code, Settings
} from 'lucide-react';
import {
  MarketplaceItem,
  MarketplaceItemStatus,
  PluginManifest,
  PermissionValidator
} from '@/lib/types/marketplace';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { formatDistanceToNow } from 'date-fns';

interface MarketplaceAdminProps {
  userId: string;
  className?: string;
}

export function MarketplaceAdmin({ userId, className = '' }: MarketplaceAdminProps) {
  const [items, setItems] = useState<MarketplaceItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<MarketplaceItem | null>(null);
  const [reviewModalOpen, setReviewModalOpen] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filters, setFilters] = useState({
    status: 'pending_review' as MarketplaceItemStatus,
    search: '',
    type: 'all'
  });

  useEffect(() => {
    loadItems();
  }, [filters]);

  const loadItems = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filters.status) params.append('status', filters.status);
      if (filters.search) params.append('search', filters.search);
      if (filters.type !== 'all') params.append('type', filters.type);

      const response = await fetch(`/api/v1/admin/marketplace/items?${params}`);
      const data = await response.json();
      setItems(data.items || []);
    } catch (error) {
      console.error('Failed to load items:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleReview = async (itemId: string, approved: boolean, reason?: string) => {
    try {
      const response = await fetch(`/api/v1/marketplace/${itemId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          approved,
          rejectionReason: reason
        })
      });

      if (response.ok) {
        await loadItems();
        setReviewModalOpen(false);
        setRejectionReason('');
        setSelectedItem(null);
      }
    } catch (error) {
      console.error('Failed to review item:', error);
    }
  };

  const getStatusBadge = (status: MarketplaceItemStatus) => {
    switch (status) {
      case 'pending_review':
        return <Badge variant="secondary"><Clock className="h-3 w-3 mr-1" />Pending Review</Badge>;
      case 'approved':
        return <Badge variant="default"><Check className="h-3 w-3 mr-1" />Approved</Badge>;
      case 'rejected':
        return <Badge variant="destructive"><X className="h-3 w-3 mr-1" />Rejected</Badge>;
      case 'draft':
        return <Badge variant="outline">Draft</Badge>;
      case 'deprecated':
        return <Badge variant="secondary">Deprecated</Badge>;
    }
  };

  const getSecurityAssessment = (item: MarketplaceItem) => {
    if (item.type !== 'plugin') return { level: 'low', issues: [] };

    const manifest = item.manifest as PluginManifest;
    const validation = PermissionValidator.validatePermissions(manifest.permissions);

    return {
      level: PermissionValidator.getRiskLevel(manifest.permissions),
      issues: [...validation.warnings, ...validation.risks]
    };
  };

  const pendingCount = items.filter(item => item.status === 'pending_review').length;

  return (
    <div className={`flex flex-col h-full ${className}`}>
      {/* Header */}
      <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h1 className="text-2xl font-bold">Marketplace Administration</h1>
              <p className="text-muted-foreground">
                Review and manage marketplace submissions
              </p>
            </div>

            {pendingCount > 0 && (
              <Badge variant="destructive" className="animate-pulse">
                {pendingCount} pending review
              </Badge>
            )}
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search items..."
                value={filters.search}
                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                className="pl-9"
              />
            </div>

            <Select
              value={filters.status}
              onValueChange={(value) => setFilters(prev => ({ ...prev, status: value as MarketplaceItemStatus }))}
            >
              <SelectTrigger className="w-48">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending_review">Pending Review</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="draft">Draft</SelectItem>
                <SelectItem value="deprecated">Deprecated</SelectItem>
              </SelectContent>
            </Select>

            <Select
              value={filters.type}
              onValueChange={(value) => setFilters(prev => ({ ...prev, type: value }))}
            >
              <SelectTrigger className="w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="plugin">Plugins</SelectItem>
                <SelectItem value="template">Templates</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-muted-foreground">No items found</p>
          </div>
        ) : (
          <div className="space-y-4">
            {items.map((item) => {
              const security = getSecurityAssessment(item);

              return (
                <Card key={item.id} className="hover:shadow-md transition-shadow">
                  <CardContent className="p-6">
                    <div className="flex items-start gap-4">
                      {/* Icon */}
                      <div className="flex-shrink-0">
                        {item.iconUrl ? (
                          <img
                            src={item.iconUrl}
                            alt={item.name}
                            className="w-16 h-16 rounded-lg object-cover"
                          />
                        ) : (
                          <div className="w-16 h-16 rounded-lg bg-gradient-to-br from-blue-400 to-purple-600 flex items-center justify-center">
                            <span className="text-white font-bold text-xl">
                              {item.name.charAt(0).toUpperCase()}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Main Content */}
                      <div className="flex-1">
                        <div className="flex items-start justify-between mb-3">
                          <div>
                            <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-xl font-semibold">{item.name}</h3>
                              {getStatusBadge(item.status)}
                              <Badge variant="outline">{item.type}</Badge>
                              {security.level === 'high' || security.level === 'critical' ? (
                                <Badge variant="destructive">
                                  <AlertTriangle className="h-3 w-3 mr-1" />
                                  {security.level} risk
                                </Badge>
                              ) : null}
                            </div>

                            <p className="text-muted-foreground mb-2">{item.description}</p>

                            <div className="flex items-center gap-4 text-sm text-muted-foreground">
                              <div className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                <span>{item.authorName}</span>
                              </div>
                              <div className="flex items-center gap-1">
                                <Clock className="h-3 w-3" />
                                <span>Submitted {formatDistanceToNow(item.createdAt, { addSuffix: true })}</span>
                              </div>
                              <span>v{item.version}</span>
                            </div>
                          </div>

                          {/* Actions */}
                          <div className="flex items-center gap-2">
                            <Dialog>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm">
                                  <Eye className="h-4 w-4 mr-1" />
                                  Review
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle>Review: {item.name}</DialogTitle>
                                </DialogHeader>
                                <ItemReviewModal
                                  item={item}
                                  onApprove={() => handleReview(item.id, true)}
                                  onReject={(reason) => handleReview(item.id, false, reason)}
                                />
                              </DialogContent>
                            </Dialog>

                            {item.status === 'pending_review' && (
                              <>
                                <Button
                                  size="sm"
                                  onClick={() => handleReview(item.id, true)}
                                  className="bg-green-600 hover:bg-green-700"
                                >
                                  <Check className="h-4 w-4 mr-1" />
                                  Approve
                                </Button>

                                <Button
                                  variant="destructive"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedItem(item);
                                    setReviewModalOpen(true);
                                  }}
                                >
                                  <X className="h-4 w-4 mr-1" />
                                  Reject
                                </Button>
                              </>
                            )}
                          </div>
                        </div>

                        {/* Tags and Security Issues */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {item.tags.slice(0, 5).map(tag => (
                            <Badge key={tag} variant="outline" className="text-xs">
                              <Tag className="h-2 w-2 mr-1" />
                              {tag}
                            </Badge>
                          ))}
                        </div>

                        {security.issues.length > 0 && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                            <h4 className="text-sm font-medium text-yellow-800 mb-2">
                              Security Concerns:
                            </h4>
                            <ul className="text-sm text-yellow-700 space-y-1">
                              {security.issues.slice(0, 3).map((issue, index) => (
                                <li key={index}>• {issue}</li>
                              ))}
                              {security.issues.length > 3 && (
                                <li>• ... and {security.issues.length - 3} more</li>
                              )}
                            </ul>
                          </div>
                        )}

                        {item.rejectionReason && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
                            <h4 className="text-sm font-medium text-red-800 mb-1">
                              Rejection Reason:
                            </h4>
                            <p className="text-sm text-red-700">{item.rejectionReason}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Rejection Modal */}
      <Dialog open={reviewModalOpen} onOpenChange={setReviewModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Submission</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p>Please provide a reason for rejecting this submission:</p>
            <Textarea
              placeholder="Enter rejection reason..."
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={4}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setReviewModalOpen(false)}>
                Cancel
              </Button>
              <Button
                variant="destructive"
                onClick={() => selectedItem && handleReview(selectedItem.id, false, rejectionReason)}
                disabled={!rejectionReason.trim()}
              >
                Reject
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

interface ItemReviewModalProps {
  item: MarketplaceItem;
  onApprove: () => void;
  onReject: (reason: string) => void;
}

function ItemReviewModal({ item, onApprove, onReject }: ItemReviewModalProps) {
  const [rejectionReason, setRejectionReason] = useState('');
  const [activeTab, setActiveTab] = useState('overview');

  const manifest = item.manifest as PluginManifest;
  const isPlugin = item.type === 'plugin';
  const security = isPlugin ? getSecurityAssessment(item) : { level: 'low', issues: [] };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="manifest">Manifest</TabsTrigger>
          <TabsTrigger value="security">Security</TabsTrigger>
          <TabsTrigger value="actions">Actions</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2">Basic Information</h4>
              <div className="space-y-2 text-sm">
                <div><strong>Name:</strong> {item.name}</div>
                <div><strong>Version:</strong> {item.version}</div>
                <div><strong>Type:</strong> {item.type}</div>
                <div><strong>Author:</strong> {item.authorName}</div>
                <div><strong>License:</strong> {item.license}</div>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Metadata</h4>
              <div className="space-y-2 text-sm">
                <div><strong>Category:</strong> {item.category || 'None'}</div>
                <div><strong>Runtime:</strong> {item.runtime || 'N/A'}</div>
                <div><strong>Submitted:</strong> {formatDistanceToNow(item.createdAt, { addSuffix: true })}</div>
                <div><strong>Updated:</strong> {formatDistanceToNow(item.updatedAt, { addSuffix: true })}</div>
              </div>
            </div>
          </div>

          <div>
            <h4 className="font-medium mb-2">Description</h4>
            <p className="text-sm text-muted-foreground">{item.description}</p>
          </div>

          {item.tags.length > 0 && (
            <div>
              <h4 className="font-medium mb-2">Tags</h4>
              <div className="flex flex-wrap gap-1">
                {item.tags.map(tag => (
                  <Badge key={tag} variant="outline" className="text-xs">
                    {tag}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>

        <TabsContent value="manifest" className="space-y-4">
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Code className="h-4 w-4" />
              <h4 className="font-medium">Manifest</h4>
            </div>
            <pre className="text-xs overflow-auto max-h-96 bg-white p-3 rounded border">
              {JSON.stringify(item.manifest, null, 2)}
            </pre>
          </div>
        </TabsContent>

        <TabsContent value="security" className="space-y-4">
          {isPlugin ? (
            <>
              <div className="flex items-center gap-2">
                <Shield className="h-5 w-5" />
                <h4 className="font-medium">Security Assessment</h4>
                <Badge variant={security.level === 'critical' ? 'destructive' : security.level === 'high' ? 'destructive' : 'secondary'}>
                  {security.level} risk
                </Badge>
              </div>

              {manifest.permissions.length > 0 ? (
                <div>
                  <h5 className="font-medium mb-2">Required Permissions</h5>
                  <div className="space-y-2">
                    {manifest.permissions.map((permission) => {
                      const isHighRisk = permission.includes('execute:') || permission.includes('delete');
                      return (
                        <div key={permission} className="flex items-center justify-between p-2 border rounded">
                          <span className="font-mono text-sm">{permission}</span>
                          <Badge variant={isHighRisk ? 'destructive' : 'secondary'} className="text-xs">
                            {isHighRisk ? 'High Risk' : 'Medium Risk'}
                          </Badge>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No special permissions required.</p>
              )}

              {security.issues.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h5 className="font-medium text-yellow-800 mb-2">Security Issues</h5>
                  <ul className="text-sm text-yellow-700 space-y-1">
                    {security.issues.map((issue, index) => (
                      <li key={index}>• {issue}</li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-muted-foreground">Templates have minimal security requirements.</p>
          )}
        </TabsContent>

        <TabsContent value="actions" className="space-y-4">
          <div className="space-y-4">
            <div>
              <h4 className="font-medium mb-2">Quick Actions</h4>
              <div className="flex gap-2">
                <Button onClick={onApprove} className="bg-green-600 hover:bg-green-700">
                  <Check className="h-4 w-4 mr-2" />
                  Approve
                </Button>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Reject with Reason</h4>
              <Textarea
                placeholder="Enter rejection reason..."
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                rows={3}
              />
              <Button
                variant="destructive"
                onClick={() => onReject(rejectionReason)}
                disabled={!rejectionReason.trim()}
                className="mt-2"
              >
                <X className="h-4 w-4 mr-2" />
                Reject
              </Button>
            </div>

            {item.repositoryUrl && (
              <div>
                <h4 className="font-medium mb-2">External Links</h4>
                <Button variant="outline" asChild>
                  <a href={item.repositoryUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Repository
                  </a>
                </Button>
              </div>
            )}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function getSecurityAssessment(item: MarketplaceItem) {
  if (item.type !== 'plugin') return { level: 'low' as const, issues: [] };

  const manifest = item.manifest as PluginManifest;
  const validation = PermissionValidator.validatePermissions(manifest.permissions);

  return {
    level: PermissionValidator.getRiskLevel(manifest.permissions),
    issues: [...validation.warnings, ...validation.risks]
  };
}