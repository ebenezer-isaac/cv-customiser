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
    // Create a separate model instance for JSON mode
    this.jsonModel = this.genAI.getGenerativeModel({ 
      model: config.ai.model,
      generationConfig: {
        responseMimeType: "application/json"
      }
    });
    this.maxRetries = config.ai.maxRetries;
    this.initialRetryDelay = config.ai.initialRetryDelay;
    
    // Load prompts from prompts.json
    const promptsPath = path.join(__dirname, '..', 'prompts.json');
    try {
      this.prompts = JSON.parse(fs.readFileSync(promptsPath, 'utf-8'));
    } catch (error) {
      console.error('[DEBUG] Failed to load prompts.json:', error);
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
    console.log('[DEBUG] AI API call initiated');
    console.log(`[DEBUG] Prompt preview (first 200 chars): ${prompt.substring(0, 200)}...`);
    console.log(`[DEBUG] Full prompt length: ${prompt.length} characters`);
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`[DEBUG] Sending request to Gemini API (attempt ${attempt + 1}/${this.maxRetries})...`);
        const result = await this.model.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        
        console.log(`[DEBUG] AI API response received successfully`);
        console.log(`[DEBUG] Response length: ${responseText.length} characters`);
        console.log(`[DEBUG] Response preview (first 300 chars): ${responseText.substring(0, 300)}...`);
        
        return responseText;
      } catch (error) {
        console.log(`[DEBUG] AI API call failed: ${error.message}`);
        const isServiceUnavailable = this.isServiceUnavailableError(error);
        const isLastAttempt = attempt === this.maxRetries - 1;

        if (isServiceUnavailable && !isLastAttempt) {
          // Use fixed initial delay (5 seconds) for retries
          const delaySeconds = Math.ceil(this.initialRetryDelay / 1000);
          console.warn(`Model is overloaded, retrying in ${delaySeconds} seconds... (Attempt ${attempt + 1}/${this.maxRetries})`);
          await this.sleep(this.initialRetryDelay);
          continue;
        } else if (isLastAttempt) {
          // All retries exhausted
          console.error(`[DEBUG] All retry attempts exhausted after ${this.maxRetries} attempts`);
          throw new AIFailureError(
            `AI service failed after ${this.maxRetries} attempts: ${error.message}`,
            error,
            this.maxRetries
          );
        } else {
          // Different error, throw immediately
          console.error(`[DEBUG] Non-retryable error encountered: ${error.message}`);
          throw error;
        }
      }
    }
  }

  /**
   * Core generate function with retry mechanism for JSON responses using native JSON Mode
   * This method uses Google Gemini's native "application/json" response type for reliable JSON parsing
   * @param {string} prompt - The prompt to send to the AI
   * @param {Object} schema - Optional JSON schema to validate response structure
   * @param {number} attemptNumber - Current attempt number (for logging)
   * @returns {Promise<Object>} Parsed JSON object
   * @throws {AIFailureError} If all retries fail
   */
  async generateJsonWithRetry(prompt, schema = null, attemptNumber = 0) {
    console.log('[DEBUG] AI JSON API call initiated');
    console.log(`[DEBUG] Prompt preview (first 200 chars): ${prompt.substring(0, 200)}...`);
    console.log(`[DEBUG] Full prompt length: ${prompt.length} characters`);
    
    for (let attempt = 0; attempt < this.maxRetries; attempt++) {
      try {
        console.log(`[DEBUG] Sending JSON request to Gemini API (attempt ${attempt + 1}/${this.maxRetries})...`);
        const result = await this.jsonModel.generateContent(prompt);
        const response = await result.response;
        const responseText = response.text();
        
        console.log(`[DEBUG] AI JSON API response received successfully`);
        console.log(`[DEBUG] Response length: ${responseText.length} characters`);
        console.log(`[DEBUG] Response preview (first 300 chars): ${responseText.substring(0, 300)}...`);
        
        // Parse the JSON response
        try {
          const jsonData = JSON.parse(responseText);
          console.log(`[DEBUG] JSON parsed successfully`);
          return jsonData;
        } catch (parseError) {
          console.error(`[DEBUG] Failed to parse JSON response:`, parseError);
          console.error(`[DEBUG] Raw response:`, responseText);
          // If JSON parsing fails, treat it as a retryable error
          throw new Error(`Invalid JSON response: ${parseError.message}`);
        }
      } catch (error) {
        console.log(`[DEBUG] AI JSON API call failed: ${error.message}`);
        const isServiceUnavailable = this.isServiceUnavailableError(error);
        const isLastAttempt = attempt === this.maxRetries - 1;

        if ((isServiceUnavailable || error.message.includes('Invalid JSON')) && !isLastAttempt) {
          // Use fixed initial delay (5 seconds) for retries
          const delaySeconds = Math.ceil(this.initialRetryDelay / 1000);
          console.warn(`Model error, retrying in ${delaySeconds} seconds... (Attempt ${attempt + 1}/${this.maxRetries})`);
          await this.sleep(this.initialRetryDelay);
          continue;
        } else if (isLastAttempt) {
          // All retries exhausted
          console.error(`[DEBUG] All retry attempts exhausted after ${this.maxRetries} attempts`);
          throw new AIFailureError(
            `AI JSON service failed after ${this.maxRetries} attempts: ${error.message}`,
            error,
            this.maxRetries
          );
        } else {
          // Different error, throw immediately
          console.error(`[DEBUG] Non-retryable error encountered: ${error.message}`);
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
   * Uses native JSON Mode for reliable parsing
   * @param {string} jobDescription - Job description text
   * @returns {Promise<Object>} Object with companyName and jobTitle
   */
  async extractJobDetails(jobDescription) {
    const prompt = this.getPrompt('extractJobDetails', { jobDescription });
    
    try {
      const jsonData = await this.generateJsonWithRetry(prompt);
      return jsonData;
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to extract job details:', error);
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
   * Uses native JSON Mode for reliable parsing
   * @param {string} companyName - Name of the company to research
   * @returns {Promise<Object>} Object with description and contactEmail
   */
  async generateCompanyProfile(companyName) {
    const prompt = this.getPrompt('generateCompanyProfile', { companyName });
    
    try {
      const jsonData = await this.generateJsonWithRetry(prompt);
      return jsonData;
    } catch (error) {
      // Fallback if parsing fails
      console.error('Failed to parse company profile:', error);
      return {
        description: 'Unable to generate company profile.',
        contactEmail: null
      };
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

  /**
   * Parse cold outreach input to extract structured information
   * Uses native JSON Mode for reliable parsing
   * @param {string} userInput - Raw user input for cold outreach
   * @returns {Promise<Object>} Object with companyName, targetPerson, and roleContext
   */
  async parseColdOutreachInput(userInput) {
    console.log('[DEBUG] Parsing cold outreach input...');
    console.log(`[DEBUG] Raw user input: "${userInput}"`);
    
    const prompt = this.getPrompt('parseColdOutreachInput', { userInput });
    
    try {
      const parsed = await this.generateJsonWithRetry(prompt);
      console.log(`[DEBUG] Parsed input successfully: Company="${parsed.companyName}", Person="${parsed.targetPerson}", Role="${parsed.roleContext}"`);
      return parsed;
    } catch (error) {
      // Fallback if parsing fails - treat entire input as company name
      console.error('[DEBUG] Failed to parse cold outreach input, using fallback:', error);
      return {
        companyName: userInput,
        targetPerson: null,
        roleContext: null
      };
    }
  }

  /**
   * Process job URL using AI to fetch and parse content into structured jobData
   * This method uses AI's web browsing capability to access the URL directly,
   * bypassing traditional scraping which can fail with 403 errors.
   * 
   * @param {string} url - Job posting URL to process
   * @returns {Promise<Object>} Structured job data object containing:
   *   - jobDescription: Full job description text
   *   - companyName: Company name
   *   - jobTitle: Job title
   *   - location: Job location
   *   - jobSummary: Brief summary of the role
   *   - keyQualifications: Array of key qualifications
   *   - educationExperience: Required education and experience
   * @throws {Error} If AI service fails to process the URL
   */
  async processJobURL(url) {
    console.log('[DEBUG] AIService: Starting AI-powered URL processing');
    console.log(`[DEBUG] AIService: Target URL: ${url}`);
    console.log('[DEBUG] AIService: Using AI to fetch and parse job posting content');
    
    const prompt = this.getPrompt('processJobURL', { url });
    
    try {
      const jobData = await this.generateJsonWithRetry(prompt);
      console.log('[DEBUG] AIService: Job data parsed successfully from URL');
      console.log(`[DEBUG] AIService:   - Company: ${jobData.companyName}`);
      console.log(`[DEBUG] AIService:   - Job Title: ${jobData.jobTitle}`);
      console.log(`[DEBUG] AIService:   - Location: ${jobData.location || 'Not specified'}`);
      console.log(`[DEBUG] AIService:   - Key Qualifications: ${jobData.keyQualifications?.length || 0} items`);
      console.log(`[DEBUG] AIService:   - Job Description Length: ${jobData.jobDescription?.length || 0} characters`);
      return jobData;
    } catch (error) {
      // Fallback if parsing fails
      console.error('[DEBUG] AIService: Failed to parse job data from URL:', error);
      throw new Error(`Failed to parse job data from URL: ${error.message}`);
    }
  }

  /**
   * Process pasted job text using AI to parse into structured jobData
   * This method takes raw job description text and structures it into a consistent format.
   * 
   * @param {string} jobText - Raw job description text
   * @returns {Promise<Object>} Structured job data object containing:
   *   - jobDescription: Full job description text
   *   - companyName: Company name
   *   - jobTitle: Job title
   *   - location: Job location
   *   - jobSummary: Brief summary of the role
   *   - keyQualifications: Array of key qualifications
   *   - educationExperience: Required education and experience
   * @throws {Error} If AI service fails to process the text
   */
  async processJobText(jobText) {
    console.log('[DEBUG] AIService: Starting AI-powered text processing');
    console.log(`[DEBUG] AIService: Input text length: ${jobText.length} characters`);
    console.log('[DEBUG] AIService: Parsing raw job description into structured format');
    
    const prompt = this.getPrompt('processJobText', { jobText });
    
    try {
      const jobData = await this.generateJsonWithRetry(prompt);
      console.log('[DEBUG] AIService: Job data parsed successfully from text');
      console.log(`[DEBUG] AIService:   - Company: ${jobData.companyName}`);
      console.log(`[DEBUG] AIService:   - Job Title: ${jobData.jobTitle}`);
      console.log(`[DEBUG] AIService:   - Location: ${jobData.location || 'Not specified'}`);
      console.log(`[DEBUG] AIService:   - Key Qualifications: ${jobData.keyQualifications?.length || 0} items`);
      console.log(`[DEBUG] AIService:   - Job Description Length: ${jobData.jobDescription?.length || 0} characters`);
      return jobData;
    } catch (error) {
      // Fallback if parsing fails
      console.error('[DEBUG] AIService: Failed to parse job data from text:', error);
      throw new Error(`Failed to parse job data from text: ${error.message}`);
    }
  }

  /**
   * Research company and identify decision-makers using AI web search
   * This method uses the AI's web search capability to conduct strategic reconnaissance
   * on a target company, following the guidelines in recon_strat.txt
   * 
   * @param {Object} params - Research parameters
   * @param {string} params.companyName - Target company name
   * @param {string} params.originalCV - Candidate's CV for context on role targeting
   * @param {string} params.reconStrategy - Reconnaissance strategy guidelines from recon_strat.txt
   * @param {string} [params.roleContext=null] - Optional role context from user input (e.g., "software engineering")
   * @returns {Promise<Object>} Research results object containing:
   *   - companyProfile: {description, industry, size, recentNews, technologies, genericEmail}
   *   - decisionMakers: Array of {name, title, recentActivity, relevance}
   *   - strategicInsights: {painPoints, opportunities, openRoles}
   * @throws {Error} If AI service fails or returns invalid data after retries
   */
  async researchCompanyAndIdentifyPeople({ companyName, originalCV, reconStrategy, roleContext = null }) {
    console.log('[DEBUG] Starting AI-powered company research...');
    console.log(`[DEBUG] Target company: ${companyName}`);
    console.log(`[DEBUG] Role context: ${roleContext || 'None'}`);
    console.log(`[DEBUG] Using recon strategy (${reconStrategy.length} chars)`);
    
    const roleContextText = roleContext ? `\nRole Context: ${roleContext}` : '';
    
    const prompt = this.getPrompt('researchCompanyAndIdentifyPeople', {
      companyName,
      originalCV,
      reconStrategy,
      roleContext: roleContextText
    });
    
    try {
      const research = await this.generateJsonWithRetry(prompt);
      console.log('[DEBUG] Research results parsed successfully:');
      console.log(`[DEBUG]   - Company: ${research.company_intelligence?.description?.substring(0, 100)}...`);
      console.log(`[DEBUG]   - Decision makers found: ${research.decision_makers?.length || 0}`);
      if (research.decision_makers && research.decision_makers.length > 0) {
        research.decision_makers.forEach((dm, i) => {
          console.log(`[DEBUG]     ${i + 1}. ${dm.name} - ${dm.title}`);
        });
      }
      console.log(`[DEBUG]   - Pain points identified: ${research.strategicInsights?.painPoints?.length || 0}`);
      console.log(`[DEBUG]   - Generic email: ${research.company_intelligence?.genericEmail || 'Not found'}`);
      return research;
    } catch (error) {
      // Fallback if parsing fails
      console.error('[DEBUG] Failed to parse research results:', error);
      return {
        company_intelligence: {
          description: 'Unable to research company.',
          industry: 'Unknown',
          size: 'Unknown',
          recentNews: 'Unable to fetch',
          technologies: [],
          genericEmail: null
        },
        decision_makers: [],
        strategicInsights: {
          painPoints: [],
          opportunities: [],
          openRoles: []
        }
      };
    }
  }
}

module.exports = AIService;
