import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadMCPConfig, validateMCPConfig, getSafeMCPConfig, isMCPAvailable } from '@/lib/config/mcp';

describe('MCP Configuration', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Reset environment variables
    delete process.env.MCP_ENABLED;
    delete process.env.CONTEXT7_ENDPOINTS;
    delete process.env.CONTEXT7_TOKEN;
    delete process.env.CONTEXT7_TIMEOUT;
    delete process.env.CONTEXT7_RETRIES;
  });

  describe('loadMCPConfig()', () => {
    it('should load default configuration', () => {
      const config = loadMCPConfig();

      expect(config.enabled).toBe(true); // Defaults to true
      expect(config.endpoints).toEqual(['http://localhost:3001', 'http://localhost:8080']);
      expect(config.token).toBeUndefined();
      expect(config.timeout).toBe(30000);
      expect(config.retries).toBe(3);
    });

    it('should load configuration from environment variables', () => {
      process.env.MCP_ENABLED = 'true';
      process.env.CONTEXT7_ENDPOINTS = 'http://api1.example.com,http://api2.example.com';
      process.env.CONTEXT7_TOKEN = 'test-token-123';
      process.env.CONTEXT7_TIMEOUT = '15000';
      process.env.CONTEXT7_RETRIES = '5';

      const config = loadMCPConfig();

      expect(config.enabled).toBe(true);
      expect(config.endpoints).toEqual(['http://api1.example.com', 'http://api2.example.com']);
      expect(config.token).toBe('test-token-123');
      expect(config.timeout).toBe(15000);
      expect(config.retries).toBe(5);
    });

    it('should disable MCP when MCP_ENABLED is false', () => {
      process.env.MCP_ENABLED = 'false';

      const config = loadMCPConfig();

      expect(config.enabled).toBe(false);
    });

    it('should handle malformed endpoint strings', () => {
      process.env.CONTEXT7_ENDPOINTS = 'http://api1.example.com, , http://api2.example.com,';

      const config = loadMCPConfig();

      expect(config.endpoints).toEqual(['http://api1.example.com', 'http://api2.example.com']);
    });

    it('should handle invalid timeout and retry values', () => {
      process.env.CONTEXT7_TIMEOUT = 'invalid';
      process.env.CONTEXT7_RETRIES = 'also-invalid';

      const config = loadMCPConfig();

      expect(config.timeout).toBe(30000); // Falls back to default
      expect(config.retries).toBe(3); // Falls back to default
    });
  });

  describe('validateMCPConfig()', () => {
    it('should validate a good configuration', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001', 'https://api.example.com'],
        token: 'test-token',
        timeout: 30000,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should pass validation when MCP is disabled', () => {
      const config = {
        enabled: false,
        endpoints: [], // Empty endpoints should be fine when disabled
        timeout: -1, // Invalid timeout should be fine when disabled
        retries: -1 // Invalid retries should be fine when disabled
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject empty endpoints when MCP is enabled', () => {
      const config = {
        enabled: true,
        endpoints: [],
        timeout: 30000,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('At least one Context7 endpoint must be configured when MCP is enabled');
    });

    it('should reject invalid URL endpoints', () => {
      const config = {
        enabled: true,
        endpoints: ['not-a-url', 'http://valid.example.com', 'also-invalid'],
        timeout: 30000,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Invalid endpoint URL: not-a-url');
      expect(result.errors).toContain('Invalid endpoint URL: also-invalid');
      expect(result.errors).not.toContain('Invalid endpoint URL: http://valid.example.com');
    });

    it('should reject invalid timeout values', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001'],
        timeout: 0,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Timeout must be a positive number');
    });

    it('should reject invalid retry values', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001'],
        timeout: 30000,
        retries: -1
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Retries must be a non-negative number');
    });

    it('should allow zero retries', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001'],
        timeout: 30000,
        retries: 0 // Zero retries should be valid
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });

  describe('getSafeMCPConfig()', () => {
    it('should redact sensitive information', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001'],
        token: 'super-secret-token',
        timeout: 30000,
        retries: 3
      };

      const safeConfig = getSafeMCPConfig(config);

      expect(safeConfig.enabled).toBe(true);
      expect(safeConfig.endpoints).toEqual(['http://localhost:3001']);
      expect(safeConfig.token).toBe('[REDACTED]');
      expect(safeConfig.timeout).toBe(30000);
      expect(safeConfig.retries).toBe(3);
    });

    it('should handle undefined token', () => {
      const config = {
        enabled: true,
        endpoints: ['http://localhost:3001'],
        token: undefined,
        timeout: 30000,
        retries: 3
      };

      const safeConfig = getSafeMCPConfig(config);

      expect(safeConfig.token).toBeUndefined();
    });
  });

  describe('isMCPAvailable()', () => {
    it('should return true for valid enabled configuration', () => {
      process.env.MCP_ENABLED = 'true';
      process.env.CONTEXT7_ENDPOINTS = 'http://localhost:3001';

      const available = isMCPAvailable();

      expect(available).toBe(true);
    });

    it('should return false when MCP is disabled', () => {
      process.env.MCP_ENABLED = 'false';

      const available = isMCPAvailable();

      expect(available).toBe(false);
    });

    it('should return false for invalid configuration', () => {
      process.env.MCP_ENABLED = 'true';
      process.env.CONTEXT7_ENDPOINTS = ''; // Empty endpoints

      const available = isMCPAvailable();

      expect(available).toBe(false);
    });

    it('should return false for invalid endpoints', () => {
      process.env.MCP_ENABLED = 'true';
      process.env.CONTEXT7_ENDPOINTS = 'not-a-valid-url';

      const available = isMCPAvailable();

      expect(available).toBe(false);
    });
  });

  describe('URL validation', () => {
    it('should accept various valid URL formats', () => {
      const validUrls = [
        'http://localhost:3001',
        'https://api.example.com',
        'http://192.168.1.100:8080',
        'https://subdomain.example.com:443/path',
        'http://example.com',
        'https://api-v2.service.com'
      ];

      const config = {
        enabled: true,
        endpoints: validUrls,
        timeout: 30000,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should reject invalid URL formats', () => {
      const invalidUrls = [
        'localhost:3001', // Missing protocol
        'ftp://example.com', // Invalid protocol
        'http://', // Incomplete URL
        'not-a-url-at-all',
        'http://[invalid',
        ''
      ];

      const config = {
        enabled: true,
        endpoints: invalidUrls,
        timeout: 30000,
        retries: 3
      };

      const result = validateMCPConfig(config);

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      invalidUrls.forEach(url => {
        if (url) { // Skip empty string as it gets filtered out
          expect(result.errors.some(error => error.includes(url))).toBe(true);
        }
      });
    });
  });
});