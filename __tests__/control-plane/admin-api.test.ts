/**
 * Admin API Tests
 *
 * Tests for admin-only endpoints including access control,
 * secrets management, and platform settings CRUD operations.
 */

import { NextRequest } from 'next/server';
import { GET, POST, PUT, DELETE } from '@/app/api/v1/admin/secrets/route';
import {
  GET as getSettings,
  POST as postSettings,
  DELETE as deleteSettings
} from '@/app/api/v1/admin/settings/route';

// Mock dependencies
jest.mock('@clerk/nextjs/server', () => ({
  auth: jest.fn(),
}));

jest.mock('@/lib/db', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
    },
    secret: {
      findMany: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    platformSetting: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
    featureFlag: {
      findMany: jest.fn(),
      upsert: jest.fn(),
      delete: jest.fn(),
    },
  },
}));

jest.mock('@/services/secrets', () => ({
  storeSecret: jest.fn(),
  listSecrets: jest.fn(),
  updateSecret: jest.fn(),
  deleteSecret: jest.fn(),
  getSecretStats: jest.fn(),
}));

jest.mock('@/services/platform/settings', () => ({
  platformSettings: {
    getSettingsByCategory: jest.fn(),
    getAllFeatureFlags: jest.fn(),
    getModelWeights: jest.fn(),
    getPlanQuotas: jest.fn(),
    getPublicSettings: jest.fn(),
    setSetting: jest.fn(),
    setFeatureFlag: jest.fn(),
    setModelWeights: jest.fn(),
    setPlanQuotas: jest.fn(),
    clearCache: jest.fn(),
  },
}));

jest.mock('@/services/audit/logger', () => ({
  auditLogger: {
    logSecurity: jest.fn(),
    logAdmin: jest.fn(),
  },
}));

jest.mock('@/services/tracing/setup', () => ({
  withSpan: jest.fn((name, fn) => fn()),
  addSpanAttributes: jest.fn(),
  SPAN_ATTRIBUTES: {
    OPERATION_TYPE: 'operation.type',
    ROUTE_PATH: 'route.path',
  },
}));

const { auth } = require('@clerk/nextjs/server');
const { prisma } = require('@/lib/db');
const secrets = require('@/services/secrets');
const { platformSettings } = require('@/services/platform/settings');
const { auditLogger } = require('@/services/audit/logger');

