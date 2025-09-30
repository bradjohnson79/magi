-- Migration: Create domains table for project domain management
-- Author: Claude Code
-- Date: 2024-01-26

-- Create domains table
CREATE TABLE domains (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  domain text NOT NULL UNIQUE,
  domain_type varchar(20) NOT NULL DEFAULT 'custom' CHECK (domain_type IN ('subdomain', 'custom')),
  verified boolean DEFAULT false,
  ssl_status varchar(20) DEFAULT 'pending' CHECK (ssl_status IN ('pending', 'issued', 'expired', 'failed')),
  verification_token text,
  verification_record text,
  ssl_certificate_id text,
  provider varchar(20) DEFAULT 'vercel' CHECK (provider IN ('vercel', 'netlify', 'cloudflare', 'letsencrypt')),
  redirect_to text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  verified_at timestamptz,
  ssl_issued_at timestamptz
);

-- Create index on project_id and domain for fast lookups
CREATE INDEX idx_domains_project_id ON domains(project_id);
CREATE INDEX idx_domains_domain ON domains(domain);
CREATE INDEX idx_domains_verified ON domains(verified);
CREATE INDEX idx_domains_domain_type ON domains(domain_type);

-- Create composite index for project domain lookups
CREATE INDEX idx_domains_project_domain ON domains(project_id, domain);

-- Add trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_domains_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_domains_updated_at
  BEFORE UPDATE ON domains
  FOR EACH ROW
  EXECUTE FUNCTION update_domains_updated_at();

-- Add comments for documentation
COMMENT ON TABLE domains IS 'Project domain mappings for subdomains and custom domains';
COMMENT ON COLUMN domains.domain_type IS 'Type of domain: subdomain (*.magi.dev) or custom';
COMMENT ON COLUMN domains.verified IS 'Whether the domain has been verified via DNS';
COMMENT ON COLUMN domains.ssl_status IS 'SSL certificate status';
COMMENT ON COLUMN domains.verification_token IS 'Token used for domain verification';
COMMENT ON COLUMN domains.verification_record IS 'DNS record value for verification';
COMMENT ON COLUMN domains.ssl_certificate_id IS 'External certificate ID from provider';
COMMENT ON COLUMN domains.provider IS 'SSL certificate provider';
COMMENT ON COLUMN domains.redirect_to IS 'Optional redirect target for domain';

-- Insert default magi.dev wildcard domain for system use
INSERT INTO domains (domain, domain_type, verified, ssl_status, provider)
VALUES ('*.magi.dev', 'subdomain', true, 'issued', 'vercel');