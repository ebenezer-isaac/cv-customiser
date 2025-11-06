const puppeteer = require('puppeteer-core');
const validator = require('validator');

/**
 * Helper function to detect if input is a URL
 * @param {string} text - Input text
 * @returns {boolean} True if text is a valid URL
 */
function isURL(text) {
  if (!text || typeof text !== 'string') {
    return false;
  }
  
  const trimmed = text.trim();
  
  // Quick check for http/https prefix
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return false;
  }
  
  // Use validator for more robust URL validation
  return validator.isURL(trimmed, {
    protocols: ['http', 'https'],
    require_protocol: true
  });
}



/**
 * Helper function to scrape content from URL using browserless.io
 * Provides SSRF protection by using a sandboxed remote browser
 * NOTE: The URL is user-provided by design for job posting scraping.
 * Security is ensured by:
 * 1. URL validation with isURL() before calling this function
 * 2. Using browserless.io sandbox instead of direct server-side access
 * 3. Timeout limits to prevent hanging
 * @param {string} url - URL to scrape (validated by caller)
 * @returns {Promise<string>} Scraped text content
 */
async function scrapeURL(url) {
  const MAX_CONTENT_LENGTH = 50000; // Maximum characters to extract
  const BROWSERLESS_API_KEY = process.env.BROWSERLESS_API_KEY;
  
  if (!BROWSERLESS_API_KEY) {
    throw new Error('BROWSERLESS_API_KEY environment variable is required for secure URL scraping');
  }
  
  // Validate URL format (additional validation beyond isURL check by caller)
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    throw new Error('Invalid URL protocol. Only http and https are supported.');
  }
  
  let browser = null;
  
  try {
    // Connect to browserless.io for secure, sandboxed scraping
    // This prevents SSRF by delegating URL access to a remote sandboxed browser
    browser = await puppeteer.connect({
      browserWSEndpoint: `wss://chrome.browserless.io?token=${BROWSERLESS_API_KEY}`,
    });
    
    const page = await browser.newPage();
    
    // Set a reasonable timeout
    // The user-provided URL is intentionally used here for scraping job postings
    await page.goto(url, {
      waitUntil: 'networkidle0',
      timeout: 30000
    });
    
    // Extract text content from the page
    const content = await page.evaluate(() => {
      // Remove script, style, nav, header, footer elements
      const elementsToRemove = document.querySelectorAll('script, style, nav, header, footer');
      elementsToRemove.forEach(el => el.remove());
      
      // Try to find the main content area
      const selectors = [
        '.job-description',
        '#job-description', 
        '[data-job-description]',
        'main',
        'article',
        '.content',
        '#content',
        'body'
      ];
      
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element && element.textContent.trim().length > 100) {
          return element.textContent.trim();
        }
      }
      
      // Fallback to body text
      return document.body.textContent.trim();
    });
    
    await browser.close();
    
    // Limit content length
    let limitedContent = content;
    if (limitedContent.length > MAX_CONTENT_LENGTH) {
      limitedContent = limitedContent.substring(0, MAX_CONTENT_LENGTH);
    }
    
    // Clean up whitespace
    limitedContent = limitedContent.replace(/\s+/g, ' ').trim();
    
    return limitedContent;
  } catch (error) {
    if (browser) {
      await browser.close().catch(() => {});
    }
    throw new Error(`Failed to scrape URL: ${error.message}`);
  }
}

module.exports = {
  isURL,
  scrapeURL
};
