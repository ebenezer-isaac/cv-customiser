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
    model: process.env.GEMINI_MODEL || 'gemini-2.5-pro', // Legacy single model config
    proModel: process.env.GEMINI_PRO_MODEL || 'gemini-2.5-pro', // Powerful model for complex tasks
    flashModel: process.env.GEMINI_FLASH_MODEL || 'gemini-2.5-flash', // Fast model for simple tasks
    maxRetries: parseInt(process.env.AI_MAX_RETRIES, 10) || 5,
    initialRetryDelay: parseInt(process.env.AI_INITIAL_RETRY_DELAY, 10) || 5000
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
  console.log('[DEBUG] Config: Validating configuration...');
  if (!config.apiKeys.gemini) {
    console.error('[DEBUG] Config: GEMINI_API_KEY is missing');
    throw new Error('GEMINI_API_KEY environment variable is required');
  }
  console.log('[DEBUG] Config: Configuration validation passed');
  console.log(`[DEBUG] Config: Server port: ${config.server.port}`);
  console.log(`[DEBUG] Config: Node environment: ${config.server.nodeEnv}`);
  console.log(`[DEBUG] Config: AI Pro model: ${config.ai.proModel}`);
  console.log(`[DEBUG] Config: AI Flash model: ${config.ai.flashModel}`);
  console.log(`[DEBUG] Config: Target page count: ${config.document.targetPageCount}`);
}

module.exports = {
  ...config,
  validateConfig
};
