-- Migration: Create marketplace plugin and template system
-- Version: 010
-- Description: Adds marketplace items, installations, and plugin management

-- Enum for marketplace item types
CREATE TYPE marketplace_item_type AS ENUM ('plugin', 'template');

-- Enum for marketplace item status
CREATE TYPE marketplace_item_status AS ENUM ('draft', 'pending_review', 'approved', 'rejected', 'deprecated');

-- Enum for plugin runtime
CREATE TYPE plugin_runtime AS ENUM ('nodejs', 'python', 'docker', 'wasm');

-- Main marketplace items table
CREATE TABLE marketplace_items (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type marketplace_item_type NOT NULL,
    slug text UNIQUE NOT NULL,
    name text NOT NULL,
    description text,
    author_id uuid REFERENCES users(id) ON DELETE SET NULL,
    author_name text NOT NULL,
    author_email text,

    -- Versioning
    version text NOT NULL DEFAULT '1.0.0',
    version_history jsonb DEFAULT '[]'::jsonb,

    -- Plugin/Template manifest
    manifest jsonb NOT NULL,

    -- Metadata
    category text,
    tags text[] DEFAULT '{}',
    icon_url text,
    banner_url text,
    screenshots text[] DEFAULT '{}',
    documentation_url text,
    repository_url text,
    license text DEFAULT 'MIT',

    -- Stats and verification
    verified boolean DEFAULT false,
    verified_at timestamp,
    verified_by uuid REFERENCES users(id) ON DELETE SET NULL,
    featured boolean DEFAULT false,
    installs integer DEFAULT 0,
    rating_average numeric(3, 2) DEFAULT 0.00,
    rating_count integer DEFAULT 0,

    -- Status and moderation
    status marketplace_item_status DEFAULT 'draft',
    rejection_reason text,

    -- Plugin specific fields
    runtime plugin_runtime,
    entry_point text, -- Main file or endpoint
    permissions jsonb DEFAULT '[]'::jsonb, -- Required permissions
    dependencies jsonb DEFAULT '{}'::jsonb, -- External dependencies
    config_schema jsonb, -- Configuration schema

    -- Template specific fields
    template_type text, -- e.g., 'project', 'document', 'workflow'
    template_data jsonb, -- Actual template structure

    -- Pricing (for future monetization)
    price numeric(10, 2) DEFAULT 0.00,
    currency text DEFAULT 'USD',

    -- Timestamps
    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),
    published_at timestamp,

    -- Search
    search_vector tsvector,

    CONSTRAINT valid_manifest CHECK (jsonb_typeof(manifest) = 'object'),
    CONSTRAINT valid_version CHECK (version ~ '^\d+\.\d+\.\d+$'),
    CONSTRAINT valid_price CHECK (price >= 0)
);

-- Installations tracking
CREATE TABLE marketplace_installations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

    -- Installation details
    installed_version text NOT NULL,
    is_active boolean DEFAULT true,
    auto_update boolean DEFAULT true,

    -- Configuration
    config jsonb DEFAULT '{}'::jsonb,

    -- Usage stats
    last_used_at timestamp,
    usage_count integer DEFAULT 0,

    -- Timestamps
    installed_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),

    CONSTRAINT unique_user_item_project UNIQUE(item_id, user_id, project_id)
);

-- Plugin execution logs
CREATE TABLE plugin_executions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    installation_id uuid NOT NULL REFERENCES marketplace_installations(id) ON DELETE CASCADE,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,

    -- Execution details
    input_data jsonb,
    output_data jsonb,
    error_message text,

    -- Performance metrics
    execution_time_ms integer,
    memory_used_mb integer,

    -- Status
    status text NOT NULL CHECK (status IN ('pending', 'running', 'success', 'failed', 'timeout')),

    -- Timestamps
    started_at timestamp DEFAULT now(),
    completed_at timestamp
);

