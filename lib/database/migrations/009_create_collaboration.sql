-- Migration 009: Real-time Collaboration Features
-- Create tables for presence, comments, and activity tracking

BEGIN;

-- Create presence status enum
CREATE TYPE presence_status AS ENUM ('online', 'away', 'offline');

-- Create user presence tracking table
CREATE TABLE user_presence (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    status presence_status NOT NULL DEFAULT 'online',
    last_seen timestamp with time zone DEFAULT now() NOT NULL,
    cursor_position jsonb,
    current_page text,
    session_id text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT unique_user_project_session UNIQUE(user_id, project_id, session_id)
);

-- Create comments table for threaded discussions
CREATE TABLE comments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    parent_id uuid REFERENCES comments(id) ON DELETE CASCADE,
    author_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    content text NOT NULL,
    content_html text,
    mentions jsonb DEFAULT '[]'::jsonb,
    position jsonb,
    resolved boolean DEFAULT false,
    resolved_by uuid REFERENCES users(id) ON DELETE SET NULL,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT valid_content_length CHECK (length(content) >= 1 AND length(content) <= 10000)
);

-- Create notifications table
CREATE TABLE notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type text NOT NULL,
    title text NOT NULL,
    content text,
    data jsonb DEFAULT '{}'::jsonb,
    read boolean DEFAULT false,
    read_at timestamp with time zone,
    project_id uuid REFERENCES projects(id) ON DELETE CASCADE,
    comment_id uuid REFERENCES comments(id) ON DELETE CASCADE,
    mentioned_by uuid REFERENCES users(id) ON DELETE SET NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,

    CONSTRAINT valid_notification_type CHECK (type IN (
        'comment_mention',
        'comment_reply',
        'project_invite',
        'project_update',
        'presence_joined',
        'presence_left'
    ))
);

