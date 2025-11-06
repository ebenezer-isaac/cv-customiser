const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIFailureError = require('../errors/AIFailureError');
const config = require('../config');
const fs = require('fs');
const path = require('path');

class AIService {
  constructor() {
    if (!config.apiKeys.gemini) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(config.apiKeys.gemini);
    this.model = this.genAI.getGenerativeModel({ model: config.ai.model });
    this.maxRetries = config.ai.maxRetries;
    this.initialRetryDelay = config.ai.initialRetryDelay;
    
    // Load prompts from prompts.json
    const promptsPath = path.join(__dirname, '..', 'prompts.json');
    try {
      this.prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
    } catch (error) {
      throw new Error(`Failed to load prompts.json: ${error.message}. Please ensure src/prompts.json exists and is valid JSON.`);
    }
  }

  /**
   * Get a prompt template and inject data
   * @param {string} promptKey - Key of the prompt in prompts.json
   * @param {Object} data - Data to inject into the template
   * @returns {string} The prompt with data injected
   */
  getPrompt(promptKey, data = {}) {
    const template = this.prompts[promptKey];
    if (!template) {
      const availableKeys = Object.keys(this.prompts).join(', ');
      throw new Error(
        `Prompt key "${promptKey}" not found in prompts.json. ` +
        `Available keys: ${availableKeys}`
      );
    }
    
    // Replace {{placeholder}} with actual data
    let prompt = template;
    for (const [key, value] of Object.entries(data)) {
      const placeholder = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      prompt = prompt.replace(placeholder, value || '');
    }
    
    return prompt;
  }

  /**
   * Sleep for a given number of milliseconds
   * @param {number} ms - Milliseconds to sleep
   * @returns {Promise<void>}
   */
  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Check if an error is a 503 Service Unavailable error
   * @param {Error} error - Error to check
   * @returns {boolean} True if error is a 503 error
   */
  isServiceUnavailableError(error) {
    return (
      error.message?.includes('503') || 
      error.status === 503 ||
      error.code === 503 ||
      error.statusCode === 503
    );
  }

