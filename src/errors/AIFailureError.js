/**
 * Custom error class for AI service failures
 */
class AIFailureError extends Error {
  constructor(message, originalError = null, retries = 0) {
    super(message);
    this.name = 'AIFailureError';
    this.originalError = originalError;
    this.retries = retries;
    this.isAIFailure = true;
  }
}

module.exports = AIFailureError;