-- Expand activity_logs table with collaboration events
ALTER TABLE activity_logs
ADD COLUMN IF NOT EXISTS collaborator_id uuid REFERENCES users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS comment_id uuid REFERENCES comments(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS presence_data jsonb;

-- Create indexes for performance
CREATE INDEX idx_user_presence_project ON user_presence(project_id);
CREATE INDEX idx_user_presence_user ON user_presence(user_id);
CREATE INDEX idx_user_presence_status ON user_presence(status);
CREATE INDEX idx_user_presence_session ON user_presence(session_id);
CREATE INDEX idx_user_presence_updated ON user_presence(updated_at);

CREATE INDEX idx_comments_project ON comments(project_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_author ON comments(author_id);
CREATE INDEX idx_comments_created ON comments(created_at);
CREATE INDEX idx_comments_resolved ON comments(resolved);

CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(read);
CREATE INDEX idx_notifications_type ON notifications(type);
CREATE INDEX idx_notifications_project ON notifications(project_id);
CREATE INDEX idx_notifications_created ON notifications(created_at);

CREATE INDEX idx_activity_logs_collaborator ON activity_logs(collaborator_id);
CREATE INDEX idx_activity_logs_comment ON activity_logs(comment_id);

-- Create function to update presence updated_at
CREATE OR REPLACE FUNCTION update_presence_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for presence updates
CREATE TRIGGER trigger_user_presence_updated_at
    BEFORE UPDATE ON user_presence
    FOR EACH ROW
    EXECUTE FUNCTION update_presence_updated_at();

-- Create function to update comments updated_at
CREATE OR REPLACE FUNCTION update_comments_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for comment updates
CREATE TRIGGER trigger_comments_updated_at
    BEFORE UPDATE ON comments
    FOR EACH ROW
    EXECUTE FUNCTION update_comments_updated_at();

-- Create function to clean up old presence records
CREATE OR REPLACE FUNCTION cleanup_old_presence()
RETURNS void AS $$
BEGIN
    -- Remove presence records older than 1 hour for offline users
    DELETE FROM user_presence
    WHERE status = 'offline'
    AND updated_at < now() - interval '1 hour';

    -- Mark users as offline if they haven't been seen in 5 minutes
    UPDATE user_presence
    SET status = 'offline'
    WHERE status != 'offline'
    AND last_seen < now() - interval '5 minutes';
END;
$$ LANGUAGE plpgsql;

-- Create function to get active collaborators for a project
CREATE OR REPLACE FUNCTION get_project_collaborators(p_project_id uuid)
RETURNS TABLE (
    user_id uuid,
    user_name text,
    user_email text,
    avatar_url text,
    status presence_status,
    last_seen timestamp with time zone,
    cursor_position jsonb,
    current_page text,
    session_id text
) AS $$
BEGIN
    RETURN QUERY
    SELECT
        up.user_id,
        u.first_name || ' ' || u.last_name as user_name,
        u.email_addresses[1] as user_email,
        u.image_url as avatar_url,
        up.status,
        up.last_seen,
        up.cursor_position,
        up.current_page,
        up.session_id
    FROM user_presence up
    JOIN users u ON up.user_id = u.id
    WHERE up.project_id = p_project_id
    AND up.status IN ('online', 'away')
    ORDER BY up.last_seen DESC;
END;
$$ LANGUAGE plpgsql;

-- Create function to get comment thread
CREATE OR REPLACE FUNCTION get_comment_thread(p_comment_id uuid)
RETURNS TABLE (
    comment_id uuid,
    parent_id uuid,
    author_id uuid,
    author_name text,
    author_avatar text,
    content text,
    content_html text,
    mentions jsonb,
    position jsonb,
    resolved boolean,
    resolved_by uuid,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    reply_count integer
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE comment_tree AS (
        -- Base case: get the root comment or specified comment
        SELECT
            c.id,
            c.parent_id,
            c.author_id,
            u.first_name || ' ' || u.last_name as author_name,
            u.image_url as author_avatar,
            c.content,
            c.content_html,
            c.mentions,
            c.position,
            c.resolved,
            c.resolved_by,
            c.resolved_at,
            c.created_at,
            c.updated_at,
            0 as level
        FROM comments c
        JOIN users u ON c.author_id = u.id
        WHERE c.id = p_comment_id OR (c.parent_id IS NULL AND EXISTS (
            SELECT 1 FROM comments WHERE id = p_comment_id AND parent_id = c.id
        ))

        UNION ALL

        -- Recursive case: get all replies
        SELECT
            c.id,
            c.parent_id,
            c.author_id,
            u.first_name || ' ' || u.last_name as author_name,
            u.image_url as author_avatar,
            c.content,
            c.content_html,
            c.mentions,
            c.position,
            c.resolved,
            c.resolved_by,
            c.resolved_at,
            c.created_at,
            c.updated_at,
            ct.level + 1
        FROM comments c
        JOIN users u ON c.author_id = u.id
        JOIN comment_tree ct ON c.parent_id = ct.id
    )
    SELECT
        ct.id,
        ct.parent_id,
        ct.author_id,
        ct.author_name,
        ct.author_avatar,
        ct.content,
        ct.content_html,
        ct.mentions,
        ct.position,
        ct.resolved,
        ct.resolved_by,
        ct.resolved_at,
        ct.created_at,
        ct.updated_at,
        (SELECT COUNT(*)::integer FROM comments WHERE parent_id = ct.id) as reply_count
    FROM comment_tree ct
    ORDER BY ct.created_at ASC;
END;
$$ LANGUAGE plpgsql;

-- Create function to create notification
CREATE OR REPLACE FUNCTION create_notification(
    p_user_id uuid,
    p_type text,
    p_title text,
    p_content text DEFAULT NULL,
    p_data jsonb DEFAULT '{}'::jsonb,
    p_project_id uuid DEFAULT NULL,
    p_comment_id uuid DEFAULT NULL,
    p_mentioned_by uuid DEFAULT NULL
)
RETURNS uuid AS $$
DECLARE
    notification_id uuid;
BEGIN
    INSERT INTO notifications (
        user_id,
        type,
        title,
        content,
        data,
        project_id,
        comment_id,
        mentioned_by
    ) VALUES (
        p_user_id,
        p_type,
        p_title,
        p_content,
        p_data,
        p_project_id,
        p_comment_id,
        p_mentioned_by
    )
    RETURNING id INTO notification_id;

    RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Create function to process comment mentions
CREATE OR REPLACE FUNCTION process_comment_mentions()
RETURNS TRIGGER AS $$
DECLARE
    mention_user_id uuid;
    mention_data jsonb;
    project_name text;
BEGIN
    -- Get project name for notification
    SELECT name INTO project_name
    FROM projects
    WHERE id = NEW.project_id;

    -- Process each mention in the comment
    FOR mention_data IN SELECT jsonb_array_elements(NEW.mentions)
    LOOP
        mention_user_id := (mention_data->>'userId')::uuid;

        -- Don't notify the author of their own comment
        IF mention_user_id != NEW.author_id THEN
            PERFORM create_notification(
                mention_user_id,
                'comment_mention',
                'You were mentioned in ' || project_name,
                'Someone mentioned you in a comment',
                jsonb_build_object(
                    'commentId', NEW.id,
                    'projectId', NEW.project_id,
                    'projectName', project_name,
                    'authorId', NEW.author_id
                ),
                NEW.project_id,
                NEW.id,
                NEW.author_id
            );
        END IF;
    END LOOP;

    -- If this is a reply, notify the parent comment author
    IF NEW.parent_id IS NOT NULL THEN
        SELECT author_id INTO mention_user_id
        FROM comments
        WHERE id = NEW.parent_id;

        -- Don't notify if replying to own comment
        IF mention_user_id != NEW.author_id THEN
            PERFORM create_notification(
                mention_user_id,
                'comment_reply',
                'New reply in ' || project_name,
                'Someone replied to your comment',
                jsonb_build_object(
                    'commentId', NEW.id,
                    'parentCommentId', NEW.parent_id,
                    'projectId', NEW.project_id,
                    'projectName', project_name,
                    'authorId', NEW.author_id
                ),
                NEW.project_id,
                NEW.id,
                NEW.author_id
            );
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger for comment mentions
CREATE TRIGGER trigger_process_comment_mentions
    AFTER INSERT ON comments
    FOR EACH ROW
    EXECUTE FUNCTION process_comment_mentions();

COMMIT;