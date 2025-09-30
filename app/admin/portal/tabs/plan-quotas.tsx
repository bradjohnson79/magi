'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Shield,
  Users,
  Zap,
  Crown,
  Plus,
  Edit,
  Save,
  X,
  AlertTriangle,
  Check,
  TrendingUp,
  Clock,
  Target
} from 'lucide-react';

interface PlanQuota {
  id: string;
  planName: string;
  planTier: 'free' | 'pro' | 'enterprise' | 'custom';
  quotas: {
    aiRequests: { limit: number; used: number; resetPeriod: 'daily' | 'monthly' };
    storage: { limit: number; used: number; unit: 'GB' | 'TB' };
    users: { limit: number; used: number };
    apiCalls: { limit: number; used: number; resetPeriod: 'daily' | 'monthly' };
    customModels: { limit: number; used: number };
    dataRetention: { limit: number; unit: 'days' | 'months' | 'years' };
  };
  features: string[];
  pricing: { amount: number; currency: string; period: 'monthly' | 'yearly' };
  activeUsers: number;
  overagePolicy: 'block' | 'throttle' | 'charge';
  lastUpdated: string;
}

interface NewQuotaForm {
  planName: string;
  planTier: 'free' | 'pro' | 'enterprise' | 'custom';
  aiRequestsLimit: number;
  storageLimit: number;
  usersLimit: number;
  apiCallsLimit: number;
  customModelsLimit: number;
  dataRetentionLimit: number;
  overagePolicy: 'block' | 'throttle' | 'charge';
}

