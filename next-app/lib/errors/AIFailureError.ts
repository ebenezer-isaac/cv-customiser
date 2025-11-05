/**
 * Custom error class for AI service failures
 */
export class AIFailureError extends Error {
  originalError: Error | null;
  retries: number;
  isAIFailure: boolean;

  constructor(message: string, originalError: Error | null = null, retries: number = 0) {
    super(message);
    this.name = 'AIFailureError';
    this.originalError = originalError;
    this.retries = retries;
    this.isAIFailure = true;
  }
}
