'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Flag,
  Settings,
  Users,
  Zap,
  Database,
  Brain,
  Shield,
  Plus,
  Edit2,
  Trash2,
  Activity
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface FeatureFlag {
  id: string;
  name: string;
  key: string;
  description: string;
  category: string;
  type: 'boolean' | 'percentage' | 'string' | 'number';
  value: any;
  defaultValue: any;
  enabled: boolean;
  environments: string[];
  rolloutPercentage?: number;
  conditions?: any;
  createdAt: string;
  updatedAt: string;
  lastModifiedBy: string;
}

interface FeatureFlagCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const flagCategories: FeatureFlagCategory[] = [
  {
    id: 'core',
    name: 'Core Features',
    description: 'Essential system functionality',
    icon: Settings,
    color: 'blue'
  },
  {
    id: 'ai',
    name: 'AI & Models',
    description: 'AI model configurations and capabilities',
    icon: Brain,
    color: 'purple'
  },
  {
    id: 'storage',
    name: 'Storage & Data',
    description: 'Database and storage configurations',
    icon: Database,
    color: 'green'
  },
  {
    id: 'security',
    name: 'Security',
    description: 'Security and authentication features',
    icon: Shield,
    color: 'red'
  },
  {
    id: 'performance',
    name: 'Performance',
    description: 'Performance optimizations and experiments',
    icon: Zap,
    color: 'yellow'
  },
  {
    id: 'user-experience',
    name: 'User Experience',
    description: 'UI/UX features and experiments',
    icon: Users,
    color: 'pink'
  }
];

const predefinedFlags = [
  {
    name: 'MCP Integration',
    key: 'enable_mcp',
    description: 'Enable Model Context Protocol integration',
    category: 'ai',
    type: 'boolean',
    defaultValue: true
  },
  {
    name: 'Canary Traffic Percentage',
    key: 'canary_traffic_percentage',
    description: 'Percentage of traffic to route to canary models',
    category: 'ai',
    type: 'percentage',
    defaultValue: 10
  },
  {
    name: 'Storage Driver',
    key: 'storage_driver',
    description: 'Primary storage backend driver',
    category: 'storage',
    type: 'string',
    defaultValue: 'postgresql'
  },
  {
    name: 'Auto Evolution',
    key: 'enable_auto_evolution',
    description: 'Enable automatic code evolution and optimization',
    category: 'core',
    type: 'boolean',
    defaultValue: false
  },
  {
    name: 'Rate Limit Per Hour',
    key: 'rate_limit_per_hour',
    description: 'API rate limit per user per hour',
    category: 'performance',
    type: 'number',
    defaultValue: 1000
  },
  {
    name: 'Enterprise Features',
    key: 'enable_enterprise_features',
    description: 'Enable enterprise-level features',
    category: 'core',
    type: 'boolean',
    defaultValue: false
  }
];

