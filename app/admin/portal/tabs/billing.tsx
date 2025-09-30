'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@clerk/nextjs';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import {
  CreditCard,
  Calendar,
  TrendingUp,
  AlertTriangle,
  ExternalLink,
  RefreshCw,
  Crown,
  Zap,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { SubscriptionPreview, UserQuotaUsage, PLAN_DETAILS } from '@/lib/types/billing';

export default function BillingTab() {
  const { user } = useUser();
  const [subscription, setSubscription] = useState<SubscriptionPreview | null>(null);
  const [quotaUsage, setQuotaUsage] = useState<UserQuotaUsage | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);

  useEffect(() => {
    loadBillingData();
  }, []);

  const loadBillingData = async () => {
    try {
      setIsLoading(true);

      // In a real implementation, you'd have API endpoints for these
      // For now, we'll simulate the data structure
      const mockSubscription: SubscriptionPreview = {
        plan: 'teams',
        status: 'active',
        currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        cancelAtPeriodEnd: false,
        quotaUsage: {
          currentProjects: 15,
          currentCollaborators: 8,
          currentApiCalls: 25000,
          currentStorageMb: 2048,
          maxProjects: 100,
          maxCollaborators: 20,
          maxApiCallsPerMonth: 100000,
          maxStorageMb: 10240
        },
        features: PLAN_DETAILS.teams.features
      };

      setSubscription(mockSubscription);
      setQuotaUsage(mockSubscription.quotaUsage);

    } catch (error) {
      console.error('Error loading billing data:', error);
      toast.error('Failed to load billing information');
    } finally {
      setIsLoading(false);
    }
  };

  const handleManageBilling = async () => {
    if (!user) return;

    setIsManaging(true);
    try {
      const response = await fetch('/api/v1/billing/portal', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          returnUrl: window.location.href,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create billing portal session');
      }

      // Redirect to Stripe billing portal
      window.open(result.data.url, '_blank');

    } catch (error) {
      console.error('Billing portal error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to open billing portal');
    } finally {
      setIsManaging(false);
    }
  };

  const handleCancelSubscription = async () => {
    if (!confirm('Are you sure you want to cancel your subscription? It will remain active until the end of your current billing period.')) {
      return;
    }

    try {
      const response = await fetch('/api/v1/billing/cancel', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to cancel subscription');
      }

      toast.success('Subscription canceled successfully');
      await loadBillingData();

    } catch (error) {
      console.error('Cancel subscription error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to cancel subscription');
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-green-100 text-green-800">Active</Badge>;
      case 'trialing':
        return <Badge className="bg-blue-100 text-blue-800">Trial</Badge>;
      case 'past_due':
        return <Badge variant="destructive">Past Due</Badge>;
      case 'canceled':
        return <Badge variant="secondary">Canceled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getUsagePercentage = (current: number, max: number) => {
    return Math.min((current / max) * 100, 100);
  };

  const getUsageColor = (percentage: number) => {
    if (percentage >= 90) return 'bg-red-500';
    if (percentage >= 75) return 'bg-yellow-500';
    return 'bg-green-500';
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Billing & Subscription</h2>
          <RefreshCw className="h-5 w-5 animate-spin" />
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="space-y-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
                <div className="h-3 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-20 bg-muted rounded animate-pulse" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!subscription) {
    return (
      <div className="space-y-6">
        <h2 className="text-2xl font-bold">Billing & Subscription</h2>
        <Card>
          <CardHeader>
            <CardTitle>No Active Subscription</CardTitle>
            <CardDescription>
              You don't have an active subscription. Upgrade to unlock premium features.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild>
              <a href="/pricing">View Pricing Plans</a>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Billing & Subscription</h2>
        <Button
          onClick={handleManageBilling}
          disabled={isManaging}
          variant="outline"
        >
          {isManaging ? (
            <>
              <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
              Loading...
            </>
          ) : (
            <>
              <ExternalLink className="mr-2 h-4 w-4" />
              Manage Billing
            </>
          )}
        </Button>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* Current Plan */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                {subscription.plan === 'solo' ? (
                  <Zap className="h-5 w-5 text-primary" />
                ) : (
                  <Users className="h-5 w-5 text-primary" />
                )}
                {PLAN_DETAILS[subscription.plan].name} Plan
              </CardTitle>
              {getStatusBadge(subscription.status)}
            </div>
            <CardDescription>
              Current subscription plan and status
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-2xl font-bold">
                ${PLAN_DETAILS[subscription.plan].price}
              </span>
              <span className="text-muted-foreground">/month</span>
            </div>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Renews on {subscription.currentPeriodEnd.toLocaleDateString()}
            </div>

            {subscription.cancelAtPeriodEnd && (
              <div className="flex items-center gap-2 text-sm text-orange-600">
                <AlertTriangle className="h-4 w-4" />
                Cancels at period end
              </div>
            )}

            <Separator />

            <div className="space-y-2">
              <h4 className="font-medium">Included Features:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                {subscription.features.slice(0, 4).map((feature, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <div className="h-1.5 w-1.5 bg-primary rounded-full" />
                    {feature}
                  </li>
                ))}
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Usage Overview */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-primary" />
              Usage Overview
            </CardTitle>
            <CardDescription>
              Current usage for this billing period
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {quotaUsage && (
              <>
                {/* Projects */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Projects</span>
                    <span>{quotaUsage.currentProjects} / {quotaUsage.maxProjects}</span>
                  </div>
                  <Progress
                    value={getUsagePercentage(quotaUsage.currentProjects, quotaUsage.maxProjects)}
                    className="h-2"
                  />
                </div>

                {/* Collaborators */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Collaborators</span>
                    <span>{quotaUsage.currentCollaborators} / {quotaUsage.maxCollaborators}</span>
                  </div>
                  <Progress
                    value={getUsagePercentage(quotaUsage.currentCollaborators, quotaUsage.maxCollaborators)}
                    className="h-2"
                  />
                </div>

                {/* API Calls */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>API Calls</span>
                    <span>{quotaUsage.currentApiCalls.toLocaleString()} / {quotaUsage.maxApiCallsPerMonth.toLocaleString()}</span>
                  </div>
                  <Progress
                    value={getUsagePercentage(quotaUsage.currentApiCalls, quotaUsage.maxApiCallsPerMonth)}
                    className="h-2"
                  />
                </div>

                {/* Storage */}
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Storage</span>
                    <span>
                      {quotaUsage.currentStorageMb >= 1024
                        ? `${(quotaUsage.currentStorageMb / 1024).toFixed(1)}GB`
                        : `${quotaUsage.currentStorageMb}MB`
                      } / {quotaUsage.maxStorageMb >= 1024
                        ? `${quotaUsage.maxStorageMb / 1024}GB`
                        : `${quotaUsage.maxStorageMb}MB`
                      }
                    </span>
                  </div>
                  <Progress
                    value={getUsagePercentage(quotaUsage.currentStorageMb, quotaUsage.maxStorageMb)}
                    className="h-2"
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Billing Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-primary" />
              Billing Actions
            </CardTitle>
            <CardDescription>
              Manage your subscription and billing
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Button
              onClick={handleManageBilling}
              disabled={isManaging}
              className="w-full"
              variant="outline"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Update Payment Method
            </Button>

            <Button
              onClick={handleManageBilling}
              disabled={isManaging}
              className="w-full"
              variant="outline"
            >
              <ExternalLink className="mr-2 h-4 w-4" />
              Download Invoices
            </Button>

            {subscription.plan === 'solo' && (
              <Button
                asChild
                className="w-full"
              >
                <a href="/pricing">
                  <Crown className="mr-2 h-4 w-4" />
                  Upgrade to Teams
                </a>
              </Button>
            )}

            {!subscription.cancelAtPeriodEnd && (
              <Button
                onClick={handleCancelSubscription}
                className="w-full"
                variant="destructive"
              >
                Cancel Subscription
              </Button>
            )}
          </CardContent>
        </Card>

        {/* Plan Comparison */}
        <Card>
          <CardHeader>
            <CardTitle>Need More?</CardTitle>
            <CardDescription>
              Compare plans and upgrade for additional features
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="text-sm space-y-2">
              {subscription.plan === 'solo' ? (
                <>
                  <p className="font-medium">Teams plan includes:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• 100 projects (vs 10)</li>
                    <li>• 20 collaborators (vs 1)</li>
                    <li>• Templates & plugins</li>
                    <li>• Custom domains</li>
                    <li>• Priority support</li>
                  </ul>
                </>
              ) : (
                <p className="text-muted-foreground">
                  You're on our highest tier plan with all premium features included.
                </p>
              )}
            </div>

            <Button asChild className="w-full" variant="outline">
              <a href="/pricing">
                View All Plans
              </a>
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Usage Warnings */}
      {quotaUsage && (
        <div className="space-y-4">
          {getUsagePercentage(quotaUsage.currentProjects, quotaUsage.maxProjects) >= 90 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">Project limit approaching</span>
                </div>
                <p className="text-sm text-orange-600 mt-1">
                  You're using {quotaUsage.currentProjects} of {quotaUsage.maxProjects} projects.
                  Consider upgrading to avoid hitting your limit.
                </p>
              </CardContent>
            </Card>
          )}

          {getUsagePercentage(quotaUsage.currentApiCalls, quotaUsage.maxApiCallsPerMonth) >= 90 && (
            <Card className="border-orange-200 bg-orange-50">
              <CardContent className="pt-6">
                <div className="flex items-center gap-2 text-orange-700">
                  <AlertTriangle className="h-4 w-4" />
                  <span className="font-medium">API usage high</span>
                </div>
                <p className="text-sm text-orange-600 mt-1">
                  You've used {getUsagePercentage(quotaUsage.currentApiCalls, quotaUsage.maxApiCallsPerMonth).toFixed(0)}%
                  of your monthly API calls. Your usage resets on {subscription.currentPeriodEnd.toLocaleDateString()}.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}