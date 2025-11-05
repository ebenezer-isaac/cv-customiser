const axios = require('axios');
const cheerio = require('cheerio');
const validator = require('validator');
const dns = require('dns').promises;
const ipaddr = require('ipaddr.js');

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
 * Helper function to validate IP address is not private/reserved
 * @param {string} ip - IP address to validate
 * @returns {boolean} True if IP is safe to access
 */
function isIPAddressSafe(ip) {
  try {
    const addr = ipaddr.parse(ip);
    
    // Check if it's an IPv4 address
    if (addr.kind() === 'ipv4') {
      // Reject private, loopback, and reserved ranges
      const range = addr.range();
      if (range === 'private' || range === 'loopback' || range === 'broadcast' || 
          range === 'linkLocal' || range === 'reserved') {
        return false;
      }
    }
    
    // Check if it's an IPv6 address
    if (addr.kind() === 'ipv6') {
      // Reject loopback, private, and reserved ranges
      const range = addr.range();
      if (range === 'loopback' || range === 'linkLocal' || range === 'uniqueLocal' || 
          range === 'reserved' || range === 'unspecified') {
        return false;
      }
    }
    
    return true;
  } catch (error) {
    // If IP parsing fails, reject it
    return false;
  }
}

/**
 * Helper function to scrape content from URL
 * @param {string} url - URL to scrape
 * @returns {Promise<string>} Scraped text content
 */
async function scrapeURL(url) {
  const MAX_CONTENT_LENGTH = 50000; // Maximum characters to extract
  
  try {
    // Parse the URL to extract hostname
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Resolve hostname to IP address
    const addresses = await dns.resolve4(hostname).catch(async () => {
      // Try IPv6 if IPv4 fails
      return await dns.resolve6(hostname);
    });
    
    if (!addresses || addresses.length === 0) {
      throw new Error('Unable to resolve hostname');
    }
    
    // Validate that the resolved IP is not private/reserved
    const ip = addresses[0];
    if (!isIPAddressSafe(ip)) {
      throw new Error('Access to private or reserved IP addresses is not allowed');
    }
    
    const response = await axios.get(url, {
      timeout: 10000,
      maxContentLength: 5 * 1024 * 1024, // 5MB max response size
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });
    
    const $ = cheerio.load(response.data);
    
    // Remove script and style elements
    $('script, style, nav, header, footer').remove();
    
    // Try to find the main content area
    let content = '';
    
    // Common selectors for job description content
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
      const element = $(selector);
      if (element.length > 0) {
        content = element.text().trim();
        if (content.length > 100) {
          break;
        }
      }
    }
    
    // If no specific content found, get all text from body
    if (!content || content.length < 100) {
      content = $('body').text().trim();
    }
    
    // Limit content length before processing
    if (content.length > MAX_CONTENT_LENGTH) {
      content = content.substring(0, MAX_CONTENT_LENGTH);
    }
    
    // Clean up whitespace efficiently
    content = content.replace(/\s+/g, ' ').trim();
    
    return content;
  } catch (error) {
    throw new Error(`Failed to scrape URL: ${error.message}`);
  }
}

module.exports = {
  isURL,
  scrapeURL
};
