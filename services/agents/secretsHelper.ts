/**
 * Secrets Helper for Agents
 *
 * Provides a secure interface for agents to access secrets without directly
 * reading from environment variables. Includes caching and audit logging.
 */

import { getSecret, SECRET_NAMES, PROVIDERS } from '@/services/secrets';
import { auditLogger } from '@/services/audit/logger';
import { withSpan, addSpanAttributes, SPAN_ATTRIBUTES } from '@/services/tracing/setup';

interface SecretAccessOptions {
  required?: boolean;
  fallbackEnvVar?: string;
  userId?: string;
  agentName?: string;
}

interface ModelConfig {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

export class AgentSecretsHelper {
  private agentName: string;
  private userId?: string;

  constructor(agentName: string, userId?: string) {
    this.agentName = agentName;
    this.userId = userId;
  }

  /**
   * Get a secret value with fallback to environment variable
   */
  async getSecret(
    secretName: string,
    options: SecretAccessOptions = {}
  ): Promise<string> {
    return await withSpan('agent.get_secret', async () => {
      try {
        addSpanAttributes({
          [SPAN_ATTRIBUTES.OPERATION_TYPE]: 'secret_access',
          'secret.name': secretName,
          'agent.name': this.agentName,
        });

        // Try to get from secrets service first
        try {
          const value = await getSecret(secretName, this.userId);

          // Log successful access
          if (this.userId) {
            await auditLogger.logSystem('system.secret_accessed_by_agent', {
              secretName,
              agentName: this.agentName,
              userId: this.userId,
            });
          }

          return value;
        } catch (error) {
          console.warn(`Failed to get secret '${secretName}' from secrets service:`, error);

          // Fallback to environment variable if specified and if required
          if (options.fallbackEnvVar) {
            const envValue = process.env[options.fallbackEnvVar];
            if (envValue) {
              console.warn(`Using fallback environment variable '${options.fallbackEnvVar}' for secret '${secretName}'`);

              // Log fallback usage
              if (this.userId) {
                await auditLogger.logSystem('system.secret_fallback_used', {
                  secretName,
                  fallbackEnvVar: options.fallbackEnvVar,
                  agentName: this.agentName,
                  userId: this.userId,
                });
              }

              return envValue;
            }
          }

          // If required and no fallback available, throw error
          if (options.required !== false) {
            const errorMessage = `Required secret '${secretName}' not found`;

            if (this.userId) {
              await auditLogger.logSecurity('security.required_secret_missing', this.userId, {
                secretName,
                agentName: this.agentName,
                error: errorMessage,
              });
            }

            throw new Error(errorMessage);
          }

          return '';
        }
      } catch (error) {
        console.error(`Failed to access secret '${secretName}':`, error);

        if (this.userId) {
          await auditLogger.logSecurity('security.secret_access_error', this.userId, {
            secretName,
            agentName: this.agentName,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }

        throw error;
      }
    });
  }

  /**
   * Get OpenAI configuration
   */
  async getOpenAIConfig(): Promise<ModelConfig> {
    const apiKey = await this.getSecret(SECRET_NAMES.OPENAI_API_KEY, {
      required: true,
      fallbackEnvVar: 'OPENAI_API_KEY',
    });

    return {
      apiKey,
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4',
      maxTokens: 4000,
      temperature: 0.1,
    };
  }

  /**
   * Get Anthropic configuration
   */
  async getAnthropicConfig(): Promise<ModelConfig> {
    const apiKey = await this.getSecret(SECRET_NAMES.ANTHROPIC_API_KEY, {
      required: true,
      fallbackEnvVar: 'ANTHROPIC_API_KEY',
    });

    return {
      apiKey,
      baseUrl: 'https://api.anthropic.com',
      model: 'claude-3-sonnet-20240229',
      maxTokens: 4000,
      temperature: 0.1,
    };
  }

  /**
   * Get Google AI configuration
   */
  async getGoogleConfig(): Promise<ModelConfig> {
    const apiKey = await this.getSecret(SECRET_NAMES.GOOGLE_API_KEY, {
      required: true,
      fallbackEnvVar: 'GOOGLE_API_KEY',
    });

    return {
      apiKey,
      baseUrl: 'https://generativelanguage.googleapis.com',
      model: 'gemini-pro',
      maxTokens: 4000,
      temperature: 0.1,
    };
  }

  /**
   * Get database URL
   */
  async getDatabaseUrl(): Promise<string> {
    return await this.getSecret(SECRET_NAMES.DATABASE_URL, {
      required: true,
      fallbackEnvVar: 'DATABASE_URL',
    });
  }

  /**
   * Get GitHub token for MCP operations
   */
  async getGitHubToken(): Promise<string> {
    return await this.getSecret(SECRET_NAMES.GITHUB_TOKEN, {
      required: false,
      fallbackEnvVar: 'GITHUB_TOKEN',
    });
  }

  /**
   * Get JWT secret for authentication
   */
  async getJWTSecret(): Promise<string> {
    return await this.getSecret(SECRET_NAMES.JWT_SECRET, {
      required: true,
      fallbackEnvVar: 'JWT_SECRET',
    });
  }

  /**
   * Get AWS credentials
   */
  async getAWSCredentials(): Promise<{
    accessKeyId: string;
    secretAccessKey: string;
  }> {
    const [accessKeyId, secretAccessKey] = await Promise.all([
      this.getSecret(SECRET_NAMES.AWS_ACCESS_KEY, {
        required: true,
        fallbackEnvVar: 'AWS_ACCESS_KEY_ID',
      }),
      this.getSecret(SECRET_NAMES.AWS_SECRET_KEY, {
        required: true,
        fallbackEnvVar: 'AWS_SECRET_ACCESS_KEY',
      }),
    ]);

    return { accessKeyId, secretAccessKey };
  }

  /**
   * Get Slack webhook URL for notifications
   */
  async getSlackWebhook(): Promise<string> {
    return await this.getSecret(SECRET_NAMES.SLACK_WEBHOOK, {
      required: false,
      fallbackEnvVar: 'SLACK_WEBHOOK_URL',
    });
  }

  /**
   * Get Discord webhook URL for notifications
   */
  async getDiscordWebhook(): Promise<string> {
    return await this.getSecret(SECRET_NAMES.DISCORD_WEBHOOK, {
      required: false,
      fallbackEnvVar: 'DISCORD_WEBHOOK_URL',
    });
  }

  /**
   * Get provider-specific configuration
   */
  async getProviderConfig(provider: string): Promise<ModelConfig> {
    switch (provider.toLowerCase()) {
      case PROVIDERS.OPENAI:
        return await this.getOpenAIConfig();

      case PROVIDERS.ANTHROPIC:
        return await this.getAnthropicConfig();

      case PROVIDERS.GOOGLE:
        return await this.getGoogleConfig();

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  /**
   * Check if a secret exists without retrieving its value
   */
  async hasSecret(secretName: string): Promise<boolean> {
    try {
      await this.getSecret(secretName, { required: false });
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get multiple secrets at once for efficiency
   */
  async getMultipleSecrets(secretNames: string[]): Promise<Record<string, string>> {
    const results: Record<string, string> = {};

    await Promise.all(
      secretNames.map(async (name) => {
        try {
          results[name] = await this.getSecret(name, { required: false });
        } catch (error) {
          console.warn(`Failed to get secret '${name}':`, error);
          results[name] = '';
        }
      })
    );

    return results;
  }

  /**
   * Validate that all required secrets are available
   */
  async validateRequiredSecrets(requiredSecrets: string[]): Promise<{
    valid: boolean;
    missing: string[];
  }> {
    const missing: string[] = [];

    await Promise.all(
      requiredSecrets.map(async (secretName) => {
        try {
          await this.getSecret(secretName, { required: true });
        } catch (error) {
          missing.push(secretName);
        }
      })
    );

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Create a scoped helper for a specific user context
   */
  static forUser(agentName: string, userId: string): AgentSecretsHelper {
    return new AgentSecretsHelper(agentName, userId);
  }

  /**
   * Create a system-level helper (no user context)
   */
  static forSystem(agentName: string): AgentSecretsHelper {
    return new AgentSecretsHelper(agentName);
  }
}

// Convenience function for quick access
export async function getAgentSecret(
  agentName: string,
  secretName: string,
  userId?: string,
  options?: SecretAccessOptions
): Promise<string> {
  const helper = new AgentSecretsHelper(agentName, userId);
  return await helper.getSecret(secretName, options);
}

// Provider-specific helpers
export const providerHelpers = {
  /**
   * Get OpenAI client configuration
   */
  async openai(agentName: string, userId?: string): Promise<ModelConfig> {
    const helper = new AgentSecretsHelper(agentName, userId);
    return await helper.getOpenAIConfig();
  },

  /**
   * Get Anthropic client configuration
   */
  async anthropic(agentName: string, userId?: string): Promise<ModelConfig> {
    const helper = new AgentSecretsHelper(agentName, userId);
    return await helper.getAnthropicConfig();
  },

  /**
   * Get Google AI client configuration
   */
  async google(agentName: string, userId?: string): Promise<ModelConfig> {
    const helper = new AgentSecretsHelper(agentName, userId);
    return await helper.getGoogleConfig();
  },
};

// Export commonly used secret names for convenience
export { SECRET_NAMES, PROVIDERS };