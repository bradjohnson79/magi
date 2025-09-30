import { createMocks } from 'node-mocks-http';
import handler from '@/pages/api/admin/secrets';
import { NextApiRequest, NextApiResponse } from 'next';

// Mock the auth middleware
jest.mock('@/lib/auth', () => ({
  requireAdmin: jest.fn((handler) => handler),
}));

// Mock the secrets service
jest.mock('@/lib/services/secrets', () => ({
  SecretsService: {
    getInstance: jest.fn(() => ({
      listSecrets: jest.fn(),
      createSecret: jest.fn(),
      updateSecret: jest.fn(),
      deleteSecret: jest.fn(),
      getSecret: jest.fn(),
    })),
  },
}));

// Mock encryption utilities
jest.mock('@/lib/utils/encryption', () => ({
  encrypt: jest.fn((value) => `encrypted_${value}`),
  decrypt: jest.fn((value) => value.replace('encrypted_', '')),
  maskSecret: jest.fn((value) => `***${value.slice(-3)}`),
}));

import { SecretsService } from '@/lib/services/secrets';

const mockSecretsService = SecretsService.getInstance() as jest.Mocked<any>;

describe('/api/admin/secrets API handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/admin/secrets', () => {
    it('returns grouped secrets successfully', async () => {
      const mockSecrets = [
        {
          id: 'anthropic-key',
          name: 'Anthropic API Key',
          provider: 'Anthropic',
          key: 'anthropic_key',
          value: 'encrypted_ant-api-key-123',
          category: 'llm-providers',
          description: 'Claude API access',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'openai-key',
          name: 'OpenAI API Key',
          provider: 'OpenAI',
          key: 'openai_key',
          value: 'encrypted_sk-openai-123',
          category: 'llm-providers',
          description: 'GPT model access',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: 'db-url',
          name: 'Database URL',
          provider: 'Neon',
          key: 'database_url',
          value: 'encrypted_postgresql://...',
          category: 'storage-db',
          description: 'Primary database',
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      mockSecretsService.listSecrets.mockResolvedValue(mockSecrets);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(200);
      const data = JSON.parse(res._getData());

      expect(data).toHaveProperty('llm-providers');
      expect(data).toHaveProperty('storage-db');
      expect(data).toHaveProperty('integrations');

      expect(data['llm-providers']).toHaveLength(2);
      expect(data['storage-db']).toHaveLength(1);
      expect(data['integrations']).toHaveLength(0);

      // Check that secrets are properly formatted with masked values
      expect(data['llm-providers'][0]).toHaveProperty('maskedValue');
      expect(data['llm-providers'][0].maskedValue).toBe('***123');
    });

    it('handles errors when fetching secrets', async () => {
      mockSecretsService.listSecrets.mockRejectedValue(new Error('Database error'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to fetch secrets');
    });
  });

  describe('POST /api/admin/secrets', () => {
    it('creates a new secret successfully', async () => {
      const newSecret = {
        name: 'Test API Key',
        provider: 'Anthropic',
        key: 'test_api_key',
        value: 'test-secret-value',
        description: 'Test description',
        category: 'llm-providers',
      };

      const createdSecret = {
        id: 'new-secret-id',
        ...newSecret,
        value: 'encrypted_test-secret-value',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecretsService.createSecret.mockResolvedValue(createdSecret);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newSecret,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);
      const data = JSON.parse(res._getData());

      expect(data.id).toBe('new-secret-id');
      expect(data.name).toBe('Test API Key');
      expect(mockSecretsService.createSecret).toHaveBeenCalledWith({
        ...newSecret,
        value: 'encrypted_test-secret-value',
      });
    });

    it('validates required fields', async () => {
      const invalidSecret = {
        name: 'Test API Key',
        // Missing provider, key, value
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: invalidSecret,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Missing required fields');
    });

    it('handles creation errors', async () => {
      const newSecret = {
        name: 'Test API Key',
        provider: 'Anthropic',
        key: 'test_api_key',
        value: 'test-secret-value',
        description: 'Test description',
        category: 'llm-providers',
      };

      mockSecretsService.createSecret.mockRejectedValue(new Error('Creation failed'));

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: newSecret,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(500);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Failed to create secret');
    });

    it('determines category automatically based on provider', async () => {
      const secretWithStripeProvider = {
        name: 'Stripe API Key',
        provider: 'Stripe',
        key: 'stripe_key',
        value: 'sk_test_123',
        description: 'Payment processing',
      };

      const createdSecret = {
        id: 'stripe-secret',
        ...secretWithStripeProvider,
        category: 'integrations',
        value: 'encrypted_sk_test_123',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecretsService.createSecret.mockResolvedValue(createdSecret);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: secretWithStripeProvider,
      });

      await handler(req, res);

      expect(mockSecretsService.createSecret).toHaveBeenCalledWith({
        ...secretWithStripeProvider,
        category: 'integrations',
        value: 'encrypted_sk_test_123',
      });
    });
  });

  describe('Unsupported methods', () => {
    it('returns 405 for unsupported methods', async () => {
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'PUT',
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(405);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Method PUT not allowed');
    });
  });

  describe('Authentication', () => {
    it('requires admin authentication', async () => {
      // This test verifies that the requireAdmin middleware is applied
      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
      });

      const { requireAdmin } = require('@/lib/auth');

      // Verify the handler is wrapped with requireAdmin
      expect(requireAdmin).toHaveBeenCalled();
    });
  });

  describe('Data validation and sanitization', () => {
    it('sanitizes input data', async () => {
      const secretWithXSS = {
        name: '<script>alert("xss")</script>Test API Key',
        provider: 'Anthropic',
        key: 'test_api_key',
        value: 'test-secret-value',
        description: '<img src=x onerror=alert(1)>Test description',
        category: 'llm-providers',
      };

      const sanitizedSecret = {
        id: 'new-secret',
        name: 'Test API Key', // XSS removed
        provider: 'Anthropic',
        key: 'test_api_key',
        value: 'encrypted_test-secret-value',
        description: 'Test description', // XSS removed
        category: 'llm-providers',
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockSecretsService.createSecret.mockResolvedValue(sanitizedSecret);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: secretWithXSS,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(201);

      // Verify that the service was called with sanitized data
      const createCall = mockSecretsService.createSecret.mock.calls[0][0];
      expect(createCall.name).not.toContain('<script>');
      expect(createCall.description).not.toContain('<img');
    });

    it('validates provider against allowed list', async () => {
      const secretWithInvalidProvider = {
        name: 'Test API Key',
        provider: 'UnknownProvider',
        key: 'test_api_key',
        value: 'test-secret-value',
        description: 'Test description',
        category: 'llm-providers',
      };

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'POST',
        body: secretWithInvalidProvider,
      });

      await handler(req, res);

      expect(res._getStatusCode()).toBe(400);
      const data = JSON.parse(res._getData());
      expect(data.error).toBe('Invalid provider');
    });
  });

  describe('Response formatting', () => {
    it('formats response with proper structure', async () => {
      const mockSecrets = [
        {
          id: 'test-secret',
          name: 'Test Secret',
          provider: 'Anthropic',
          key: 'test_key',
          value: 'encrypted_test_value',
          category: 'llm-providers',
          description: 'Test description',
          isActive: true,
          createdAt: new Date('2024-01-01'),
          updatedAt: new Date('2024-01-02'),
        },
      ];

      mockSecretsService.listSecrets.mockResolvedValue(mockSecrets);

      const { req, res } = createMocks<NextApiRequest, NextApiResponse>({
        method: 'GET',
      });

      await handler(req, res);

      const data = JSON.parse(res._getData());
      const secret = data['llm-providers'][0];

      expect(secret).toHaveProperty('id');
      expect(secret).toHaveProperty('name');
      expect(secret).toHaveProperty('provider');
      expect(secret).toHaveProperty('key');
      expect(secret).toHaveProperty('maskedValue');
      expect(secret).toHaveProperty('description');
      expect(secret).toHaveProperty('lastUpdated');
      expect(secret).toHaveProperty('isActive');

      // Ensure actual value is not exposed
      expect(secret).not.toHaveProperty('value');
    });
  });
});