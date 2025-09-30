'use client';

import { useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Check,
  Zap,
  Users,
  Crown,
  Star,
  ArrowRight,
  Loader2
} from 'lucide-react';
import { toast } from 'sonner';
import { PLAN_DETAILS, SubscriptionPlan } from '@/lib/types/billing';

export default function PricingPage() {
  const { user } = useUser();
  const [selectedPlan, setSelectedPlan] = useState<SubscriptionPlan | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSelectPlan = async (plan: SubscriptionPlan) => {
    if (!user) {
      toast.error('Please sign in to subscribe');
      return;
    }

    setSelectedPlan(plan);
    setIsLoading(true);

    try {
      const response = await fetch('/api/v1/billing/subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          plan,
          userEmail: user.emailAddresses[0]?.emailAddress,
          successUrl: `${window.location.origin}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
          cancelUrl: `${window.location.origin}/pricing`,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(result.message || 'Failed to create checkout session');
      }

      // Redirect to Stripe Checkout
      window.location.href = result.data.url;

    } catch (error) {
      console.error('Subscription error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start subscription');
    } finally {
      setIsLoading(false);
      setSelectedPlan(null);
    }
  };

  const PlanCard = ({ planKey, isPopular = false }: { planKey: SubscriptionPlan; isPopular?: boolean }) => {
    const plan = PLAN_DETAILS[planKey];
    const isSelected = selectedPlan === planKey;
    const loading = isLoading && isSelected;

    return (
      <Card className={`relative ${isPopular ? 'border-primary shadow-lg scale-105' : ''}`}>
        {isPopular && (
          <div className="absolute -top-3 left-1/2 transform -translate-x-1/2">
            <Badge className="bg-primary text-primary-foreground px-3 py-1">
              <Star className="w-3 h-3 mr-1" />
              Most Popular
            </Badge>
          </div>
        )}

        <CardHeader className="text-center pb-8">
          <div className="flex justify-center mb-4">
            {planKey === 'solo' ? (
              <Zap className="h-12 w-12 text-primary" />
            ) : (
              <Users className="h-12 w-12 text-primary" />
            )}
          </div>

          <CardTitle className="text-2xl font-bold">{plan.name}</CardTitle>

          <div className="mt-4">
            <span className="text-4xl font-bold">${plan.price}</span>
            <span className="text-muted-foreground">/{plan.interval}</span>
          </div>

          <CardDescription className="mt-2">
            {planKey === 'solo'
              ? 'Perfect for individual developers and small projects'
              : 'Ideal for teams and professional workflows'
            }
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-6">
          <div className="space-y-3">
            {plan.features.map((feature, index) => (
              <div key={index} className="flex items-center">
                <Check className="h-4 w-4 text-green-500 mr-3 flex-shrink-0" />
                <span className="text-sm">{feature}</span>
              </div>
            ))}
          </div>

          <Separator />

          <Button
            className="w-full"
            size="lg"
            variant={isPopular ? 'default' : 'outline'}
            onClick={() => handleSelectPlan(planKey)}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Processing...
              </>
            ) : (
              <>
                Get Started
                <ArrowRight className="ml-2 h-4 w-4" />
              </>
            )}
          </Button>

          {planKey === 'teams' && (
            <p className="text-xs text-center text-muted-foreground">
              Includes 14-day free trial
            </p>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-muted/20">
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="text-center mb-16">
          <div className="flex justify-center mb-6">
            <Crown className="h-16 w-16 text-primary" />
          </div>

          <h1 className="text-4xl md:text-6xl font-bold tracking-tight mb-6">
            Choose Your
            <span className="text-primary block">Perfect Plan</span>
          </h1>

          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Scale your development workflow with powerful features and unlimited possibilities.
            Start building amazing projects today.
          </p>
        </div>

        {/* Pricing Cards */}
        <div className="grid md:grid-cols-2 gap-8 max-w-4xl mx-auto mb-16">
          <PlanCard planKey="solo" />
          <PlanCard planKey="teams" isPopular />
        </div>

        {/* Feature Comparison */}
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl font-bold text-center mb-8">Feature Comparison</h2>

          <div className="bg-card rounded-lg border p-6">
            <div className="grid grid-cols-3 gap-4 text-center font-semibold mb-6">
              <div>Feature</div>
              <div>Solo</div>
              <div>Teams</div>
            </div>

            <Separator className="mb-6" />

            <div className="space-y-4">
              {[
                { feature: 'Projects', solo: '10', teams: '100' },
                { feature: 'Collaborators', solo: '1', teams: '20' },
                { feature: 'API Calls/month', solo: '10,000', teams: '100,000' },
                { feature: 'Storage', solo: '1GB', teams: '10GB' },
                { feature: 'Templates', solo: '❌', teams: '✅' },
                { feature: 'Plugins', solo: '❌', teams: '✅' },
                { feature: 'Custom Domains', solo: '❌', teams: '✅' },
                { feature: 'Priority Support', solo: '❌', teams: '✅' },
                { feature: 'Advanced Analytics', solo: '❌', teams: '✅' },
              ].map((row, index) => (
                <div key={index} className="grid grid-cols-3 gap-4 text-center py-2">
                  <div className="font-medium text-left">{row.feature}</div>
                  <div className="text-muted-foreground">{row.solo}</div>
                  <div className="text-primary font-semibold">{row.teams}</div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* FAQ */}
        <div className="max-w-2xl mx-auto mt-16">
          <h2 className="text-3xl font-bold text-center mb-8">Frequently Asked Questions</h2>

          <div className="space-y-6">
            <div>
              <h3 className="font-semibold mb-2">Can I change plans later?</h3>
              <p className="text-muted-foreground">
                Yes, you can upgrade or downgrade your plan at any time from your billing dashboard.
                Changes will be prorated automatically.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">What payment methods do you accept?</h3>
              <p className="text-muted-foreground">
                We accept all major credit cards, PayPal, and bank transfers for annual plans.
                All payments are processed securely through Stripe.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Is there a free trial?</h3>
              <p className="text-muted-foreground">
                The Teams plan includes a 14-day free trial. The Solo plan doesn't include a trial,
                but you can cancel within the first month for a full refund.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">What happens if I exceed my limits?</h3>
              <p className="text-muted-foreground">
                We'll notify you when you're approaching your limits. You can upgrade your plan
                or purchase additional resources as needed.
              </p>
            </div>
          </div>
        </div>

        {/* CTA */}
        <div className="text-center mt-16">
          <p className="text-muted-foreground mb-4">
            Ready to get started? Choose your plan above or{' '}
            <a href="/contact" className="text-primary hover:underline">
              contact our sales team
            </a>{' '}
            for custom enterprise solutions.
          </p>
        </div>
      </div>
    </div>
  );
}