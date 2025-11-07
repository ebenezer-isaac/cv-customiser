const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIFailureError = require('../errors/AIFailureError');
const config = require('../config');
const fs = require('fs');
const path = require('path');

// Model type constants
const MODEL_TYPES = {
  PRO: 'pro',
  FLASH: 'flash'
};

class AIService {
  constructor() {
    if (!config.apiKeys.gemini) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(config.apiKeys.gemini);
    
    // Initialize dual models for different use cases
    console.log('[DEBUG] AIService: Initializing Pro model for complex generation tasks');
    this.proModel = this.genAI.getGenerativeModel({ model: config.ai.proModel });
    console.log('[DEBUG] AIService: Initializing Flash model for simple parsing and intelligence gathering');
    this.flashModel = this.genAI.getGenerativeModel({ model: config.ai.flashModel });
    
    // Legacy model reference (points to Pro model)
    this.model = this.proModel;

    this.maxRetries = config.ai.maxRetries;
    this.initialRetryDelay = config.ai.initialRetryDelay;
    
    const promptsPath = path.join(__dirname, '..', 'prompts.json');
    try {
      this.prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
    } catch (error) {
      console.error('[DEBUG] Failed to load prompts.json:', error);
      throw new Error(`Failed to load prompts.json: ${error.message}. Please ensure src/prompts.json exists and is valid JSON.`);
    }
  }

