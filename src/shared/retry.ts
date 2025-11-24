/**
 * Retry utility with exponential backoff and jitter
 */

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  jitter?: number; // Percentage of delay to add/subtract as jitter (0-1)
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelay: 1000, // 1 second
  maxDelay: 16000, // 16 seconds
  jitter: 0.2, // ±20% jitter
};

/**
 * Sleep for specified milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Add jitter to delay (±20% by default)
 */
function addJitter(delay: number, jitter: number): number {
  const jitterAmount = delay * jitter;
  const jitterValue = (Math.random() * 2 - 1) * jitterAmount; // -jitter to +jitter
  return Math.max(0, delay + jitterValue);
}

/**
 * Retry a function with exponential backoff and jitter
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: Error | unknown;

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on last attempt
      if (attempt === opts.maxRetries) {
        break;
      }

      // Calculate exponential backoff delay
      const delay = Math.min(
        opts.initialDelay * Math.pow(2, attempt),
        opts.maxDelay
      );

      // Add jitter
      const jitteredDelay = addJitter(delay, opts.jitter);

      logger.debug(`Retry attempt ${attempt + 1}/${opts.maxRetries} after ${jitteredDelay.toFixed(0)}ms`, {
        error: error instanceof Error ? error.message : String(error),
      });

      await sleep(jitteredDelay);
    }
  }

  throw lastError;
}

import { logger } from './logger';

