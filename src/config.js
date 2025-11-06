/**
 * Central configuration module for the CV Customiser application
 * All configuration values should be sourced from environment variables via this module
 * This provides a single source of truth for all settings
 */

require('dotenv').config();

const config = {
  // API Keys
  apiKeys: {
    gemini: process.env.GEMINI_API_KEY,
    apollo: process.env.APOLLO_API_KEY,
    browserless: process.env.BROWSERLESS_API_KEY
  },

  // Server Configuration
  server: {
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development'
  },

  // User Configuration
  user: {
    name: process.env.USER_NAME || 'ebenezer-isaac'
  },

  // AI Model Configuration
  ai: {
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro',
    maxRetries: parseInt(process.env.AI_MAX_RETRIES, 10) || 3,
    initialRetryDelay: parseInt(process.env.AI_INITIAL_RETRY_DELAY, 10) || 1000
  },

  // Document Generation Configuration
  document: {
    targetPageCount: parseInt(process.env.TARGET_PAGE_COUNT, 10) || 2,
    maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH, 10) || 50000
  },

  // Timeouts
  timeouts: {
    scraping: parseInt(process.env.SCRAPING_TIMEOUT, 10) || 30000
  }
};

/**
 * Validate required configuration
 * @throws {Error} If required configuration is missing
 */
function validateConfig() {
  if (!config.apiKeys.gemini) {
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
}

module.exports = {
  ...config,
  validateConfig
};
