'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
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
  Brain,
  Settings,
  Zap,
  Target,
  TrendingUp,
  Edit2,
  Save,
  RotateCcw,
  Activity,
  Gauge
} from 'lucide-react';
import { useToast } from '@/components/ui/use-toast';

interface ModelConfig {
  id: string;
  name: string;
  provider: string;
  modelId: string;
  category: string;
  enabled: boolean;
  priority: number;
  weight: number;
  parameters: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    topK?: number;
    frequencyPenalty?: number;
    presencePenalty?: number;
  };
  limits: {
    maxRequestsPerMinute?: number;
    maxTokensPerRequest?: number;
    maxCostPerRequest?: number;
  };
  fallbacks: string[];
  costPerToken: {
    input: number;
    output: number;
  };
  performance: {
    averageLatency: number;
    successRate: number;
    reliability: number;
  };
  lastUsed?: string;
  createdAt: string;
  updatedAt: string;
}

interface ModelCategory {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
}

const modelCategories: ModelCategory[] = [
  {
    id: 'chat',
    name: 'Chat Completion',
    description: 'Models for conversational AI and text generation',
    icon: Brain,
    color: 'blue'
  },
  {
    id: 'embedding',
    name: 'Embeddings',
    description: 'Models for text embeddings and similarity',
    icon: Target,
    color: 'green'
  },
  {
    id: 'code',
    name: 'Code Generation',
    description: 'Specialized models for code completion and generation',
    icon: Settings,
    color: 'purple'
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    description: 'Models optimized for complex reasoning tasks',
    icon: TrendingUp,
    color: 'orange'
  }
];

const predefinedModels = [
  {
    name: 'Claude 3.5 Sonnet',
    provider: 'Anthropic',
    modelId: 'claude-3-5-sonnet-20241022',
    category: 'chat',
    priority: 1,
    weight: 40,
    costPerToken: { input: 0.000003, output: 0.000015 }
  },
  {
    name: 'GPT-4 Turbo',
    provider: 'OpenAI',
    modelId: 'gpt-4-turbo-preview',
    category: 'chat',
    priority: 2,
    weight: 30,
    costPerToken: { input: 0.00001, output: 0.00003 }
  },
  {
    name: 'Gemini Pro',
    provider: 'Google',
    modelId: 'gemini-pro',
    category: 'chat',
    priority: 3,
    weight: 20,
    costPerToken: { input: 0.000001, output: 0.000002 }
  },
  {
    name: 'Code Llama',
    provider: 'Meta',
    modelId: 'codellama-34b-instruct',
    category: 'code',
    priority: 1,
    weight: 60,
    costPerToken: { input: 0.000001, output: 0.000002 }
  },
  {
    name: 'Text Embedding 3 Large',
    provider: 'OpenAI',
    modelId: 'text-embedding-3-large',
    category: 'embedding',
    priority: 1,
    weight: 70,
    costPerToken: { input: 0.00000013, output: 0 }
  }
];

