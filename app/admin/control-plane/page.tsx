'use client';

/**
 * Control Plane Admin Interface
 *
 * Comprehensive admin interface for managing secrets, feature flags,
 * model weights, plan quotas, and other platform configurations.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '@clerk/nextjs';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Key,
  Settings,
  Flag,
  Sliders,
  Users,
  Shield,
  Eye,
  EyeOff,
  Plus,
  Trash2,
  Save,
  RefreshCw,
  AlertTriangle,
  CheckCircle
} from 'lucide-react';

interface Secret {
  id: string;
  name: string;
  maskedValue: string;
  provider?: string;
  description?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
  creator: {
    id: string;
    email: string;
    name?: string;
  };
}

interface FeatureFlag {
  id: string;
  name: string;
  enabled: boolean;
  rolloutPercentage: number;
  description?: string;
  conditions: Record<string, any>;
  createdAt: string;
  updatedAt: string;
}

interface ModelWeight {
  modelId: string;
  weight: number;
  enabled: boolean;
  priority: number;
}

interface PlanQuota {
  plan: string;
  maxRequests: number;
  maxTokens: number;
  maxProjects: number;
  maxTeamMembers: number;
  features: string[];
}

export default function ControlPlanePage() {
  const { userId } = useAuth();

  // State management
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Data state
  const [secrets, setSecrets] = useState<Secret[]>([]);
  const [featureFlags, setFeatureFlags] = useState<FeatureFlag[]>([]);
  const [modelWeights, setModelWeights] = useState<ModelWeight[]>([]);
  const [planQuotas, setPlanQuotas] = useState<Record<string, PlanQuota>>({});

  // Form state
  const [newSecret, setNewSecret] = useState({
    name: '',
    value: '',
    provider: '',
    description: '',
  });
  const [newFlag, setNewFlag] = useState({
    name: '',
    enabled: false,
    rolloutPercentage: 100,
    description: '',
  });
  const [showSecretValue, setShowSecretValue] = useState<Record<string, boolean>>({});

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);

      const [secretsRes, settingsRes] = await Promise.all([
        fetch('/api/v1/admin/secrets?stats=true'),
        fetch('/api/v1/admin/settings'),
      ]);

      if (secretsRes.ok) {
        const secretsData = await secretsRes.json();
        setSecrets(secretsData.data.secrets || []);
      }

      if (settingsRes.ok) {
        const settingsData = await settingsRes.json();
        setFeatureFlags(settingsData.data.featureFlags || []);
        setModelWeights(settingsData.data.modelWeights || []);
        setPlanQuotas(settingsData.data.planQuotas || {});
      }

    } catch (error) {
      console.error('Failed to load data:', error);
      setMessage({ type: 'error', text: 'Failed to load control plane data' });
    } finally {
      setLoading(false);
    }
  };

  const showMessage = (type: 'success' | 'error', text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 5000);
  };

  // Secret management
  const createSecret = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newSecret.name || !newSecret.value) {
      showMessage('error', 'Name and value are required');
      return;
    }

    try {
      setSaving(true);

      const response = await fetch('/api/v1/admin/secrets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newSecret),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Secret created successfully');
        setNewSecret({ name: '', value: '', provider: '', description: '' });
        loadData(); // Reload to get updated list
      } else {
        showMessage('error', data.message || 'Failed to create secret');
      }
    } catch (error) {
      showMessage('error', 'Failed to create secret');
    } finally {
      setSaving(false);
    }
  };

  const deleteSecret = async (name: string) => {
    if (!confirm(`Are you sure you want to delete secret "${name}"?`)) {
      return;
    }

    try {
      const response = await fetch(`/api/v1/admin/secrets?name=${encodeURIComponent(name)}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Secret deleted successfully');
        loadData();
      } else {
        showMessage('error', data.message || 'Failed to delete secret');
      }
    } catch (error) {
      showMessage('error', 'Failed to delete secret');
    }
  };

  // Feature flag management
  const updateFeatureFlag = async (flag: FeatureFlag) => {
    try {
      setSaving(true);

      const response = await fetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feature_flag',
          data: {
            name: flag.name,
            enabled: flag.enabled,
            rolloutPercentage: flag.rolloutPercentage,
            description: flag.description,
          },
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Feature flag updated successfully');
        loadData();
      } else {
        showMessage('error', data.message || 'Failed to update feature flag');
      }
    } catch (error) {
      showMessage('error', 'Failed to update feature flag');
    } finally {
      setSaving(false);
    }
  };

  const createFeatureFlag = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!newFlag.name) {
      showMessage('error', 'Flag name is required');
      return;
    }

    try {
      setSaving(true);

      const response = await fetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'feature_flag',
          data: newFlag,
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Feature flag created successfully');
        setNewFlag({ name: '', enabled: false, rolloutPercentage: 100, description: '' });
        loadData();
      } else {
        showMessage('error', data.message || 'Failed to create feature flag');
      }
    } catch (error) {
      showMessage('error', 'Failed to create feature flag');
    } finally {
      setSaving(false);
    }
  };

  // Model weight management
  const updateModelWeights = async () => {
    try {
      setSaving(true);

      const response = await fetch('/api/v1/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'model_weights',
          data: { weights: modelWeights },
        }),
      });

      const data = await response.json();

      if (data.success) {
        showMessage('success', 'Model weights updated successfully');
      } else {
        showMessage('error', data.message || 'Failed to update model weights');
      }
    } catch (error) {
      showMessage('error', 'Failed to update model weights');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <RefreshCw className="w-8 h-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Shield className="w-8 h-8" />
            Control Plane
          </h1>
          <p className="text-muted-foreground">
            Manage platform secrets, feature flags, and configurations
          </p>
        </div>
        <Button onClick={loadData} variant="outline" size="sm">
          <RefreshCw className="w-4 h-4 mr-2" />
          Refresh
        </Button>
      </div>

      {message && (
        <Alert className={message.type === 'error' ? 'border-red-500' : 'border-green-500'}>
          {message.type === 'error' ? (
            <AlertTriangle className="h-4 w-4" />
          ) : (
            <CheckCircle className="h-4 w-4" />
          )}
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      <Tabs defaultValue="secrets" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="secrets" className="flex items-center gap-2">
            <Key className="w-4 h-4" />
            Secrets
          </TabsTrigger>
          <TabsTrigger value="flags" className="flex items-center gap-2">
            <Flag className="w-4 h-4" />
            Feature Flags
          </TabsTrigger>
          <TabsTrigger value="models" className="flex items-center gap-2">
            <Sliders className="w-4 h-4" />
            Model Weights
          </TabsTrigger>
          <TabsTrigger value="quotas" className="flex items-center gap-2">
            <Users className="w-4 h-4" />
            Plan Quotas
          </TabsTrigger>
        </TabsList>

        {/* Secrets Management */}
        <TabsContent value="secrets" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add New Secret</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createSecret} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="secret-name">Name</Label>
                    <Input
                      id="secret-name"
                      value={newSecret.name}
                      onChange={(e) => setNewSecret(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., openai_api_key"
                      required
                    />
                  </div>
                  <div>
                    <Label htmlFor="secret-provider">Provider</Label>
                    <Select
                      value={newSecret.provider}
                      onValueChange={(value) => setNewSecret(prev => ({ ...prev, provider: value }))}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select provider" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="openai">OpenAI</SelectItem>
                        <SelectItem value="anthropic">Anthropic</SelectItem>
                        <SelectItem value="google">Google</SelectItem>
                        <SelectItem value="aws">AWS</SelectItem>
                        <SelectItem value="github">GitHub</SelectItem>
                        <SelectItem value="slack">Slack</SelectItem>
                        <SelectItem value="discord">Discord</SelectItem>
                        <SelectItem value="database">Database</SelectItem>
                        <SelectItem value="monitoring">Monitoring</SelectItem>
                        <SelectItem value="security">Security</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label htmlFor="secret-value">Value</Label>
                  <Input
                    id="secret-value"
                    type="password"
                    value={newSecret.value}
                    onChange={(e) => setNewSecret(prev => ({ ...prev, value: e.target.value }))}
                    placeholder="Enter secret value"
                    required
                  />
                </div>
                <div>
                  <Label htmlFor="secret-description">Description</Label>
                  <Textarea
                    id="secret-description"
                    value={newSecret.description}
                    onChange={(e) => setNewSecret(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Secret
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Secrets ({secrets.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {secrets.map((secret) => (
                  <div key={secret.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <h3 className="font-medium">{secret.name}</h3>
                          {secret.provider && (
                            <Badge variant="secondary">{secret.provider}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-muted-foreground">
                          <span>Value:</span>
                          <code className="bg-muted px-2 py-1 rounded">
                            {showSecretValue[secret.name] ? '••••••••' : secret.maskedValue}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setShowSecretValue(prev => ({
                              ...prev,
                              [secret.name]: !prev[secret.name]
                            }))}
                          >
                            {showSecretValue[secret.name] ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </Button>
                        </div>
                        {secret.description && (
                          <p className="text-sm text-muted-foreground mt-1">{secret.description}</p>
                        )}
                        <div className="text-xs text-muted-foreground mt-2">
                          Created by {secret.creator.email} on {new Date(secret.createdAt).toLocaleDateString()}
                          {secret.lastUsedAt && (
                            <span> • Last used {new Date(secret.lastUsedAt).toLocaleDateString()}</span>
                          )}
                        </div>
                      </div>
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => deleteSecret(secret.name)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                {secrets.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No secrets configured
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Feature Flags */}
        <TabsContent value="flags" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Add New Feature Flag</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createFeatureFlag} className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="flag-name">Name</Label>
                    <Input
                      id="flag-name"
                      value={newFlag.name}
                      onChange={(e) => setNewFlag(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="e.g., mcp_enabled"
                      required
                    />
                  </div>
                  <div className="flex items-center space-x-2">
                    <Switch
                      checked={newFlag.enabled}
                      onCheckedChange={(checked) => setNewFlag(prev => ({ ...prev, enabled: checked }))}
                    />
                    <Label>Enabled</Label>
                  </div>
                </div>
                <div>
                  <Label htmlFor="flag-rollout">Rollout Percentage: {newFlag.rolloutPercentage}%</Label>
                  <Slider
                    value={[newFlag.rolloutPercentage]}
                    onValueChange={([value]) => setNewFlag(prev => ({ ...prev, rolloutPercentage: value }))}
                    max={100}
                    step={5}
                    className="mt-2"
                  />
                </div>
                <div>
                  <Label htmlFor="flag-description">Description</Label>
                  <Textarea
                    id="flag-description"
                    value={newFlag.description}
                    onChange={(e) => setNewFlag(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="Optional description"
                    rows={2}
                  />
                </div>
                <Button type="submit" disabled={saving}>
                  {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Plus className="w-4 h-4 mr-2" />}
                  Create Flag
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Feature Flags ({featureFlags.length})</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {featureFlags.map((flag) => (
                  <div key={flag.id} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <h3 className="font-medium">{flag.name}</h3>
                        <Badge variant={flag.enabled ? "default" : "secondary"}>
                          {flag.enabled ? "Enabled" : "Disabled"}
                        </Badge>
                      </div>
                      <Switch
                        checked={flag.enabled}
                        onCheckedChange={(checked) => {
                          const updatedFlag = { ...flag, enabled: checked };
                          updateFeatureFlag(updatedFlag);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label>Rollout: {flag.rolloutPercentage}%</Label>
                        <Slider
                          value={[flag.rolloutPercentage]}
                          onValueChange={([value]) => {
                            const updatedFlag = { ...flag, rolloutPercentage: value };
                            updateFeatureFlag(updatedFlag);
                          }}
                          max={100}
                          step={5}
                          className="mt-1"
                        />
                      </div>
                      {flag.description && (
                        <p className="text-sm text-muted-foreground">{flag.description}</p>
                      )}
                    </div>
                  </div>
                ))}
                {featureFlags.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No feature flags configured
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Weights */}
        <TabsContent value="models" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Model Weights Configuration</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure model selection weights and priorities for the AI routing system.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {modelWeights.map((weight, index) => (
                  <div key={weight.modelId} className="border rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-medium">{weight.modelId}</h3>
                      <Switch
                        checked={weight.enabled}
                        onCheckedChange={(checked) => {
                          const newWeights = [...modelWeights];
                          newWeights[index] = { ...weight, enabled: checked };
                          setModelWeights(newWeights);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <div>
                        <Label>Weight: {weight.weight}</Label>
                        <Slider
                          value={[weight.weight]}
                          onValueChange={([value]) => {
                            const newWeights = [...modelWeights];
                            newWeights[index] = { ...weight, weight: value };
                            setModelWeights(newWeights);
                          }}
                          max={100}
                          step={1}
                          className="mt-1"
                        />
                      </div>
                      <div>
                        <Label htmlFor={`priority-${index}`}>Priority</Label>
                        <Input
                          id={`priority-${index}`}
                          type="number"
                          value={weight.priority}
                          onChange={(e) => {
                            const newWeights = [...modelWeights];
                            newWeights[index] = { ...weight, priority: parseInt(e.target.value) || 0 };
                            setModelWeights(newWeights);
                          }}
                          min={0}
                          max={10}
                        />
                      </div>
                    </div>
                  </div>
                ))}
                {modelWeights.length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No model weights configured
                  </div>
                )}
              </div>
              {modelWeights.length > 0 && (
                <div className="flex justify-end mt-6">
                  <Button onClick={updateModelWeights} disabled={saving}>
                    {saving ? <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Save Weights
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Plan Quotas */}
        <TabsContent value="quotas" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Plan Quotas & Limits</CardTitle>
              <p className="text-sm text-muted-foreground">
                Configure usage limits and features for different subscription plans.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {Object.entries(planQuotas).map(([plan, quota]) => (
                  <div key={plan} className="border rounded-lg p-4">
                    <h3 className="font-medium mb-4 capitalize">{plan} Plan</h3>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Max Requests/Month</Label>
                        <Input
                          type="number"
                          value={quota.maxRequests}
                          onChange={(e) => {
                            const newQuotas = { ...planQuotas };
                            newQuotas[plan] = { ...quota, maxRequests: parseInt(e.target.value) || 0 };
                            setPlanQuotas(newQuotas);
                          }}
                        />
                      </div>
                      <div>
                        <Label>Max Tokens/Month</Label>
                        <Input
                          type="number"
                          value={quota.maxTokens}
                          onChange={(e) => {
                            const newQuotas = { ...planQuotas };
                            newQuotas[plan] = { ...quota, maxTokens: parseInt(e.target.value) || 0 };
                            setPlanQuotas(newQuotas);
                          }}
                        />
                      </div>
                      <div>
                        <Label>Max Projects</Label>
                        <Input
                          type="number"
                          value={quota.maxProjects}
                          onChange={(e) => {
                            const newQuotas = { ...planQuotas };
                            newQuotas[plan] = { ...quota, maxProjects: parseInt(e.target.value) || 0 };
                            setPlanQuotas(newQuotas);
                          }}
                        />
                      </div>
                      <div>
                        <Label>Max Team Members</Label>
                        <Input
                          type="number"
                          value={quota.maxTeamMembers}
                          onChange={(e) => {
                            const newQuotas = { ...planQuotas };
                            newQuotas[plan] = { ...quota, maxTeamMembers: parseInt(e.target.value) || 0 };
                            setPlanQuotas(newQuotas);
                          }}
                        />
                      </div>
                    </div>
                    <div className="mt-4">
                      <Label>Enabled Features</Label>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {quota.features.map((feature, index) => (
                          <Badge key={index} variant="outline">{feature}</Badge>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
                {Object.keys(planQuotas).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground">
                    No plan quotas configured
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}