  getPrompt(promptKey, data = {}) {
    const template = this.prompts[promptKey];
    if (!template) {
      throw new Error(`Prompt key "${promptKey}" not found in prompts.json.`);
    }
    let prompt = template;
    for (const [key, value] of Object.entries(data)) {
      prompt = prompt.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), value || '');
    }
    return prompt;
  }

  async sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isRetryableError(error) {
    const errorMessage = (error.message || '').toLowerCase();
    return errorMessage.includes('503') || (errorMessage.includes('400') && errorMessage.includes('model is overloaded'));
  }
  
  /**
   * Generates JSON with a cleaning step to remove markdown.
   * @param {string} prompt - The prompt to send to the AI
   * @param {string} modelType - 'pro' or 'flash' (default: 'pro')
   */
  async generateJsonWithRetry(prompt, modelType = 'pro') {
    const model = modelType === 'flash' ? this.flashModel : this.proModel;
    const generationConfig = {
      response_mime_type: 'application/json',
    };

    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`[DEBUG] SENDING JSON REQUEST to ${modelType.toUpperCase()} model (Attempt ${attempt + 1}/${this.maxRetries})`);
        
        const result = await model.generateContent(prompt, generationConfig);
        const response = await result.response;
        let text = response.text();
        console.log(`[DEBUG] Gemini ${modelType.toUpperCase()} JSON response received successfully.`);

        // FIX: Clean the text to remove markdown fences before parsing.
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          text = jsonMatch[0];
        }

        return JSON.parse(text);

      } catch (error) {
        console.error(`[DEBUG] AI JSON API call to ${modelType.toUpperCase()} FAILED on attempt ${attempt + 1}: ${error.message}`);
        const isJsonError = error instanceof SyntaxError;

        // Do not retry on a syntax error, as the response is already received and malformed.
        if (isJsonError) {
          throw new AIFailureError(`AI JSON service failed: ${error.message}`, error, attempt + 1);
        }

        if (this.isRetryableError(error) && attempt < this.maxRetries - 1) {
          const delay = this.initialRetryDelay;
          console.warn(`[DEBUG] Retryable error. Retrying in ${delay / 1000}s...`);
          await this.sleep(delay);
        } else {
          console.error('[DEBUG] Non-retryable error or final attempt failed.');
          throw new AIFailureError(`AI JSON service failed: ${error.message}`, error, attempt + 1);
        }
      }
    }
  }

  async generateWithRetry(prompt, modelType = 'pro') {
    const model = modelType === 'flash' ? this.flashModel : this.proModel;
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`[DEBUG] Sending TEXT request to ${modelType.toUpperCase()} model (Attempt ${attempt + 1}/${this.maxRetries})...`);
        
        const result = await model.generateContent(prompt);
        
        const response = await result.response;
        return response.text();
      } catch (error) {
        console.error(`[DEBUG] AI TEXT API call to ${modelType.toUpperCase()} FAILED on attempt ${attempt + 1}: ${error.message}`);
        if (this.isRetryableError(error) && attempt < this.maxRetries - 1) {
          const delay = this.initialRetryDelay;
          console.warn(`[DEBUG] Retryable error. Retrying in ${delay / 1000}s...`);
          await this.sleep(delay);
        } else {
          console.error('[DEBUG] Non-retryable error or final attempt failed.');
          throw new AIFailureError(`AI TEXT service failed: ${error.message}`, error, attempt + 1);
        }
      }
    }
  }
  
    /**
   * Extract job description content from raw HTML/scraped text
   * Uses Flash model for fast, cost-effective text cleaning
   * @param {string} rawContent - Raw HTML or scraped content
   * @returns {Promise<string>} Cleaned job description
   */
  async extractJobDescriptionContent(rawContent) {
    const truncatedContent = rawContent.substring(0, 10000) + (rawContent.length > 10000 ? ' ...(truncated)' : '');
    const prompt = this.getPrompt('extractJobDescription', { rawContent: truncatedContent });
    return await this.generateWithRetry(prompt, MODEL_TYPES.FLASH);
  }

  /**
   * Extract company name and job title using JSON mode.
   * Uses Flash model for fast, cost-effective parsing
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Object>} Object with companyName and jobTitle
   */
  async extractJobDetails(jobDescription) {
    const prompt = this.getPrompt('extractJobDetails', { jobDescription });
    try {
        return await this.generateJsonWithRetry(prompt, MODEL_TYPES.FLASH);
    } catch (error) {
        console.error('Failed to parse job details with JSON mode:', error);
        return { companyName: 'Unknown Company', jobTitle: 'Position' };
    }
  }

  /**
   * Extract email addresses from job description
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Array<string>>} Array of email addresses found
   */
  async extractEmailAddresses(jobDescription) {
    const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    return [...new Set(jobDescription.match(emailRegex) || [])];
  }

  /**
   * Generate CV content using sophisticated prompting strategy
   * @param {Object} params - Generation parameters
   * @returns {Promise<string>} Generated CV LaTeX content
   */
  async generateCVAdvanced({ jobDescription, originalCV, extensiveCV, cvStrategy, companyName, jobTitle }) {
    const prompt = this.getPrompt('generateCVAdvanced', { jobDescription, originalCV, extensiveCV, cvStrategy, companyName, jobTitle });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Fix CV page count issues
   * @param {Object} params - Fix parameters
   * @returns {Promise<string>} Fixed CV LaTeX content
   */
  async fixCVPageCount({ failedCV, actualPageCount, jobDescription, extensiveCV, targetPageCount = 2 }) {
    const tooLong = actualPageCount > targetPageCount;
    const tooShort = actualPageCount < targetPageCount;
    
    let promptKey;
    if (tooLong) promptKey = 'fixCVTooLong';
    else if (tooShort) promptKey = 'fixCVTooShort';
    else return failedCV;
    
    const prompt = this.getPrompt(promptKey, { failedCV, actualPageCount, targetPageCount, jobDescription, extensiveCV });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cover letter content with advanced prompting
   * @param {Object} params - Generation parameters
   * @returns {Promise<string>} Generated cover letter text
   */
  async generateCoverLetterAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coverLetterStrategy }) {
    const currentDate = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
    const prompt = this.getPrompt('generateCoverLetterAdvanced', { jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coverLetterStrategy, currentDate });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate cold email content with advanced prompting
   * @param {Object} params - Generation parameters
   * @returns {Promise<string>} Generated cold email text
   */
  async generateColdEmailAdvanced({ jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generateColdEmailAdvanced', { jobDescription, companyName, jobTitle, validatedCVText, extensiveCV, coldEmailStrategy });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Refine existing content based on feedback
   * @param {Object} params - Refinement parameters
   * @returns {Promise<string>} Refined content
   */
  async refineContentAdvanced({ content, feedback, chatHistory = [] }) {
    const chatHistoryText = chatHistory.length > 0 ? JSON.stringify(chatHistory.slice(-5), null, 2) : 'No previous chat history';
    const prompt = this.getPrompt('refineContentAdvanced', { chatHistoryText, content, feedback });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate AI-powered CV change summary
   * Uses Flash model for fast diff comparison
   * @param {Object} params - Parameters
   * @returns {Promise<string>} Bullet-pointed summary of changes
   */
  async generateCVChangeSummary({ originalCV, newCV }) {
    const prompt = this.getPrompt('generateCVChangeSummary', { originalCV, newCV });
    return await this.generateWithRetry(prompt, MODEL_TYPES.FLASH);
  }

  /**
   * Generate company profile for cold outreach using JSON mode.
   * @param {string} companyName - Name of the company to research
   * @returns {Promise<Object>} Object with description and contactEmail
   */
  async generateCompanyProfile(companyName) {
    const prompt = this.getPrompt('generateCompanyProfile', { companyName });
    try {
        return await this.generateJsonWithRetry(prompt);
    } catch (error) {
        console.error('Failed to parse company profile with JSON mode:', error);
        return { description: 'Unable to generate company profile.', contactEmail: null };
    }
  }

  /**
   * Generate personalized cold email for a specific contact
   * @param {Object} params - Generation parameters
   * @returns {Promise<string>} Generated personalized cold email text
   */
  async generatePersonalizedColdEmail({ companyName, companyProfile, contact, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generatePersonalizedColdEmail', { companyName, companyProfile, contactName: contact.name, contactTitle: contact.title, contactEmail: contact.email, validatedCVText, extensiveCV, coldEmailStrategy });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Generate generic cold email (no specific contact)
   * @param {Object} params - Generation parameters
   * @returns {Promise<string>} Generated generic cold email text
   */
  async generateGenericColdEmail({ companyName, companyProfile, genericEmail, validatedCVText, extensiveCV, coldEmailStrategy }) {
    const prompt = this.getPrompt('generateGenericColdEmail', { companyName, companyProfile, genericEmail, validatedCVText, extensiveCV, coldEmailStrategy });
    return await this.generateWithRetry(prompt);
  }

  /**
   * Parse cold outreach input to extract structured information using JSON mode.
   * Uses Flash model for fast, cost-effective parsing
   * @param {string} userInput - Raw user input for cold outreach
   * @returns {Promise<Object>} Object with companyName, targetPerson, and roleContext
   */
  async parseColdOutreachInput(userInput) {
    const prompt = this.getPrompt('parseColdOutreachInput', { userInput });
    try {
        const result = await this.generateJsonWithRetry(prompt, MODEL_TYPES.FLASH);
        console.log(`[DEBUG] Parsed input successfully: Company="${result.companyName}", Person="${result.targetPerson}", Role="${result.roleContext}"`);
        return result;
    } catch (error) {
        console.error('[DEBUG] Failed to parse cold outreach input, using fallback:', error);
        return { companyName: userInput, targetPerson: null, roleContext: null };
    }
  }

  /**
   * Process job URL using AI to parse content into structured jobData using JSON mode.
   * Uses Flash model for fast, cost-effective parsing
   * @param {string} url - Job posting URL to process
   * @returns {Promise<Object>} Structured job data object
   * @throws {Error} If AI service fails to process the URL
   */
  async processJobURL(url) {
    const prompt = this.getPrompt('processJobURL', { url });
    try {
        const jobData = await this.generateJsonWithRetry(prompt, MODEL_TYPES.FLASH);
        console.log('[DEBUG] AIService: Job data parsed successfully from URL via JSON mode.');
        return jobData;
    } catch (error) {
        console.error('[DEBUG] AIService: Failed to parse job data from URL with JSON mode:', error.message);
        throw new Error(`Failed to parse job data from URL: ${error.message}`);
    }
  }

  /**
   * Process pasted job text using AI to parse into structured jobData using JSON mode.
   * Uses Flash model for fast, cost-effective parsing
   * @param {string} jobText - Raw job description text
   * @returns {Promise<Object>} Structured job data object
   * @throws {Error} If AI service fails to process the text
   */
  async processJobText(jobText) {
    const prompt = this.getPrompt('processJobText', { jobText });
    try {
        const jobData = await this.generateJsonWithRetry(prompt, MODEL_TYPES.FLASH);
        console.log('[DEBUG] AIService: Job data parsed successfully from text via JSON mode.');
        return jobData;
    } catch (error) {
        console.error('[DEBUG] AIService: Failed to parse job data from text with JSON mode:', error);
        throw new Error(`Failed to parse job data from text: ${error.message}`);
    }
  }

  /**
   * Research company and identify decision-makers using AI web search and JSON mode.
   * @param {Object} params - Research parameters
   * @returns {Promise<Object>} Research results object
   */
  async researchCompanyAndIdentifyPeople({ companyName, originalCV, reconStrategy, roleContext = null }) {
    const roleContextText = roleContext ? `\nRole Context: ${roleContext}` : '';
    const prompt = this.getPrompt('researchCompanyAndIdentifyPeople', { companyName, originalCV, reconStrategy, roleContext: roleContextText });
    
    try {
        const research = await this.generateJsonWithRetry(prompt);
        console.log('[DEBUG] Research results parsed successfully via JSON mode.');
        return research;
    } catch (error) {
        console.error('[DEBUG] Failed to parse research results with JSON mode:', error);
        return {
            company_intelligence: { description: 'Unable to research company.', industry: 'Unknown', size: 'Unknown', recentNews: 'Unable to fetch', technologies: [], genericEmail: null },
            decision_makers: [],
            strategic_insights: { painPoints: [], opportunities: [], openRoles: [] }
        };
    }
  }

  /**
   * Get intelligence on likely job titles for a target person at a company
   * Uses Flash model for fast, cost-effective parsing
   * @param {string} personName - Name of the target person
   * @param {string} companyName - Name of the company
   * @returns {Promise<Array<string>>} Array of likely job titles
   */
  async getIntelligence(personName, companyName) {
    console.log(`[DEBUG] AIService.getIntelligence: Gathering intelligence for ${personName} at ${companyName}`);
    const prompt = this.getPrompt('getIntelligence', { personName, companyName });
    
    try {
        console.log(`[DEBUG] AIService.getIntelligence: Using ${MODEL_TYPES.FLASH.toUpperCase()} model for fast intelligence gathering`);
        const result = await this.generateJsonWithRetry(prompt, MODEL_TYPES.FLASH);
        console.log(`[DEBUG] AIService.getIntelligence: Found ${result.jobTitles.length} likely job titles`);
        return result.jobTitles || [];
    } catch (error) {
        console.error('[DEBUG] AIService.getIntelligence: Failed to get intelligence:', error);
        // Fallback to common executive titles
        console.log('[DEBUG] AIService.getIntelligence: Using fallback job titles');
        return ['CEO', 'CTO', 'VP of Engineering', 'Head of Engineering', 'Engineering Manager'];
    }
  }
}
module.exports = AIService;