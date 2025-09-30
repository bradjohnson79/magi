# Magi Platform - Data Governance & Compliance

This document outlines the data governance policies, retention schedules, and compliance measures implemented in the Magi platform.

## Overview

The Magi platform implements comprehensive data governance to ensure compliance with:
- **GDPR** (General Data Protection Regulation)
- **CCPA** (California Consumer Privacy Act)
- **SOC 2** (System and Organization Controls)
- Industry best practices for data security and privacy

## Data Classification

### Personal Data
- **User accounts**: Email, name, preferences, plan information
- **Authentication data**: Clerk-managed authentication tokens
- **Usage data**: Prompts, model interactions, feedback
- **Billing information**: Plan details, usage counters (no payment info stored)

### System Data
- **Telemetry events**: Application performance and usage metrics
- **Audit logs**: Security events, admin actions, data access logs
- **Model runs**: AI model execution data (anonymized after retention period)
- **Infrastructure logs**: Health checks, errors, system events

### Project Data
- **User projects**: Code, documentation, snapshots
- **Collaboration data**: Team memberships, shared resources
- **Snapshots**: Point-in-time project states

## Data Retention Policies

### By User Plan

#### Trial Plan (Free)
- **Snapshots**: 7 days
- **Telemetry Events**: 30 days
- **Logs**: 7 days
- **Model Runs**: 90 days
- **Audit Logs**: 90 days

#### Solo Plan (Paid Individual)
- **Snapshots**: 30 days
- **Telemetry Events**: 90 days
- **Logs**: 30 days
- **Model Runs**: 365 days
- **Audit Logs**: 365 days

#### Teams Plan (Paid Organization)
- **Snapshots**: 90 days
- **Telemetry Events**: 90 days
- **Logs**: 90 days
- **Model Runs**: 730 days (2 years)
- **Audit Logs**: 365 days

#### Admin Users
- **Snapshots**: 365 days
- **Telemetry Events**: 365 days
- **Logs**: 365 days
- **Model Runs**: 1095 days (3 years)
- **Audit Logs**: 1825 days (5 years)

### Compliance-Based Retention

#### Global Policies
- **Telemetry Events**: Archived after 90 days, deleted after 1 year
- **Critical Audit Logs**: Retained for 7 years (security/compliance events)
- **Model Training Data**: Anonymized after 2 years, retained for model improvement
- **User Deletion Requests**: 30-day grace period before execution

#### Special Handling
- **Security Events**: Extended retention for investigation purposes
- **Legal Hold**: Data under legal hold exempt from automated deletion
- **Model Training**: Anonymized data retained longer for AI improvement

## Data Subject Rights (GDPR/CCPA)

### Right to Access
- **Endpoint**: `GET /api/v1/account/data-export`
- **Formats**: JSON, CSV, XML
- **Scope**: Complete user data export including all associated records
- **Response Time**: Immediate download available

### Right to Deletion
- **Endpoint**: `POST /api/v1/account/data-delete`
- **Grace Period**: 30 days (cancellable)
- **Scope**: Configurable data types or complete account deletion
- **Safeguards**: Team projects transferred, critical data retained for compliance

### Right to Rectification
- **Method**: User profile updates via application UI
- **Scope**: Personal information, preferences, plan settings
- **Audit**: All changes logged for compliance

### Right to Portability
- **Implementation**: Data export in machine-readable formats
- **Standards**: JSON (primary), CSV, XML
- **Completeness**: Full data history within retention periods

### Right to Object
- **Scope**: Data processing for marketing, analytics (opt-out available)
- **Implementation**: User preferences in profile settings
- **Effect**: Immediate cessation of specified processing

## Security Measures

### Data Protection
- **Encryption at Rest**: AES-256 for database and file storage
- **Encryption in Transit**: TLS 1.3 for all communications
- **Access Controls**: Role-based access with principle of least privilege
- **Authentication**: Multi-factor authentication for admin accounts

### Monitoring & Alerting
- **Real-time Monitoring**: Health checks every 15 minutes
- **Security Alerts**: Immediate notification of breach attempts
- **Audit Logging**: Comprehensive logging of all data access and modifications
- **Incident Response**: Automated alerts with GitHub Actions integration

