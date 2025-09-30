/**
 * Secret redaction utilities for Magi platform
 * Ensures sensitive information is never logged or persisted
 */

// Common secret patterns
const SECRET_PATTERNS = [
  // API Keys
  /sk-[a-zA-Z0-9]{32,}/gi,
  /pk_[a-zA-Z0-9]{32,}/gi,
  /rk_[a-zA-Z0-9]{32,}/gi,

  // Clerk keys
  /sk_test_[a-zA-Z0-9]+/gi,
  /sk_live_[a-zA-Z0-9]+/gi,
  /pk_test_[a-zA-Z0-9]+/gi,
  /pk_live_[a-zA-Z0-9]+/gi,

  // OpenAI API keys
  /sk-[a-zA-Z0-9]{48}/gi,
  /sk-proj-[a-zA-Z0-9]{48}/gi,

  // Anthropic API keys
  /sk-ant-[a-zA-Z0-9-]{95}/gi,

  // Generic tokens
  /Bearer\s+[a-zA-Z0-9\-_.~+/=]+/gi,
  /[a-zA-Z0-9\-_.~+/=]*_token[a-zA-Z0-9\-_.~+/=]*/gi,
  /[a-zA-Z0-9\-_.~+/=]*token[a-zA-Z0-9\-_.~+/=]*/gi,

  // Database URLs with credentials
  /postgresql:\/\/[^:]+:[^@]+@/gi,
  /mysql:\/\/[^:]+:[^@]+@/gi,
  /mongodb:\/\/[^:]+:[^@]+@/gi,

  // Common secret env var patterns
  /password['"]\s*:\s*['"][^'"]+['"]/gi,
  /secret['"]\s*:\s*['"][^'"]+['"]/gi,
  /key['"]\s*:\s*['"][^'"]+['"]/gi,
];

// Environment variable names that contain secrets
const SECRET_ENV_VARS = new Set([
  'CLERK_SECRET_KEY',
  'CLERK_WEBHOOK_SECRET',
  'OPENAI_API_KEY',
  'ANTHROPIC_API_KEY',
  'DATABASE_URL',
  'DATABASE_URL_STAGING',
  'DATABASE_URL_PROD',
  'SERENA_TOKEN',
  'CONTEXT7_TOKEN',
  'STRIPE_SECRET_KEY',
  'STRIPE_WEBHOOK_SECRET',
  'SENTRY_DSN',
  'AWS_SECRET_ACCESS_KEY',
  'VERCEL_TOKEN',
  'GITHUB_TOKEN',
]);

/**
 * Redact secrets from a string
 */
export function redactSecrets(input: string): string {
  if (!input) return input;

  let redacted = input;

  // Apply all secret patterns
  SECRET_PATTERNS.forEach(pattern => {
    redacted = redacted.replace(pattern, '[REDACTED]');
  });

  return redacted;
}

/**
 * Redact secrets from an object recursively
 */
export function redactSecretsFromObject(obj: any): any {
  if (obj === null || obj === undefined) {
    return obj;
  }

  if (typeof obj === 'string') {
    return redactSecrets(obj);
  }

  if (typeof obj === 'number' || typeof obj === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => redactSecretsFromObject(item));
  }

  if (typeof obj === 'object') {
    const redacted: any = {};

    for (const [key, value] of Object.entries(obj)) {
      const keyLower = key.toLowerCase();

      // Check if key name suggests it contains secrets
      const isSecretKey = SECRET_ENV_VARS.has(key.toUpperCase()) ||
                         keyLower.includes('password') ||
                         keyLower.includes('secret') ||
                         keyLower.includes('token') ||
                         keyLower.includes('key') ||
                         keyLower.includes('auth') ||
                         keyLower.includes('credential');

      if (isSecretKey && typeof value === 'string') {
        redacted[key] = '[REDACTED]';
      } else {
        redacted[key] = redactSecretsFromObject(value);
      }
    }

    return redacted;
  }

  return obj;
}

/**
 * Redact secrets from environment variables
 */
export function redactEnvVars(env: Record<string, string | undefined>): Record<string, string | undefined> {
  const redacted: Record<string, string | undefined> = {};

  for (const [key, value] of Object.entries(env)) {
    if (SECRET_ENV_VARS.has(key.toUpperCase())) {
      redacted[key] = '[REDACTED]';
    } else {
      redacted[key] = value ? redactSecrets(value) : value;
    }
  }

  return redacted;
}

/**
 * Safe JSON stringify that redacts secrets
 */
export function safeStringify(obj: any, space?: number): string {
  try {
    const redacted = redactSecretsFromObject(obj);
    return JSON.stringify(redacted, null, space);
  } catch (error) {
    return JSON.stringify({ error: 'Failed to serialize object', type: typeof obj }, null, space);
  }
}

/**
 * Redact secrets from model run payload
 */
export function redactModelRunPayload(payload: any): any {
  if (!payload) return payload;

  // Deep clone and redact
  const redacted = redactSecretsFromObject(payload);

  // Additional AI-specific redactions
  if (redacted.prompt && typeof redacted.prompt === 'string') {
    redacted.prompt = redactSecrets(redacted.prompt);
  }

  if (redacted.messages && Array.isArray(redacted.messages)) {
    redacted.messages = redacted.messages.map((msg: any) => ({
      ...msg,
      content: typeof msg.content === 'string' ? redactSecrets(msg.content) : msg.content,
    }));
  }

  if (redacted.context && typeof redacted.context === 'object') {
    redacted.context = redactSecretsFromObject(redacted.context);
  }

  return redacted;
}

/**
 * Check if a string contains potential secrets (for validation)
 */
export function containsSecrets(input: string): boolean {
  if (!input) return false;

  return SECRET_PATTERNS.some(pattern => pattern.test(input));
}

/**
 * Get a safe preview of a string (first 50 chars, redacted)
 */
export function safePreview(input: string, maxLength: number = 50): string {
  if (!input) return '';

  const redacted = redactSecrets(input);

  if (redacted.length <= maxLength) {
    return redacted;
  }

  return redacted.substring(0, maxLength) + '...';
}