describe('Admin API Endpoints', () => {
  const adminUserId = 'clerk-admin-123';
  const regularUserId = 'clerk-user-456';
  const adminUser = {
    id: 'admin-id-123',
    role: 'admin',
    email: 'admin@example.com',
  };
  const regularUser = {
    id: 'user-id-456',
    role: 'user',
    email: 'user@example.com',
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Authentication & Authorization', () => {
    it('should reject unauthenticated requests', async () => {
      auth.mockReturnValue({ userId: null });

      const request = new NextRequest('http://localhost/api/v1/admin/secrets');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toContain('Authentication required');
    });

    it('should reject non-admin users', async () => {
      auth.mockReturnValue({ userId: regularUserId });
      prisma.user.findUnique.mockResolvedValue(regularUser);

      const request = new NextRequest('http://localhost/api/v1/admin/secrets');
      const response = await GET(request);
      const data = await response.json();

      expect(response.status).toBe(403);
      expect(data.success).toBe(false);
      expect(data.message).toContain('Admin access required');

      expect(auditLogger.logSecurity).toHaveBeenCalledWith(
        'security.access_denied',
        regularUser.id,
        expect.objectContaining({
          resource: 'admin_secrets',
          reason: 'insufficient_privileges',
        })
      );
    });

    it('should allow admin users', async () => {
      auth.mockReturnValue({ userId: adminUserId });
      prisma.user.findUnique.mockResolvedValue(adminUser);
      secrets.listSecrets.mockResolvedValue([]);

      const request = new NextRequest('http://localhost/api/v1/admin/secrets');
      const response = await GET(request);

      expect(response.status).toBe(200);
    });
  });

  describe('Secrets API', () => {
    beforeEach(() => {
      auth.mockReturnValue({ userId: adminUserId });
      prisma.user.findUnique.mockResolvedValue(adminUser);
    });

    describe('GET /api/v1/admin/secrets', () => {
      it('should list secrets with statistics', async () => {
        const mockSecrets = [
          {
            id: 'secret-1',
            name: 'openai_key',
            maskedValue: '****************cdef',
            provider: 'openai',
          },
        ];
        const mockStats = {
          total: 1,
          byProvider: [{ provider: 'openai', count: 1 }],
        };

        secrets.listSecrets.mockResolvedValue(mockSecrets);
        secrets.getSecretStats.mockResolvedValue(mockStats);

        const request = new NextRequest('http://localhost/api/v1/admin/secrets?stats=true');
        const response = await GET(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data.secrets).toEqual(mockSecrets);
        expect(data.data.stats).toEqual(mockStats);
      });

      it('should list secrets without statistics when not requested', async () => {
        const mockSecrets = [{ id: 'secret-1', name: 'test' }];
        secrets.listSecrets.mockResolvedValue(mockSecrets);

        const request = new NextRequest('http://localhost/api/v1/admin/secrets');
        const response = await GET(request);
        const data = await response.json();

        expect(data.data.stats).toBeNull();
        expect(secrets.getSecretStats).not.toHaveBeenCalled();
      });
    });

    describe('POST /api/v1/admin/secrets', () => {
      it('should create a new secret', async () => {
        secrets.storeSecret.mockResolvedValue();

        const requestBody = {
          name: 'new_secret',
          value: 'secret-value-123',
          provider: 'openai',
          description: 'Test secret',
        };

        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'POST',
          body: JSON.stringify(requestBody),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(secrets.storeSecret).toHaveBeenCalledWith(
          'new_secret',
          'openai',
          'secret-value-123',
          adminUser.id,
          'Test secret'
        );
      });

      it('should validate required fields', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'POST',
          body: JSON.stringify({ name: 'test' }), // Missing value
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Name and value are required');
      });

      it('should validate secret name format', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'POST',
          body: JSON.stringify({
            name: 'invalid name with spaces!',
            value: 'test-value',
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('can only contain letters, numbers, underscores, and hyphens');
      });

      it('should handle duplicate secret names', async () => {
        secrets.storeSecret.mockRejectedValue(new Error('Secret with name \'duplicate\' already exists'));

        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'POST',
          body: JSON.stringify({
            name: 'duplicate',
            value: 'test-value',
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await POST(request);
        const data = await response.json();

        expect(response.status).toBe(409);
        expect(data.success).toBe(false);
      });
    });

    describe('PUT /api/v1/admin/secrets', () => {
      it('should update an existing secret', async () => {
        secrets.updateSecret.mockResolvedValue();

        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'PUT',
          body: JSON.stringify({
            name: 'existing_secret',
            value: 'new-value',
            description: 'Updated description',
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(secrets.updateSecret).toHaveBeenCalledWith(
          'existing_secret',
          { value: 'new-value', description: 'Updated description' },
          adminUser.id
        );
      });

      it('should validate secret name is provided', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'PUT',
          body: JSON.stringify({ value: 'new-value' }), // Missing name
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Secret name is required');
      });

      it('should require at least one field to update', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/secrets', {
          method: 'PUT',
          body: JSON.stringify({ name: 'test_secret' }), // No updates
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await PUT(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('At least one field must be updated');
      });
    });

    describe('DELETE /api/v1/admin/secrets', () => {
      it('should delete a secret', async () => {
        secrets.deleteSecret.mockResolvedValue();

        const request = new NextRequest('http://localhost/api/v1/admin/secrets?name=delete_me');
        const response = await DELETE(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(secrets.deleteSecret).toHaveBeenCalledWith('delete_me', adminUser.id);
      });

      it('should require secret name parameter', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/secrets'); // No name param
        const response = await DELETE(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Secret name is required');
      });

      it('should handle non-existent secrets', async () => {
        secrets.deleteSecret.mockRejectedValue(new Error('Secret \'nonexistent\' not found'));

        const request = new NextRequest('http://localhost/api/v1/admin/secrets?name=nonexistent');
        const response = await DELETE(request);

        expect(response.status).toBe(404);
      });
    });
  });

  describe('Settings API', () => {
    beforeEach(() => {
      auth.mockReturnValue({ userId: adminUserId });
      prisma.user.findUnique.mockResolvedValue(adminUser);
    });

    describe('GET /api/v1/admin/settings', () => {
      it('should get all settings types', async () => {
        const mockSettings = {
          general: [{ key: 'app_name', value: 'Magi' }],
          models: [{ key: 'default_model', value: 'gpt-4' }],
        };
        const mockFlags = [{ name: 'mcp_enabled', enabled: true }];
        const mockWeights = [{ modelId: 'gpt-4', weight: 80 }];
        const mockQuotas = { trial: { maxRequests: 100 } };
        const mockPublic = { theme: 'dark' };

        platformSettings.getSettingsByCategory
          .mockResolvedValueOnce(mockSettings.general)
          .mockResolvedValueOnce(mockSettings.models)
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([])
          .mockResolvedValueOnce([]);

        platformSettings.getAllFeatureFlags.mockResolvedValue(mockFlags);
        platformSettings.getModelWeights.mockResolvedValue(mockWeights);
        platformSettings.getPlanQuotas.mockResolvedValue(mockQuotas);
        platformSettings.getPublicSettings.mockResolvedValue(mockPublic);

        const request = new NextRequest('http://localhost/api/v1/admin/settings');
        const response = await getSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(data.data).toHaveProperty('settings');
        expect(data.data).toHaveProperty('featureFlags');
        expect(data.data).toHaveProperty('modelWeights');
        expect(data.data).toHaveProperty('planQuotas');
        expect(data.data).toHaveProperty('publicSettings');
      });

      it('should filter by category', async () => {
        const mockSettings = [{ key: 'setting1', value: 'value1' }];
        platformSettings.getSettingsByCategory.mockResolvedValue(mockSettings);

        const request = new NextRequest('http://localhost/api/v1/admin/settings?category=general');
        const response = await getSettings(request);
        const data = await response.json();

        expect(platformSettings.getSettingsByCategory).toHaveBeenCalledWith('general');
        expect(data.data.settings).toEqual(mockSettings);
      });

      it('should filter by type', async () => {
        const mockFlags = [{ name: 'test_flag', enabled: false }];
        platformSettings.getAllFeatureFlags.mockResolvedValue(mockFlags);

        const request = new NextRequest('http://localhost/api/v1/admin/settings?type=flags');
        const response = await getSettings(request);
        const data = await response.json();

        expect(data.data.featureFlags).toEqual(mockFlags);
        expect(data.data).not.toHaveProperty('settings');
      });
    });

    describe('POST /api/v1/admin/settings', () => {
      it('should update a platform setting', async () => {
        platformSettings.setSetting.mockResolvedValue();

        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'setting',
            data: {
              key: 'app_name',
              value: 'New App Name',
              valueType: 'string',
              description: 'Application name',
              category: 'general',
              isPublic: true,
            },
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(platformSettings.setSetting).toHaveBeenCalledWith(
          'app_name',
          'New App Name',
          'string',
          adminUser.id,
          {
            description: 'Application name',
            category: 'general',
            isPublic: true,
          }
        );
      });

      it('should update a feature flag', async () => {
        platformSettings.setFeatureFlag.mockResolvedValue();

        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'feature_flag',
            data: {
              name: 'new_feature',
              enabled: true,
              rolloutPercentage: 50,
              description: 'New feature toggle',
            },
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(platformSettings.setFeatureFlag).toHaveBeenCalledWith(
          'new_feature',
          true,
          50,
          adminUser.id,
          {
            description: 'New feature toggle',
            conditions: {},
          }
        );
      });

      it('should update model weights', async () => {
        platformSettings.setModelWeights.mockResolvedValue();

        const weights = [
          { modelId: 'gpt-4', weight: 80, enabled: true, priority: 1 },
          { modelId: 'claude-3', weight: 20, enabled: true, priority: 2 },
        ];

        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'model_weights',
            data: { weights },
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(platformSettings.setModelWeights).toHaveBeenCalledWith(weights, adminUser.id);
      });

      it('should validate model weights structure', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'model_weights',
            data: {
              weights: [
                { modelId: 'gpt-4' }, // Missing weight
              ],
            },
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Each weight must have modelId and numeric weight');
      });

      it('should handle bulk settings updates', async () => {
        platformSettings.setSetting.mockResolvedValue();

        const settings = [
          { key: 'setting1', value: 'value1', type: 'string' },
          { key: 'setting2', value: '42', type: 'number' },
        ];

        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'bulk_settings',
            data: { settings },
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.data.bulkSettings.total).toBe(2);
        expect(data.data.bulkSettings.successful).toBe(2);
        expect(platformSettings.setSetting).toHaveBeenCalledTimes(2);
      });

      it('should validate required fields', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({}), // Missing type and data
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.success).toBe(false);
        expect(data.message).toContain('Type and data are required');
      });

      it('should reject invalid setting types', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/settings', {
          method: 'POST',
          body: JSON.stringify({
            type: 'invalid_type',
            data: {},
          }),
          headers: { 'Content-Type': 'application/json' },
        });

        const response = await postSettings(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('Supported types');
      });
    });

    describe('DELETE /api/v1/admin/settings', () => {
      it('should delete a platform setting', async () => {
        prisma.platformSetting.delete.mockResolvedValue({});

        const request = new NextRequest('http://localhost/api/v1/admin/settings?type=setting&key=test_setting');
        const response = await deleteSettings(request);
        const data = await response.json();

        expect(response.status).toBe(200);
        expect(data.success).toBe(true);
        expect(prisma.platformSetting.delete).toHaveBeenCalledWith({
          where: { key: 'test_setting' },
        });
      });

      it('should delete a feature flag', async () => {
        prisma.featureFlag.delete.mockResolvedValue({});

        const request = new NextRequest('http://localhost/api/v1/admin/settings?type=feature_flag&name=test_flag');
        const response = await deleteSettings(request);

        expect(response.status).toBe(200);
        expect(prisma.featureFlag.delete).toHaveBeenCalledWith({
          where: { name: 'test_flag' },
        });
      });

      it('should require type parameter', async () => {
        const request = new NextRequest('http://localhost/api/v1/admin/settings'); // No type
        const response = await deleteSettings(request);
        const data = await response.json();

        expect(response.status).toBe(400);
        expect(data.message).toContain('Type parameter is required');
      });

      it('should handle non-existent items', async () => {
        prisma.platformSetting.delete.mockRejectedValue(new Error('Record not found'));

        const request = new NextRequest('http://localhost/api/v1/admin/settings?type=setting&key=nonexistent');
        const response = await deleteSettings(request);

        expect(response.status).toBe(404);
      });
    });
  });
});