  /**
   * Core generate function with retry mechanism for 503 errors
   * @param {string} prompt - The prompt to send to the AI
   * @param {number} attemptNumber - Current attempt number (for logging)
   * @returns {Promise<string>} Generated content
   * @throws {AIFailureError} If all retries fail
   */
  async generateWithRetry(prompt, attemptNumber = 0) {
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        return response.text();
      } catch (error) {
        const isServiceUnavailable = this.isServiceUnavailableError(error);
        const isLastAttempt = attempt === this.maxRetries - 1;

        if (isServiceUnavailable && !isLastAttempt) {
          // Calculate exponential backoff delay
          const delay = this.initialRetryDelay * Math.pow(2, attempt);
          console.warn(`AI Service unavailable (503), retrying in ${delay}ms... (Attempt ${attempt + 1}/${this.maxRetries})`);
          await this.sleep(delay);
          continue;
        } else if (isLastAttempt) {
          // All retries exhausted
          throw new AIFailureError(
            `AI service failed after ${this.maxRetries} attempts: ${error.message}`,
            error,
            this.maxRetries
          );
        } else {
          // Different error, throw immediately
          throw error;
        }
      }
    }
  }

  /**
   * Extract job description content from raw HTML/scraped text
   * Intelligently extracts the actual job description from potentially noisy HTML content
   * @param {string} rawContent - Raw HTML or scraped content
   * @returns {Promise<string>} Cleaned job description
   */
  async extractJobDescriptionContent(rawContent) {
    const truncatedContent = rawContent.substring(0, 10000) + (rawContent.length > 10000 ? ' ...(truncated)' : '');
    const prompt = this.getPrompt('extractJobDescription', { rawContent: truncatedContent });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Extract company name and job title from job description
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Object>} Object with companyName and jobTitle
   */
  async extractJobDetails(jobDescription) {
    const prompt = this.getPrompt('extractJobDetails', { jobDescription });
    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to parse job details:', error);
      return {
        companyName: 'Unknown Company',
        jobTitle: 'Position'
      };
    }
  }

  /**
   * Extract email addresses from job description
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Array<string>>} Array of email addresses found
   */
  async extractEmailAddresses(jobDescription) {
    // Use regex to find email addresses
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emails = jobDescription.match(emailRegex) || [];
    
    // Remove duplicates and return
    return [...new Set(emails)];
  }

  /**
   * Generate CV content using sophisticated prompting strategy
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.originalCV - Content of original_cv.tex
   * @param {string} params.extensiveCV - Content of extensive_cv.doc
   * @param {string} params.cvStrategy - Content of cv_strat.pdf
   * @param {string} params.companyName - Extracted company name
   * @param {string} params.jobTitle - Extracted job title
   * @param {number} params.retryCount - Current retry count for page limit enforcement
   * @returns {Promise<string>} Generated CV LaTeX content
   */
  async generateCVAdvanced({ jobDescription, originalCV, extensiveCV, cvStrategy, companyName, jobTitle, retryCount = 0 }) {
    const prompt = this.getPrompt('generateCVAdvanced', {
      jobDescription,
      originalCV,
      extensiveCV,
      cvStrategy,
      companyName,
      jobTitle
    });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Fix CV page count issues
   * Handles both too-long and too-short documents with different strategies
   * @param {Object} params - Fix parameters
   * @param {string} params.failedCV - The LaTeX code that produced wrong page count
   * @param {number} params.actualPageCount - The actual page count
   * @param {string} params.jobDescription - Job description for context
   * @param {number} params.targetPageCount - Target page count (default: 2)
   * @returns {Promise<string>} Fixed CV LaTeX content
   */
  async fixCVPageCount({ failedCV, actualPageCount, jobDescription, targetPageCount = 2 }) {
    const tooLong = actualPageCount > targetPageCount;
    const tooShort = actualPageCount < targetPageCount;
    
    // Use the appropriate prompt based on page count
    let promptKey;
    if (tooLong) {
      promptKey = 'fixCVTooLong';
    } else if (tooShort) {
      promptKey = 'fixCVTooShort';
    } else {
      // Page count is correct, this shouldn't happen
      return failedCV;
    }
    
    const prompt = this.getPrompt(promptKey, {
      failedCV,
      actualPageCount,
      targetPageCount,
      jobDescription
    });

    return await this.generateWithRetry(prompt);
  }



  /**
   * Generate cover letter content with advanced prompting
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyName - Company name
   * @param {string} params.jobTitle - Job title
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coverLetterStrategy - Cover letter strategy content
   * @returns {Promise<string>} Generated cover letter text
   */
  async generateCoverLetterAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coverLetterStrategy }) {
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    
    const prompt = this.getPrompt('generateCoverLetterAdvanced', {
      jobDescription,
      companyName,
      jobTitle,
      validatedCVText,
      extensiveCV,
      coverLetterStrategy,
      currentDate
    });
    return await this.generateWithRetry(prompt);
  }



  /**
   * Generate cold email content with advanced prompting
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyName - Company name
   * @param {string} params.jobTitle - Job title
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated cold email text
   */
  async generateColdEmailAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generateColdEmailAdvanced', {
      jobDescription,
      companyName,
      jobTitle,
      validatedCVText,
      extensiveCV,
      coldEmailStrategy
    });
    return await this.generateWithRetry(prompt);
  }



  /**
   * Refine existing content based on feedback with chat history
   * @param {Object} params - Refinement parameters
   * @param {string} params.content - Content to refine
   * @param {string} params.feedback - User feedback
   * @param {string} params.contentType - Type of content (cv, cover_letter, email)
   * @param {Array} params.chatHistory - Previous chat messages
   * @returns {Promise<string>} Refined content
   */
  async refineContentAdvanced({ content, feedback, contentType, chatHistory = [] }) {
    const chatHistoryText = chatHistory.length > 0 
      ? JSON.stringify(chatHistory.slice(-5), null, 2)
      : 'No previous chat history';

    const prompt = this.getPrompt('refineContentAdvanced', {
      chatHistoryText,
      content,
      feedback
    });
    return await this.generateWithRetry(prompt);
  }



  /**
   * Generate AI-powered CV change summary
   * @param {Object} params - Parameters
   * @param {string} params.originalCV - Original CV .tex content
   * @param {string} params.newCV - New CV .tex content
   * @returns {Promise<string>} Bullet-pointed summary of changes
   */
  async generateCVChangeSummary({ originalCV, newCV }) {
    const prompt = this.getPrompt('generateCVChangeSummary', {
      originalCV,
      newCV
    });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate company profile for cold outreach
   * @param {string} companyName - Name of the company to research
   * @returns {Promise<Object>} Object with description and contactEmail
   */
  async generateCompanyProfile(companyName) {
    const prompt = this.getPrompt('generateCompanyProfile', { companyName });
    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON from the response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to parse company profile:', error);
      return {
        description: text || 'Unable to generate company profile.',
        contactEmail: null
      };
    }
  }

  /**
   * Find target personas/job titles for cold outreach
   * @param {Object} params - Parameters
   * @param {string} params.originalCV - Content of the candidate's CV
   * @param {string} params.companyName - Target company name
   * @returns {Promise<Array<string>>} Array of target job titles
   */
  async findTargetPersonas({ originalCV, companyName }) {
    const prompt = this.getPrompt('findTargetPersonas', { originalCV, companyName });
    const text = (await this.generateWithRetry(prompt)).trim();
    
    try {
      // Try to extract JSON array from the response
      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      return JSON.parse(text);
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to parse target personas:', error);
      return ['Software Engineer', 'Senior Developer', 'Technical Lead'];
    }
  }

  /**
   * Generate personalized cold email for a specific contact
   * @param {Object} params - Generation parameters
   * @param {string} params.companyName - Company name
   * @param {string} params.companyProfile - Company profile description
   * @param {Object} params.contact - Contact information (name, title, email)
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated personalized cold email text
   */
  async generatePersonalizedColdEmail({ companyName, companyProfile, contact, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generatePersonalizedColdEmail', {
      companyName,
      companyProfile,
      contactName: contact.name,
      contactTitle: contact.title,
      contactEmail: contact.email,
      validatedCVText,
      extensiveCV,
      coldEmailStrategy
    });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate generic cold email (no specific contact)
   * @param {Object} params - Generation parameters
   * @param {string} params.companyName - Company name
   * @param {string} params.companyProfile - Company profile description
   * @param {string} params.genericEmail - Generic company email
   * @param {string} params.validatedCVText - Text from validated CV PDF
   * @param {string} params.extensiveCV - Content of extensive_cv for additional context
   * @param {string} params.coldEmailStrategy - Cold email strategy content
   * @returns {Promise<string>} Generated generic cold email text
   */
  async generateGenericColdEmail({ companyName, companyProfile, genericEmail, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generateGenericColdEmail', {
      companyName,
      companyProfile,
      genericEmail,
      validatedCVText,
      extensiveCV,
      coldEmailStrategy
    });
    return await this.generateWithRetry(prompt);
  }
}

module.exports = AIService;