export default function PlanQuotasTab() {
  const [quotas, setQuotas] = useState<PlanQuota[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingQuota, setEditingQuota] = useState<string | null>(null);
  const [showNewQuotaDialog, setShowNewQuotaDialog] = useState(false);
  const [newQuota, setNewQuota] = useState<NewQuotaForm>({
    planName: '',
    planTier: 'free',
    aiRequestsLimit: 1000,
    storageLimit: 5,
    usersLimit: 1,
    apiCallsLimit: 10000,
    customModelsLimit: 0,
    dataRetentionLimit: 30,
    overagePolicy: 'block'
  });
  const [unsavedChanges, setUnsavedChanges] = useState<Set<string>>(new Set());

  useEffect(() => {
    const fetchQuotas = async () => {
      try {
        const response = await fetch('/api/admin/plan-quotas');
        if (response.ok) {
          const data = await response.json();
          setQuotas(data);
        } else {
          // Mock data for development
          setQuotas([
            {
              id: 'free-tier',
              planName: 'Free Tier',
              planTier: 'free',
              quotas: {
                aiRequests: { limit: 1000, used: 847, resetPeriod: 'monthly' },
                storage: { limit: 5, used: 2.3, unit: 'GB' },
                users: { limit: 1, used: 1 },
                apiCalls: { limit: 10000, used: 7234, resetPeriod: 'monthly' },
                customModels: { limit: 0, used: 0 },
                dataRetention: { limit: 30, unit: 'days' }
              },
              features: ['Basic AI Access', 'Standard Support', 'Community Forums'],
              pricing: { amount: 0, currency: 'USD', period: 'monthly' },
              activeUsers: 12847,
              overagePolicy: 'block',
              lastUpdated: new Date().toISOString()
            },
            {
              id: 'pro-tier',
              planName: 'Pro Plan',
              planTier: 'pro',
              quotas: {
                aiRequests: { limit: 50000, used: 23456, resetPeriod: 'monthly' },
                storage: { limit: 100, used: 45.7, unit: 'GB' },
                users: { limit: 10, used: 6 },
                apiCalls: { limit: 500000, used: 234567, resetPeriod: 'monthly' },
                customModels: { limit: 3, used: 2 },
                dataRetention: { limit: 1, unit: 'years' }
              },
              features: ['Advanced AI Models', 'Priority Support', 'Custom Integrations', 'Analytics Dashboard'],
              pricing: { amount: 49, currency: 'USD', period: 'monthly' },
              activeUsers: 2156,
              overagePolicy: 'throttle',
              lastUpdated: new Date().toISOString()
            },
            {
              id: 'enterprise-tier',
              planName: 'Enterprise',
              planTier: 'enterprise',
              quotas: {
                aiRequests: { limit: 1000000, used: 456789, resetPeriod: 'monthly' },
                storage: { limit: 1, used: 0.34, unit: 'TB' },
                users: { limit: 100, used: 23 },
                apiCalls: { limit: 10000000, used: 3456789, resetPeriod: 'monthly' },
                customModels: { limit: 50, used: 12 },
                dataRetention: { limit: 7, unit: 'years' }
              },
              features: ['All AI Models', 'Dedicated Support', 'Custom Models', 'SLA Guarantee', 'Advanced Security'],
              pricing: { amount: 499, currency: 'USD', period: 'monthly' },
              activeUsers: 89,
              overagePolicy: 'charge',
              lastUpdated: new Date().toISOString()
            }
          ]);
        }
      } catch (error) {
        console.error('Failed to fetch plan quotas:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchQuotas();
  }, []);

  const getTierIcon = (tier: string) => {
    switch (tier) {
      case 'free': return <Users className="h-4 w-4" />;
      case 'pro': return <Zap className="h-4 w-4" />;
      case 'enterprise': return <Crown className="h-4 w-4" />;
      case 'custom': return <Shield className="h-4 w-4" />;
      default: return <Users className="h-4 w-4" />;
    }
  };

  const getTierColor = (tier: string) => {
    switch (tier) {
      case 'free': return 'text-gray-600 bg-gray-100 dark:bg-gray-800';
      case 'pro': return 'text-blue-600 bg-blue-100 dark:bg-blue-900/20';
      case 'enterprise': return 'text-purple-600 bg-purple-100 dark:bg-purple-900/20';
      case 'custom': return 'text-green-600 bg-green-100 dark:bg-green-900/20';
      default: return 'text-gray-600 bg-gray-100 dark:bg-gray-800';
    }
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'text-red-600';
    if (percentage >= 75) return 'text-yellow-600';
    return 'text-green-600';
  };

  const formatNumber = (num: number): string => {
    if (num >= 1000000) return `${(num / 1000000).toFixed(1)}M`;
    if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
    return num.toString();
  };

  const handleQuotaUpdate = async (quotaId: string, updates: Partial<PlanQuota>) => {
    try {
      const response = await fetch(`/api/admin/plan-quotas/${quotaId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updates)
      });

      if (response.ok) {
        setQuotas(prev => prev.map(quota =>
          quota.id === quotaId ? { ...quota, ...updates, lastUpdated: new Date().toISOString() } : quota
        ));
        setUnsavedChanges(prev => {
          const newSet = new Set(prev);
          newSet.delete(quotaId);
          return newSet;
        });
        setEditingQuota(null);
      }
    } catch (error) {
      console.error('Failed to update quota:', error);
    }
  };

  const handleCreateQuota = async () => {
    try {
      const quotaData: PlanQuota = {
        id: `${newQuota.planTier}-${Date.now()}`,
        planName: newQuota.planName,
        planTier: newQuota.planTier,
        quotas: {
          aiRequests: { limit: newQuota.aiRequestsLimit, used: 0, resetPeriod: 'monthly' },
          storage: { limit: newQuota.storageLimit, used: 0, unit: 'GB' },
          users: { limit: newQuota.usersLimit, used: 0 },
          apiCalls: { limit: newQuota.apiCallsLimit, used: 0, resetPeriod: 'monthly' },
          customModels: { limit: newQuota.customModelsLimit, used: 0 },
          dataRetention: { limit: newQuota.dataRetentionLimit, unit: 'days' }
        },
        features: [],
        pricing: { amount: 0, currency: 'USD', period: 'monthly' },
        activeUsers: 0,
        overagePolicy: newQuota.overagePolicy,
        lastUpdated: new Date().toISOString()
      };

      const response = await fetch('/api/admin/plan-quotas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(quotaData)
      });

      if (response.ok) {
        setQuotas(prev => [...prev, quotaData]);
        setShowNewQuotaDialog(false);
        setNewQuota({
          planName: '',
          planTier: 'free',
          aiRequestsLimit: 1000,
          storageLimit: 5,
          usersLimit: 1,
          apiCallsLimit: 10000,
          customModelsLimit: 0,
          dataRetentionLimit: 30,
          overagePolicy: 'block'
        });
      }
    } catch (error) {
      console.error('Failed to create quota:', error);
    }
  };

  const QuotaCard = ({ quota }: { quota: PlanQuota }) => {
    const isEditing = editingQuota === quota.id;
    const hasUnsavedChanges = unsavedChanges.has(quota.id);

    return (
      <Card className={`${hasUnsavedChanges ? 'border-yellow-300 shadow-md' : ''}`}>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <Badge className={`${getTierColor(quota.planTier)} flex items-center space-x-1`}>
                {getTierIcon(quota.planTier)}
                <span className="capitalize">{quota.planTier}</span>
              </Badge>
              <div>
                <CardTitle className="text-lg">{quota.planName}</CardTitle>
                <CardDescription>
                  {quota.activeUsers.toLocaleString()} active users • ${quota.pricing.amount}/{quota.pricing.period}
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              {hasUnsavedChanges && (
                <Badge variant="outline" className="text-yellow-600 bg-yellow-50 border-yellow-200">
                  <Clock className="h-3 w-3 mr-1" />
                  Unsaved
                </Badge>
              )}
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditingQuota(isEditing ? null : quota.id)}
              >
                {isEditing ? <X className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Usage Metrics Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">AI Requests</span>
                <span className={getUsageColor((quota.quotas.aiRequests.used / quota.quotas.aiRequests.limit) * 100)}>
                  {formatNumber(quota.quotas.aiRequests.used)} / {formatNumber(quota.quotas.aiRequests.limit)}
                </span>
              </div>
              <Progress
                value={(quota.quotas.aiRequests.used / quota.quotas.aiRequests.limit) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">Resets {quota.quotas.aiRequests.resetPeriod}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Storage</span>
                <span className={getUsageColor((quota.quotas.storage.used / quota.quotas.storage.limit) * 100)}>
                  {quota.quotas.storage.used.toFixed(1)} / {quota.quotas.storage.limit} {quota.quotas.storage.unit}
                </span>
              </div>
              <Progress
                value={(quota.quotas.storage.used / quota.quotas.storage.limit) * 100}
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Users</span>
                <span className={getUsageColor((quota.quotas.users.used / quota.quotas.users.limit) * 100)}>
                  {quota.quotas.users.used} / {quota.quotas.users.limit}
                </span>
              </div>
              <Progress
                value={(quota.quotas.users.used / quota.quotas.users.limit) * 100}
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">API Calls</span>
                <span className={getUsageColor((quota.quotas.apiCalls.used / quota.quotas.apiCalls.limit) * 100)}>
                  {formatNumber(quota.quotas.apiCalls.used)} / {formatNumber(quota.quotas.apiCalls.limit)}
                </span>
              </div>
              <Progress
                value={(quota.quotas.apiCalls.used / quota.quotas.apiCalls.limit) * 100}
                className="h-2"
              />
              <p className="text-xs text-muted-foreground">Resets {quota.quotas.apiCalls.resetPeriod}</p>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Custom Models</span>
                <span className={getUsageColor((quota.quotas.customModels.used / quota.quotas.customModels.limit) * 100)}>
                  {quota.quotas.customModels.used} / {quota.quotas.customModels.limit}
                </span>
              </div>
              <Progress
                value={quota.quotas.customModels.limit > 0 ? (quota.quotas.customModels.used / quota.quotas.customModels.limit) * 100 : 0}
                className="h-2"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">Data Retention</span>
                <span className="text-sm font-medium">
                  {quota.quotas.dataRetention.limit} {quota.quotas.dataRetention.unit}
                </span>
              </div>
            </div>
          </div>

          {/* Plan Features */}
          <div>
            <h4 className="text-sm font-medium mb-2">Features</h4>
            <div className="flex flex-wrap gap-2">
              {quota.features.map((feature, index) => (
                <Badge key={index} variant="secondary" className="text-xs">
                  <Check className="h-3 w-3 mr-1" />
                  {feature}
                </Badge>
              ))}
            </div>
          </div>

          {/* Overage Policy */}
          <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <div className="flex items-center space-x-2">
              <Target className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium">Overage Policy</span>
            </div>
            <Badge variant="outline" className="capitalize">
              {quota.overagePolicy}
            </Badge>
          </div>

          {hasUnsavedChanges && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                You have unsaved changes. Click Save to apply them.
                <Button
                  size="sm"
                  className="ml-2"
                  onClick={() => handleQuotaUpdate(quota.id, {})}
                >
                  <Save className="h-3 w-3 mr-1" />
                  Save Changes
                </Button>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>
    );
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Plan Quotas</h2>
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {[...Array(3)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader className="pb-2">
                <div className="h-6 bg-gray-200 dark:bg-gray-700 rounded w-1/2"></div>
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="space-y-2">
                      <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded"></div>
                      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded"></div>
                    </div>
                  ))}
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
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Plan Quotas</h2>
          <p className="text-gray-600 dark:text-gray-400">Manage usage limits and subscription tiers</p>
        </div>
        <Dialog open={showNewQuotaDialog} onOpenChange={setShowNewQuotaDialog}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Add Plan
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Plan Quota</DialogTitle>
              <DialogDescription>
                Define usage limits and constraints for a new subscription tier.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="planName">Plan Name</Label>
                <Input
                  id="planName"
                  value={newQuota.planName}
                  onChange={(e) => setNewQuota(prev => ({ ...prev, planName: e.target.value }))}
                  placeholder="e.g., Starter Plan"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="planTier">Plan Tier</Label>
                <Select value={newQuota.planTier} onValueChange={(value: any) => setNewQuota(prev => ({ ...prev, planTier: value }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="free">Free</SelectItem>
                    <SelectItem value="pro">Pro</SelectItem>
                    <SelectItem value="enterprise">Enterprise</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="aiRequestsLimit">AI Requests/Month</Label>
                  <Input
                    id="aiRequestsLimit"
                    type="number"
                    value={newQuota.aiRequestsLimit}
                    onChange={(e) => setNewQuota(prev => ({ ...prev, aiRequestsLimit: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="storageLimit">Storage (GB)</Label>
                  <Input
                    id="storageLimit"
                    type="number"
                    value={newQuota.storageLimit}
                    onChange={(e) => setNewQuota(prev => ({ ...prev, storageLimit: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowNewQuotaDialog(false)}>
                Cancel
              </Button>
              <Button onClick={handleCreateQuota} disabled={!newQuota.planName}>
                Create Plan
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total Users</p>
                <p className="text-2xl font-bold">{quotas.reduce((sum, q) => sum + q.activeUsers, 0).toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <TrendingUp className="h-5 w-5 text-green-600" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Active Plans</p>
                <p className="text-2xl font-bold">{quotas.length}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Zap className="h-5 w-5 text-yellow-600" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Total AI Requests</p>
                <p className="text-2xl font-bold">
                  {formatNumber(quotas.reduce((sum, q) => sum + q.quotas.aiRequests.used, 0))}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Shield className="h-5 w-5 text-purple-600" />
              <div>
                <p className="text-sm font-medium text-gray-600 dark:text-gray-400">Avg Usage</p>
                <p className="text-2xl font-bold">
                  {quotas.length > 0 ? Math.round(quotas.reduce((sum, q) => sum + (q.quotas.aiRequests.used / q.quotas.aiRequests.limit * 100), 0) / quotas.length) : 0}%
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Plan Quotas Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {quotas.map((quota) => (
          <QuotaCard key={quota.id} quota={quota} />
        ))}
      </div>
    </div>
  );
}