-- Reviews and ratings
CREATE TABLE marketplace_reviews (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    item_id uuid NOT NULL REFERENCES marketplace_items(id) ON DELETE CASCADE,
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    rating integer NOT NULL CHECK (rating >= 1 AND rating <= 5),
    title text,
    content text,

    helpful_count integer DEFAULT 0,

    created_at timestamp DEFAULT now(),
    updated_at timestamp DEFAULT now(),

    CONSTRAINT unique_user_item_review UNIQUE(item_id, user_id)
);

-- Plugin permissions registry
CREATE TABLE plugin_permissions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    description text,
    risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),

    created_at timestamp DEFAULT now()
);

-- Default permissions
INSERT INTO plugin_permissions (name, description, risk_level) VALUES
    ('filesystem:read', 'Read files from the project filesystem', 'low'),
    ('filesystem:write', 'Write files to the project filesystem', 'medium'),
    ('filesystem:delete', 'Delete files from the project filesystem', 'high'),
    ('network:http', 'Make HTTP/HTTPS requests', 'medium'),
    ('network:websocket', 'Open WebSocket connections', 'medium'),
    ('ai:generate', 'Use AI generation capabilities', 'low'),
    ('ai:analyze', 'Use AI analysis capabilities', 'low'),
    ('database:read', 'Read from project database', 'medium'),
    ('database:write', 'Write to project database', 'high'),
    ('execute:command', 'Execute system commands', 'critical'),
    ('execute:script', 'Execute scripts', 'high'),
    ('env:read', 'Read environment variables', 'medium'),
    ('env:write', 'Write environment variables', 'high');

-- Indexes for performance
CREATE INDEX idx_marketplace_items_type ON marketplace_items(type);
CREATE INDEX idx_marketplace_items_status ON marketplace_items(status);
CREATE INDEX idx_marketplace_items_author ON marketplace_items(author_id);
CREATE INDEX idx_marketplace_items_category ON marketplace_items(category);
CREATE INDEX idx_marketplace_items_verified ON marketplace_items(verified);
CREATE INDEX idx_marketplace_items_featured ON marketplace_items(featured);
CREATE INDEX idx_marketplace_items_installs ON marketplace_items(installs DESC);
CREATE INDEX idx_marketplace_items_rating ON marketplace_items(rating_average DESC);
CREATE INDEX idx_marketplace_items_created ON marketplace_items(created_at DESC);
CREATE INDEX idx_marketplace_items_search ON marketplace_items USING gin(search_vector);
CREATE INDEX idx_marketplace_items_tags ON marketplace_items USING gin(tags);

CREATE INDEX idx_installations_user ON marketplace_installations(user_id);
CREATE INDEX idx_installations_project ON marketplace_installations(project_id);
CREATE INDEX idx_installations_item ON marketplace_installations(item_id);
CREATE INDEX idx_installations_active ON marketplace_installations(is_active);

CREATE INDEX idx_executions_installation ON plugin_executions(installation_id);
CREATE INDEX idx_executions_project ON plugin_executions(project_id);
CREATE INDEX idx_executions_status ON plugin_executions(status);
CREATE INDEX idx_executions_started ON plugin_executions(started_at DESC);

CREATE INDEX idx_reviews_item ON marketplace_reviews(item_id);
CREATE INDEX idx_reviews_user ON marketplace_reviews(user_id);
CREATE INDEX idx_reviews_rating ON marketplace_reviews(rating);