export default function ModelWeightsTab() {
  const [models, setModels] = useState<ModelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [selectedModel, setSelectedModel] = useState<ModelConfig | null>(null);
  const [unsavedChanges, setUnsavedChanges] = useState<Record<string, Partial<ModelConfig>>>({});

  const { toast } = useToast();

  useEffect(() => {
    fetchModels();
  }, []);

  const fetchModels = async () => {
    try {
      const response = await fetch('/api/admin/models/weights');
      if (response.ok) {
        const data = await response.json();
        setModels(data.models || []);
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch model configurations",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to fetch models:', error);
      toast({
        title: "Error",
        description: "Failed to fetch model configurations",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const handleAddPredefinedModel = async (predefined: any) => {
    try {
      const response = await fetch('/api/admin/models/weights', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...predefined,
          enabled: true,
          parameters: {
            temperature: 0.7,
            maxTokens: 4096,
            topP: 1.0
          },
          limits: {
            maxRequestsPerMinute: 100,
            maxTokensPerRequest: 4096,
            maxCostPerRequest: 1.0
          },
          fallbacks: []
        }),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: `${predefined.name} added successfully`,
        });
        fetchModels();
      } else {
        const error = await response.json();
        toast({
          title: "Error",
          description: error.message || "Failed to add model",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to add model:', error);
      toast({
        title: "Error",
        description: "Failed to add model",
        variant: "destructive"
      });
    }
  };

  const handleModelChange = (modelId: string, field: string, value: any) => {
    setUnsavedChanges(prev => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        [field]: value
      }
    }));

    // Update local state for immediate UI feedback
    setModels(prev => prev.map(model =>
      model.id === modelId
        ? { ...model, [field]: value }
        : model
    ));
  };

  const handleParameterChange = (modelId: string, parameter: string, value: number) => {
    const change = {
      parameters: {
        ...models.find(m => m.id === modelId)?.parameters,
        [parameter]: value
      }
    };

    setUnsavedChanges(prev => ({
      ...prev,
      [modelId]: {
        ...prev[modelId],
        ...change
      }
    }));

    setModels(prev => prev.map(model =>
      model.id === modelId
        ? { ...model, ...change }
        : model
    ));
  };

  const handleSaveChanges = async (modelId: string) => {
    const changes = unsavedChanges[modelId];
    if (!changes) return;

    try {
      const response = await fetch(`/api/admin/models/weights/${modelId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(changes),
      });

      if (response.ok) {
        toast({
          title: "Success",
          description: "Model configuration saved",
        });

        // Remove from unsaved changes
        setUnsavedChanges(prev => {
          const newChanges = { ...prev };
          delete newChanges[modelId];
          return newChanges;
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to save model configuration",
          variant: "destructive"
        });
      }
    } catch (error) {
      console.error('Failed to save model:', error);
      toast({
        title: "Error",
        description: "Failed to save model configuration",
        variant: "destructive"
      });
    }
  };

  const handleResetChanges = (modelId: string) => {
    // Remove from unsaved changes
    setUnsavedChanges(prev => {
      const newChanges = { ...prev };
      delete newChanges[modelId];
      return newChanges;
    });

    // Fetch fresh data to reset
    fetchModels();
  };

  const getModelsForCategory = (categoryId: string) => {
    return models.filter(model => model.category === categoryId);
  };

  const getCategoryColor = (color: string) => {
    const colors: Record<string, string> = {
      blue: 'border-blue-500 bg-blue-50 dark:bg-blue-900/20',
      green: 'border-green-500 bg-green-50 dark:bg-green-900/20',
      purple: 'border-purple-500 bg-purple-50 dark:bg-purple-900/20',
      orange: 'border-orange-500 bg-orange-50 dark:bg-orange-900/20'
    };
    return colors[color] || colors.blue;
  };

  const getPerformanceColor = (value: number) => {
    if (value >= 95) return 'text-green-600';
    if (value >= 85) return 'text-yellow-600';
    return 'text-red-600';
  };

  const hasUnsavedChanges = (modelId: string) => {
    return modelId in unsavedChanges;
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Model Weights</h2>
        </div>
        <div className="animate-pulse space-y-4">
          {[...Array(4)].map((_, i) => (
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Model Weights</h2>
          <p className="text-gray-600 dark:text-gray-400">Configure AI model preferences and routing</p>
        </div>
        <Select onValueChange={(value) => {
          const predefined = predefinedModels.find(m => m.modelId === value);
          if (predefined) handleAddPredefinedModel(predefined);
        }}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder="Add model" />
          </SelectTrigger>
          <SelectContent>
            {predefinedModels.map((model) => (
              <SelectItem key={model.modelId} value={model.modelId}>
                {model.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Categories */}
      <div className="space-y-6">
        {modelCategories.map((category) => {
          const Icon = category.icon;
          const categoryModels = getModelsForCategory(category.id);

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
                  <Badge variant="secondary">{categoryModels.length}</Badge>
                </div>
              </CardHeader>
              <CardContent>
                {categoryModels.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <Brain className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No models configured for this category</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {categoryModels.map((model) => (
                      <Card key={model.id} className="border">
                        <CardContent className="p-6">
                          <div className="space-y-4">
                            {/* Model Header */}
                            <div className="flex items-center justify-between">
                              <div className="flex items-center space-x-3">
                                <h4 className="font-medium text-lg">{model.name}</h4>
                                <Badge variant="outline">{model.provider}</Badge>
                                <Badge variant={model.enabled ? "default" : "secondary"}>
                                  {model.enabled ? 'Active' : 'Disabled'}
                                </Badge>
                                {hasUnsavedChanges(model.id) && (
                                  <Badge variant="destructive">Unsaved</Badge>
                                )}
                              </div>
                              <div className="flex items-center space-x-2">
                                <Switch
                                  checked={model.enabled}
                                  onCheckedChange={(checked) => handleModelChange(model.id, 'enabled', checked)}
                                />
                                {hasUnsavedChanges(model.id) && (
                                  <>
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleResetChanges(model.id)}
                                    >
                                      <RotateCcw className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      variant="default"
                                      size="sm"
                                      onClick={() => handleSaveChanges(model.id)}
                                    >
                                      <Save className="h-4 w-4" />
                                    </Button>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Model Configuration Grid */}
                            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                              {/* Priority & Weight */}
                              <div className="space-y-4">
                                <h5 className="font-medium text-sm text-muted-foreground">Routing</h5>

                                <div>
                                  <Label htmlFor={`priority-${model.id}`} className="text-xs">
                                    Priority (1 = highest)
                                  </Label>
                                  <Input
                                    id={`priority-${model.id}`}
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={model.priority}
                                    onChange={(e) => handleModelChange(model.id, 'priority', parseInt(e.target.value))}
                                    className="mt-1"
                                  />
                                </div>

                                <div>
                                  <Label htmlFor={`weight-${model.id}`} className="text-xs">
                                    Weight: {model.weight}%
                                  </Label>
                                  <Slider
                                    value={[model.weight]}
                                    onValueChange={([value]) => handleModelChange(model.id, 'weight', value)}
                                    max={100}
                                    step={5}
                                    className="mt-2"
                                  />
                                </div>

                                <div className="text-xs text-muted-foreground space-y-1">
                                  <div>Cost: ${model.costPerToken.input.toFixed(6)}/token in</div>
                                  <div>Cost: ${model.costPerToken.output.toFixed(6)}/token out</div>
                                </div>
                              </div>

                              {/* Parameters */}
                              <div className="space-y-4">
                                <h5 className="font-medium text-sm text-muted-foreground">Parameters</h5>

                                <div>
                                  <Label className="text-xs">Temperature: {model.parameters.temperature?.toFixed(2)}</Label>
                                  <Slider
                                    value={[model.parameters.temperature || 0.7]}
                                    onValueChange={([value]) => handleParameterChange(model.id, 'temperature', value)}
                                    max={2}
                                    step={0.1}
                                    className="mt-2"
                                  />
                                </div>

                                <div>
                                  <Label className="text-xs">Top P: {model.parameters.topP?.toFixed(2)}</Label>
                                  <Slider
                                    value={[model.parameters.topP || 1.0]}
                                    onValueChange={([value]) => handleParameterChange(model.id, 'topP', value)}
                                    max={1}
                                    step={0.1}
                                    className="mt-2"
                                  />
                                </div>

                                <div>
                                  <Label htmlFor={`tokens-${model.id}`} className="text-xs">Max Tokens</Label>
                                  <Input
                                    id={`tokens-${model.id}`}
                                    type="number"
                                    value={model.parameters.maxTokens || 4096}
                                    onChange={(e) => handleParameterChange(model.id, 'maxTokens', parseInt(e.target.value))}
                                    className="mt-1"
                                  />
                                </div>
                              </div>

                              {/* Performance & Metrics */}
                              <div className="space-y-4">
                                <h5 className="font-medium text-sm text-muted-foreground">Performance</h5>

                                <div className="space-y-3">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs">Latency</span>
                                    <span className="text-xs font-mono">{model.performance.averageLatency}ms</span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-xs">Success Rate</span>
                                    <span className={`text-xs font-mono ${getPerformanceColor(model.performance.successRate)}`}>
                                      {model.performance.successRate}%
                                    </span>
                                  </div>

                                  <div className="flex items-center justify-between">
                                    <span className="text-xs">Reliability</span>
                                    <span className={`text-xs font-mono ${getPerformanceColor(model.performance.reliability)}`}>
                                      {model.performance.reliability}%
                                    </span>
                                  </div>

                                  {model.lastUsed && (
                                    <div className="text-xs text-muted-foreground mt-2">
                                      Last used: {new Date(model.lastUsed).toLocaleDateString()}
                                    </div>
                                  )}
                                </div>

                                <div className="flex items-center space-x-2">
                                  <Activity className="h-4 w-4 text-green-600" />
                                  <span className="text-xs text-green-600">Active</span>
                                </div>
                              </div>
                            </div>

                            {/* Limits */}
                            <div className="border-t pt-4">
                              <h5 className="font-medium text-sm text-muted-foreground mb-3">Rate Limits</h5>
                              <div className="grid grid-cols-3 gap-4">
                                <div>
                                  <Label className="text-xs">Requests/min</Label>
                                  <Input
                                    type="number"
                                    value={model.limits.maxRequestsPerMinute || 100}
                                    onChange={(e) => handleModelChange(model.id, 'limits', {
                                      ...model.limits,
                                      maxRequestsPerMinute: parseInt(e.target.value)
                                    })}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Max tokens/request</Label>
                                  <Input
                                    type="number"
                                    value={model.limits.maxTokensPerRequest || 4096}
                                    onChange={(e) => handleModelChange(model.id, 'limits', {
                                      ...model.limits,
                                      maxTokensPerRequest: parseInt(e.target.value)
                                    })}
                                    className="mt-1"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">Max cost/request ($)</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={model.limits.maxCostPerRequest || 1.0}
                                    onChange={(e) => handleModelChange(model.id, 'limits', {
                                      ...model.limits,
                                      maxCostPerRequest: parseFloat(e.target.value)
                                    })}
                                    className="mt-1"
                                  />
                                </div>
                              </div>
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
    </div>
  );
}