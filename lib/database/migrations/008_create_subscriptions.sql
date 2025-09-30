-- Migration 008: Billing and Subscriptions
-- Create subscriptions and billing tables

BEGIN;

-- Create subscription status enum
CREATE TYPE subscription_status AS ENUM (
    'active',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'trialing'
);

-- Create subscription plan enum
CREATE TYPE subscription_plan AS ENUM ('solo', 'teams');

-- Create subscriptions table
CREATE TABLE subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    stripe_subscription_id text UNIQUE NOT NULL,
    stripe_customer_id text NOT NULL,
    plan subscription_plan NOT NULL,
    status subscription_status NOT NULL DEFAULT 'incomplete',
    current_period_start timestamp with time zone NOT NULL,
    current_period_end timestamp with time zone NOT NULL,
    cancel_at_period_end boolean DEFAULT false,
    canceled_at timestamp with time zone,
    trial_start timestamp with time zone,
    trial_end timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT unique_user_active_subscription UNIQUE(user_id, status) DEFERRABLE INITIALLY DEFERRED
);

-- Create billing events table for audit trail
CREATE TABLE billing_events (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE CASCADE,
    stripe_event_id text UNIQUE NOT NULL,
    event_type text NOT NULL,
    event_data jsonb NOT NULL,
    processed_at timestamp with time zone DEFAULT now() NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Create usage tracking table
CREATE TABLE usage_tracking (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    subscription_id uuid REFERENCES subscriptions(id) ON DELETE SET NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    projects_created integer DEFAULT 0,
    collaborators_added integer DEFAULT 0,
    api_calls integer DEFAULT 0,
    storage_used_mb integer DEFAULT 0,
    templates_used integer DEFAULT 0,
    plugins_used integer DEFAULT 0,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT unique_user_usage_period UNIQUE(user_id, period_start, period_end)
);

-- Create plan quotas table
CREATE TABLE plan_quotas (
    plan subscription_plan PRIMARY KEY,
    max_projects integer NOT NULL,
    max_collaborators integer NOT NULL,
    max_api_calls_per_month integer NOT NULL,
    max_storage_mb integer NOT NULL,
    templates_enabled boolean DEFAULT false,
    plugins_enabled boolean DEFAULT false,
    priority_support boolean DEFAULT false,
    custom_domains boolean DEFAULT false,
    advanced_analytics boolean DEFAULT false,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Insert plan quotas
INSERT INTO plan_quotas (
    plan,
    max_projects,
    max_collaborators,
    max_api_calls_per_month,
    max_storage_mb,
    templates_enabled,
    plugins_enabled,
    priority_support,
    custom_domains,
    advanced_analytics
) VALUES
    ('solo', 10, 1, 10000, 1024, false, false, false, false, false),
    ('teams', 100, 20, 100000, 10240, true, true, true, true, true);

-- Create indexes
CREATE INDEX idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX idx_subscriptions_stripe_customer_id ON subscriptions(stripe_customer_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_period_end ON subscriptions(current_period_end);

CREATE INDEX idx_billing_events_subscription_id ON billing_events(subscription_id);
CREATE INDEX idx_billing_events_event_type ON billing_events(event_type);
CREATE INDEX idx_billing_events_created_at ON billing_events(created_at);

CREATE INDEX idx_usage_tracking_user_id ON usage_tracking(user_id);
CREATE INDEX idx_usage_tracking_subscription_id ON usage_tracking(subscription_id);
CREATE INDEX idx_usage_tracking_period ON usage_tracking(period_start, period_end);

-- Create function to update subscription updated_at
CREATE OR REPLACE FUNCTION update_subscription_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for subscription updates
CREATE TRIGGER trigger_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_subscription_updated_at();

-- Create function to update usage tracking updated_at
CREATE OR REPLACE FUNCTION update_usage_tracking_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for usage tracking updates
CREATE TRIGGER trigger_usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_usage_tracking_updated_at();

-- Create function to get current user subscription
CREATE OR REPLACE FUNCTION get_user_active_subscription(p_user_id uuid)
RETURNS TABLE (
    subscription_id uuid,
    plan subscription_plan,
    status subscription_status,
    current_period_end timestamp with time zone
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        s.id,
        s.plan,
        s.status,
        s.current_period_end
    FROM subscriptions s
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing', 'past_due')
    ORDER BY s.created_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- Create function to check plan feature access
CREATE OR REPLACE FUNCTION check_plan_feature_access(
    p_user_id uuid,
    p_feature text
) RETURNS boolean AS $$
DECLARE
    user_plan subscription_plan;
    feature_enabled boolean := false;
BEGIN
    -- Get user's current plan
    SELECT s.plan INTO user_plan
    FROM subscriptions s
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Default to solo plan if no subscription
    IF user_plan IS NULL THEN
        user_plan := 'solo';
    END IF;

    -- Check feature access based on plan
    CASE p_feature
        WHEN 'templates' THEN
            SELECT templates_enabled INTO feature_enabled
            FROM plan_quotas WHERE plan = user_plan;
        WHEN 'plugins' THEN
            SELECT plugins_enabled INTO feature_enabled
            FROM plan_quotas WHERE plan = user_plan;
        WHEN 'priority_support' THEN
            SELECT priority_support INTO feature_enabled
            FROM plan_quotas WHERE plan = user_plan;
        WHEN 'custom_domains' THEN
            SELECT custom_domains INTO feature_enabled
            FROM plan_quotas WHERE plan = user_plan;
        WHEN 'advanced_analytics' THEN
            SELECT advanced_analytics INTO feature_enabled
            FROM plan_quotas WHERE plan = user_plan;
        ELSE
            feature_enabled := false;
    END CASE;

    RETURN feature_enabled;
END;
$$ LANGUAGE plpgsql;

-- Create function to get user quota usage
CREATE OR REPLACE FUNCTION get_user_quota_usage(p_user_id uuid)
RETURNS TABLE (
    current_projects integer,
    current_collaborators integer,
    current_api_calls integer,
    current_storage_mb integer,
    max_projects integer,
    max_collaborators integer,
    max_api_calls_per_month integer,
    max_storage_mb integer
) AS $$
DECLARE
    user_plan subscription_plan;
    current_period_start timestamp with time zone;
    current_period_end timestamp with time zone;
BEGIN
    -- Get user's current plan and billing period
    SELECT s.plan, s.current_period_start, s.current_period_end
    INTO user_plan, current_period_start, current_period_end
    FROM subscriptions s
    WHERE s.user_id = p_user_id
    AND s.status IN ('active', 'trialing')
    ORDER BY s.created_at DESC
    LIMIT 1;

    -- Default to solo plan if no subscription
    IF user_plan IS NULL THEN
        user_plan := 'solo';
        current_period_start := date_trunc('month', now());
        current_period_end := date_trunc('month', now()) + interval '1 month';
    END IF;

    RETURN QUERY
    SELECT
        -- Current usage
        COALESCE((SELECT COUNT(*)::integer FROM projects WHERE owner_id = p_user_id AND project_status = 'active'), 0),
        COALESCE((SELECT SUM(collaborators_added)::integer FROM usage_tracking
                 WHERE user_id = p_user_id
                 AND period_start >= current_period_start
                 AND period_end <= current_period_end), 0),
        COALESCE((SELECT SUM(api_calls)::integer FROM usage_tracking
                 WHERE user_id = p_user_id
                 AND period_start >= current_period_start
                 AND period_end <= current_period_end), 0),
        COALESCE((SELECT SUM(storage_used_mb)::integer FROM usage_tracking
                 WHERE user_id = p_user_id
                 AND period_start >= current_period_start
                 AND period_end <= current_period_end), 0),
        -- Plan limits
        pq.max_projects,
        pq.max_collaborators,
        pq.max_api_calls_per_month,
        pq.max_storage_mb
    FROM plan_quotas pq
    WHERE pq.plan = user_plan;
END;
$$ LANGUAGE plpgsql;

COMMIT;