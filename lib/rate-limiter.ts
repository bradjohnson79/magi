/**
 * Rate Limiter Utility
 *
 * Simple in-memory rate limiter for API endpoints.
 * In production, this should be replaced with Redis-based limiter.
 */

interface RateLimitData {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private limits = new Map<string, RateLimitData>();

  /**
   * Check if request is within rate limit
   */
  async limit(
    identifier: string,
    action: string,
    maxRequests: number,
    windowMs: number
  ): Promise<{ success: boolean; remaining: number; resetTime: number }> {
    const key = `${identifier}:${action}`;
    const now = Date.now();
    const windowStart = now - windowMs * 1000;

    // Clean up old entries
    this.cleanup();

    const existing = this.limits.get(key);

    if (!existing || existing.resetTime < now) {
      // Create new or reset expired limit
      this.limits.set(key, {
        count: 1,
        resetTime: now + windowMs * 1000,
      });

      return {
        success: true,
        remaining: maxRequests - 1,
        resetTime: now + windowMs * 1000,
      };
    }

    if (existing.count >= maxRequests) {
      return {
        success: false,
        remaining: 0,
        resetTime: existing.resetTime,
      };
    }

    // Increment count
    existing.count++;
    this.limits.set(key, existing);

    return {
      success: true,
      remaining: maxRequests - existing.count,
      resetTime: existing.resetTime,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, data] of this.limits.entries()) {
      if (data.resetTime < now) {
        this.limits.delete(key);
      }
    }
  }

  /**
   * Clear all limits (for testing)
   */
  clear(): void {
    this.limits.clear();
  }
}

export const rateLimiter = new RateLimiter();