-- Migration 007: Project Lifecycle Management
-- Add project status tracking and clone relationships

BEGIN;

-- Create project status enum
CREATE TYPE project_status AS ENUM ('active', 'archived', 'deleted');

-- Add project_status column to projects table
ALTER TABLE projects
ADD COLUMN project_status project_status DEFAULT 'active' NOT NULL;

-- Create index for efficient status filtering
CREATE INDEX idx_projects_status ON projects(project_status);
CREATE INDEX idx_projects_status_created ON projects(project_status, created_at);

-- Create project_clones table for tracking clone relationships
CREATE TABLE project_clones (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    original_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cloned_project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    cloned_at timestamp with time zone DEFAULT now() NOT NULL,
    cloned_by uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    clone_type varchar(20) DEFAULT 'manual' NOT NULL,
    metadata jsonb DEFAULT '{}' NOT NULL,

    CONSTRAINT unique_clone_pair UNIQUE(original_project_id, cloned_project_id),
    CONSTRAINT no_self_clone CHECK (original_project_id != cloned_project_id)
);

-- Indexes for clone tracking
CREATE INDEX idx_project_clones_original ON project_clones(original_project_id);
CREATE INDEX idx_project_clones_cloned ON project_clones(cloned_project_id);
CREATE INDEX idx_project_clones_user ON project_clones(cloned_by);
CREATE INDEX idx_project_clones_date ON project_clones(cloned_at);

-- Add audit columns for lifecycle tracking
ALTER TABLE projects
ADD COLUMN archived_at timestamp with time zone,
ADD COLUMN archived_by uuid REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN deleted_at timestamp with time zone,
ADD COLUMN deleted_by uuid REFERENCES users(id) ON DELETE SET NULL;

-- Create indexes for audit tracking
CREATE INDEX idx_projects_archived_at ON projects(archived_at) WHERE archived_at IS NOT NULL;
CREATE INDEX idx_projects_deleted_at ON projects(deleted_at) WHERE deleted_at IS NOT NULL;

-- Function to update lifecycle timestamps
CREATE OR REPLACE FUNCTION update_project_lifecycle_timestamps()
RETURNS TRIGGER AS $$
BEGIN
    -- Update archived_at when status changes to archived
    IF OLD.project_status != 'archived' AND NEW.project_status = 'archived' THEN
        NEW.archived_at = now();
    END IF;

    -- Clear archived_at when status changes from archived
    IF OLD.project_status = 'archived' AND NEW.project_status != 'archived' THEN
        NEW.archived_at = NULL;
        NEW.archived_by = NULL;
    END IF;

    -- Update deleted_at when status changes to deleted
    IF OLD.project_status != 'deleted' AND NEW.project_status = 'deleted' THEN
        NEW.deleted_at = now();
    END IF;

    -- Clear deleted_at when status changes from deleted
    IF OLD.project_status = 'deleted' AND NEW.project_status != 'deleted' THEN
        NEW.deleted_at = NULL;
        NEW.deleted_by = NULL;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for lifecycle timestamp updates
CREATE TRIGGER trigger_project_lifecycle_timestamps
    BEFORE UPDATE ON projects
    FOR EACH ROW
    EXECUTE FUNCTION update_project_lifecycle_timestamps();

-- Update existing projects to have active status
UPDATE projects SET project_status = 'active' WHERE project_status IS NULL;

COMMIT;