### Data Minimization
- **Collection**: Only data necessary for service functionality
- **Processing**: Purpose limitation strictly enforced
- **Storage**: Regular cleanup based on retention policies
- **Sharing**: No third-party data sharing except service providers

## Automated Compliance

### Data Retention Cleanup
- **Frequency**: Daily automated cleanup
- **Process**: `services/governance/retention.ts`
- **Safeguards**: Critical data and legal holds protected
- **Reporting**: Cleanup statistics logged and monitored

### Audit Trail
- **Coverage**: All user actions, admin operations, system events
- **Storage**: `audit_logs` table with structured logging
- **Access**: Admin-only via `/api/v1/audit` endpoint
- **Retention**: Plan-based retention with extended periods for critical events

### Privacy by Design
- **Data Anonymization**: Automatic anonymization of old model runs
- **Pseudonymization**: User IDs used instead of email addresses in logs
- **Consent Management**: Clear opt-in/opt-out mechanisms
- **Default Settings**: Privacy-protective defaults for all users

## Compliance Monitoring

### Metrics & Dashboards
- **Data Volume**: Track data growth and cleanup effectiveness
- **Access Patterns**: Monitor unusual data access for security
- **Retention Compliance**: Ensure policies are followed automatically
- **User Rights**: Track response times for data subject requests

### Regular Audits
- **Internal Reviews**: Quarterly compliance reviews
- **External Audits**: Annual security and privacy assessments
- **Policy Updates**: Regular review and update of retention policies
- **Training**: Staff training on data protection requirements

## Data Processing Lawful Bases

### GDPR Article 6 Bases
- **Contract Performance**: Service delivery, account management
- **Legitimate Interest**: Security monitoring, fraud prevention, service improvement
- **Consent**: Marketing communications, analytics (where required)
- **Legal Obligation**: Audit logs, security incident reporting

### Special Category Data
- **Not Collected**: No sensitive personal data categories collected
- **If Required**: Explicit consent would be obtained with clear purpose

## International Transfers

### Data Residency
- **Primary Storage**: US-based cloud infrastructure (Vercel/Neon)
- **Backup Storage**: US-based with same privacy protections
- **Service Providers**: All vendors contractually bound to privacy requirements

### Transfer Safeguards
- **Standard Contractual Clauses**: For any EU data transfers
- **Adequacy Decisions**: Preference for jurisdictions with adequacy rulings
- **Additional Safeguards**: Encryption and access controls for all transfers

## Incident Response

### Data Breach Procedures
1. **Detection**: Automated monitoring and alerting systems
2. **Assessment**: Immediate risk assessment and containment
3. **Notification**: Regulatory notification within 72 hours if required
4. **User Communication**: Direct notification to affected users
5. **Remediation**: Immediate steps to prevent further exposure
6. **Review**: Post-incident review and policy updates

### Contact Information
- **Data Protection Officer**: dpo@magi.com
- **Security Team**: security@magi.com
- **Privacy Inquiries**: privacy@magi.com

## API Endpoints Summary

### User Data Management
- `GET /api/v1/account/data-export` - Export user data
- `POST /api/v1/account/data-delete` - Request data deletion
- `DELETE /api/v1/account/data-delete` - Cancel deletion request
- `GET /api/v1/account/data-delete` - Check deletion status

### Admin Governance
- `GET /api/v1/audit` - Access audit logs (admin only)
- `POST /api/v1/audit` - Admin actions (cleanup, export, stats)
- `DELETE /api/v1/audit` - Delete specific audit logs (restricted)

### Health & Monitoring
- `GET /api/health` - System health and compliance status
- GitHub Actions workflows for automated compliance monitoring

## Policy Updates

This compliance documentation is reviewed quarterly and updated as needed. Users are notified of material changes through:
- Email notifications for significant policy changes
- In-application notices for procedural updates
- Documentation versioning for audit trail

**Last Updated**: December 2024
**Next Review**: March 2025
**Version**: 1.0