-- Update search vector on changes
CREATE OR REPLACE FUNCTION update_marketplace_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector :=
        setweight(to_tsvector('english', COALESCE(NEW.name, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(NEW.author_name, '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.tags, ' '), '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_marketplace_search
    BEFORE INSERT OR UPDATE OF name, description, author_name, tags
    ON marketplace_items
    FOR EACH ROW
    EXECUTE FUNCTION update_marketplace_search_vector();

-- Update installs count when installation happens
CREATE OR REPLACE FUNCTION update_install_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE marketplace_items
        SET installs = installs + 1
        WHERE id = NEW.item_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE marketplace_items
        SET installs = GREATEST(installs - 1, 0)
        WHERE id = OLD.item_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_install_count
    AFTER INSERT OR DELETE ON marketplace_installations
    FOR EACH ROW
    EXECUTE FUNCTION update_install_count();

-- Update rating average when review is added/updated
CREATE OR REPLACE FUNCTION update_rating_average()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE marketplace_items
    SET
        rating_average = (
            SELECT AVG(rating)::numeric(3, 2)
            FROM marketplace_reviews
            WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
        ),
        rating_count = (
            SELECT COUNT(*)
            FROM marketplace_reviews
            WHERE item_id = COALESCE(NEW.item_id, OLD.item_id)
        )
    WHERE id = COALESCE(NEW.item_id, OLD.item_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_rating
    AFTER INSERT OR UPDATE OR DELETE ON marketplace_reviews
    FOR EACH ROW
    EXECUTE FUNCTION update_rating_average();

-- Function to check if user has permission to install item
CREATE OR REPLACE FUNCTION can_install_item(
    p_user_id uuid,
    p_item_id uuid,
    p_project_id uuid DEFAULT NULL
) RETURNS boolean AS $$
DECLARE
    v_item_exists boolean;
    v_already_installed boolean;
BEGIN
    -- Check if item exists and is approved
    SELECT EXISTS(
        SELECT 1 FROM marketplace_items
        WHERE id = p_item_id
        AND status = 'approved'
    ) INTO v_item_exists;

    IF NOT v_item_exists THEN
        RETURN false;
    END IF;

    -- Check if already installed
    SELECT EXISTS(
        SELECT 1 FROM marketplace_installations
        WHERE item_id = p_item_id
        AND user_id = p_user_id
        AND (project_id = p_project_id OR (p_project_id IS NULL AND project_id IS NULL))
        AND is_active = true
    ) INTO v_already_installed;

    RETURN NOT v_already_installed;
END;
$$ LANGUAGE plpgsql;

-- Function to get recommended items for a user
CREATE OR REPLACE FUNCTION get_recommended_items(
    p_user_id uuid,
    p_limit integer DEFAULT 10
) RETURNS TABLE(
    item_id uuid,
    name text,
    type marketplace_item_type,
    description text,
    installs integer,
    rating_average numeric
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        mi.id,
        mi.name,
        mi.type,
        mi.description,
        mi.installs,
        mi.rating_average
    FROM marketplace_items mi
    WHERE mi.status = 'approved'
    AND mi.verified = true
    AND NOT EXISTS (
        SELECT 1 FROM marketplace_installations
        WHERE item_id = mi.id AND user_id = p_user_id
    )
    ORDER BY
        mi.featured DESC,
        mi.rating_average DESC,
        mi.installs DESC
    LIMIT p_limit;
END;
$$ LANGUAGE plpgsql;

-- Row-level security policies
ALTER TABLE marketplace_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_installations ENABLE ROW LEVEL SECURITY;
ALTER TABLE plugin_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE marketplace_reviews ENABLE ROW LEVEL SECURITY;

-- Marketplace items: Anyone can view approved items
CREATE POLICY marketplace_items_view ON marketplace_items
    FOR SELECT USING (status = 'approved' OR author_id = current_user_id());

-- Marketplace items: Authors can manage their own items
CREATE POLICY marketplace_items_manage ON marketplace_items
    FOR ALL USING (author_id = current_user_id());

-- Installations: Users can manage their own installations
CREATE POLICY installations_manage ON marketplace_installations
    FOR ALL USING (user_id = current_user_id());

-- Executions: Users can view their own execution logs
CREATE POLICY executions_view ON plugin_executions
    FOR SELECT USING (
        installation_id IN (
            SELECT id FROM marketplace_installations WHERE user_id = current_user_id()
        )
    );

-- Reviews: Anyone can view, users can manage their own
CREATE POLICY reviews_view ON marketplace_reviews
    FOR SELECT USING (true);

CREATE POLICY reviews_manage ON marketplace_reviews
    FOR ALL USING (user_id = current_user_id());