export default function FeatureFlagsTab() {
  const [flags, setFlags] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedFlag, setSelectedFlag] = useState<FeatureFlag | null>(null);
  const [formData, setFormData] = useState({
    name: '',
    key: '',
    description: '',
    category: '',
    type: 'boolean',
    value: '',
    defaultValue: '',
    enabled: true,
    rolloutPercentage: 100,
    environments: ['production']
  });

  const { toast } = useToast();

  useEffect(() => {
    fetchFlags();
  }, []);

  const fetchFlags = async () => {
    try {
      const response = await fetch('/api/admin/feature-flags');
      if (response.ok) {
        const data = await response.json();
        setFlags(data.flags || []);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch feature flags",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to fetch feature flags:', error);
      toast({
        title: "Error",
        description: "Failed to fetch feature flags",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFlag = (predefined?: any) => {
    setSelectedFlag(null);
    if (predefined) {
      setFormData({
        name: predefined.name,
        key: predefined.key,
        description: predefined.description,
        category: predefined.category,
        type: predefined.type,
        value: predefined.defaultValue.toString(),
        defaultValue: predefined.defaultValue.toString(),
        enabled: true,
        rolloutPercentage: predefined.type === 'percentage' ? predefined.defaultValue : 100,
        environments: ['production']
      });
    } else {
      setFormData({
        name: '',
        key: '',
        description: '',
        category: '',
        type: 'boolean',
        value: '',
        defaultValue: '',
        enabled: true,
        rolloutPercentage: 100,
        environments: ['production']
      });
    }
    setEditDialogOpen(true);
  };

  const handleEditFlag = (flag: FeatureFlag) => {
    setSelectedFlag(flag);
    setFormData({
      name: flag.name,
      key: flag.key,
      description: flag.description,
      category: flag.category,
      type: flag.type,
      value: flag.value?.toString() || '',
      defaultValue: flag.defaultValue?.toString() || '',
      enabled: flag.enabled,
      rolloutPercentage: flag.rolloutPercentage || 100,
      environments: flag.environments || ['production']
    });
    setEditDialogOpen(true);
  };

  const handleSaveFlag = async () => {
    try {
      const url = selectedFlag
        ? `/api/admin/feature-flags/${selectedFlag.id}`
        : '/api/admin/feature-flags';

      const method = selectedFlag ? 'PUT' : 'POST';

      // Convert value based on type
      let processedValue = formData.value;
      switch (formData.type) {
        case 'boolean':
          processedValue = formData.value === 'true';
          break;
        case 'number':
        case 'percentage':
          processedValue = parseFloat(formData.value);
          break;
        default:
          processedValue = formData.value;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...formData,
          value: processedValue,
          defaultValue: formData.type === 'boolean'
            ? formData.defaultValue === 'true'
            : formData.type === 'number'
            ? parseFloat(formData.defaultValue)
            : formData.defaultValue
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Feature flag ${selectedFlag ? 'updated' : 'created'} successfully`,
        });
        setEditDialogOpen(false);
        fetchFlags();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || `Failed to ${selectedFlag ? 'update' : 'create'} feature flag`,
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to save feature flag:', error);
      toast({
        title: "Error",
        description: `Failed to ${selectedFlag ? 'update' : 'create'} feature flag`,
        variant: "destructive"
      });
    }
  };

  const handleToggleFlag = async (flag: FeatureFlag) => {
    try {
      const response = await fetch(`/api/admin/feature-flags/${flag.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...flag,
          enabled: !flag.enabled
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `Feature flag ${!flag.enabled ? 'enabled' : 'disabled'}`,
        });
        fetchFlags();
      } else {
        toast({
          title: "Error",
          description: "Failed to toggle feature flag",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to toggle feature flag:', error);
      toast({
        title: "Error",
        description: "Failed to toggle feature flag",
        variant: "destructive"
      });
    }
  };

  const getFlagsForCategory = (categoryId: string) => {
    return flags.filter(flag => flag.category === categoryId);
  };

  const getCategoryColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      purple: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20',
      green: 'border-green-500 bg-green-50 dark:bg-green-900/20',
      red: 'border-red-500 bg-red-50 dark:bg-red-900/20',
      yellow: 'border-yellow-500 bg-yellow-50 dark:bg-yellow-900/20',
      pink: 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
    };
    return colors[color] || colors.blue;
  };

  const renderFlagValue = (flag: FeatureFlag) => {
    switch (flag.type) {
      case 'boolean':
        return (
          <Badge variant={flag.value ? "default" : "secondary"}>
            {flag.value ? 'Enabled' : 'Disabled'}
          </Badge>
        );
      case 'percentage':
        return (
          <div className="flex items-center space-x-2">
            <Badge variant="outline">{flag.value}%</Badge>
            <div className="w-20 h-2 bg-gray-200 rounded-full">
              <div
                className="h-full bg-blue-600 rounded-full"
                style={{ width: `${flag.value}%` }}
              />
            </div>
          </div>
        );
      case 'number':
        return <Badge variant="outline">{flag.value}</Badge>;
      default:
        return <Badge variant="outline">{flag.value}</Badge>;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Feature Flags</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(6)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Feature Flags</h2>
          <p className="text-gray-600 dark:text-gray-400">Control system features and experiments</p>
        </div>
        <div className="flex space-x-2">
          <Button variant="outline" onClick={() => handleCreateFlag()}>
            <Plus className="h-4 w-4 mr-2" />
            Custom Flag
          </Button>
          <Select onValueChange={(value) => {
            const predefined = predefinedFlags.find(f => f.key === value);
            if (predefined) handleCreateFlag(predefined);
          }}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Add predefined flag" />
            </SelectTrigger>
            <SelectContent>
              {predefinedFlags.map((flag) => (
                <SelectItem key={flag.key} value={flag.key}>
                  {flag.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Categories */}
      <div className="space-y-6">
        {flagCategories.map((category) => {
          const Icon = category.icon;
          const categoryFlags = getFlagsForCategory(category.id);

          return (
            <Card key={category.id} className={`border-l-4 ${getCategoryColor(category.color)}`}>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <Icon className="h-5 w-5 text-muted-foreground" />
                    <div>
                      <CardTitle className="text-lg">{category.name}</CardTitle>
                      <CardDescription>{category.description}</CardDescription>
                    </div>
                  </div>
                  <Badge variant="secondary">{categoryFlags.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {categoryFlags.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Flag className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No feature flags in this category</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryFlags.map((flag) => (
                      <Card key={flag.id} className="border">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="flex-1">
                              <div className="flex items-center space-x-3">
                                <h4 className="font-medium">{flag.name}</h4>
                                <Badge variant="outline" className="text-xs">
                                  {flag.key}
                                </Badge>
                                <Badge variant={flag.type === 'boolean' ? 'default' : 'secondary'}>
                                  {flag.type}
                                </Badge>
                                {!flag.enabled && (
                                  <Badge variant="destructive">Disabled</Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground mt-1">
                                {flag.description}
                              </p>
                              <div className="flex items-center space-x-4 mt-2">
                                <div className="flex items-center space-x-2">
                                  <span className="text-xs text-muted-foreground">Value:</span>
                                  {renderFlagValue(flag)}
                                </div>
                                {flag.rolloutPercentage && flag.rolloutPercentage < 100 && (
                                  <div className="flex items-center space-x-2">
                                    <span className="text-xs text-muted-foreground">Rollout:</span>
                                    <Badge variant="outline">{flag.rolloutPercentage}%</Badge>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center space-x-2">
                              <Switch
                                checked={flag.enabled}
                                onCheckedChange={() => handleToggleFlag(flag)}
                              />
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleEditFlag(flag)}
                              >
                                <Edit2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Edit/Create Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {selectedFlag ? 'Edit Feature Flag' : 'Create Feature Flag'}
            </DialogTitle>
            <DialogDescription>
              Configure a feature flag to control system behavior
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="name">Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Feature name"
                />
              </div>
              <div>
                <Label htmlFor="key">Key</Label>
                <Input
                  id="key"
                  value={formData.key}
                  onChange={(e) => setFormData({ ...formData, key: e.target.value })}
                  placeholder="feature_key"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="What does this flag control?"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="category">Category</Label>
                <Select value={formData.category} onValueChange={(value) => setFormData({ ...formData, category: value })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {flagCategories.map((category) => (
                      <SelectItem key={category.id} value={category.id}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="type">Type</Label>
                <Select value={formData.type} onValueChange={(value) => setFormData({ ...formData, type: value })}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="boolean">Boolean</SelectItem>
                    <SelectItem value="string">String</SelectItem>
                    <SelectItem value="number">Number</SelectItem>
                    <SelectItem value="percentage">Percentage</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="value">Current Value</Label>
                {formData.type === 'boolean' ? (
                  <Select value={formData.value} onValueChange={(value) => setFormData({ ...formData, value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="value"
                    value={formData.value}
                    onChange={(e) => setFormData({ ...formData, value: e.target.value })}
                    placeholder="Current value"
                    type={formData.type === 'number' || formData.type === 'percentage' ? 'number' : 'text'}
                  />
                )}
              </div>
              <div>
                <Label htmlFor="defaultValue">Default Value</Label>
                {formData.type === 'boolean' ? (
                  <Select value={formData.defaultValue} onValueChange={(value) => setFormData({ ...formData, defaultValue: value })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="true">True</SelectItem>
                      <SelectItem value="false">False</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id="defaultValue"
                    value={formData.defaultValue}
                    onChange={(e) => setFormData({ ...formData, defaultValue: e.target.value })}
                    placeholder="Default value"
                    type={formData.type === 'number' || formData.type === 'percentage' ? 'number' : 'text'}
                  />
                )}
              </div>
            </div>

            {formData.type === 'percentage' && (
              <div>
                <Label htmlFor="rollout">Rollout Percentage</Label>
                <div className="px-2">
                  <Slider
                    value={[formData.rolloutPercentage]}
                    onValueChange={(value) => setFormData({ ...formData, rolloutPercentage: value[0] })}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="flex justify-between text-xs text-muted-foreground mt-1">
                    <span>0%</span>
                    <span>{formData.rolloutPercentage}%</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.enabled}
                onCheckedChange={(checked) => setFormData({ ...formData, enabled: checked })}
              />
              <Label>Enable this flag</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSaveFlag}>
              {selectedFlag ? 'Update' : 'Create'} Flag
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}