import axios from 'axios';
import * as cheerio from 'cheerio';
import validator from 'validator';
import { promises as dns } from 'dns';
import * as ipaddr from 'ipaddr.js';

/**
 * Helper function to detect if input is a URL
 */
export function isURL(text: string): boolean {
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
 */
function isIPAddressSafe(ip: string): boolean {
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
 */
export async function scrapeURL(url: string): Promise<string> {
  const MAX_CONTENT_LENGTH = 50000; // Maximum characters to extract
  
  try {
    // Parse the URL to extract hostname
    const urlObj = new URL(url);
    const hostname = urlObj.hostname;
    
    // Resolve hostname to IP addresses (try both IPv4 and IPv6)
    let addresses: string[] = [];
    try {
      addresses = await dns.resolve4(hostname);
    } catch (error) {
      // If IPv4 resolution fails, try IPv6
      try {
        addresses = await dns.resolve6(hostname);
      } catch (ipv6Error) {
        throw new Error('Unable to resolve hostname');
      }
    }
    
    if (!addresses || addresses.length === 0) {
      throw new Error('Unable to resolve hostname');
    }
    
    // Validate that ALL resolved IPs are not private/reserved
    for (const ip of addresses) {
      if (!isIPAddressSafe(ip)) {
        throw new Error('Access to private or reserved IP addresses is not allowed');
      }
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
  } catch (error: any) {
    throw new Error(`Failed to scrape URL: ${error.message}`);
  }
}
