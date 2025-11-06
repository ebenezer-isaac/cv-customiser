const { GoogleGenerativeAI } = require('@google/generative-ai');
const AIFailureError = require('../errors/AIFailureError');
const fs = require('fs');
const path = require('path');

class AIService {
  constructor() {
    if (!process.env.GEMINI_API_KEY) {
      throw new Error('GEMINI_API_KEY environment variable is required');
    }
    this.genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    this.model = this.genAI.getGenerativeModel({ model: 'gemini-2.5-pro' });
    this.maxRetries = 3;
    this.initialRetryDelay = 1000; // 1 second
    
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
   * @returns {Promise<string>} Fixed CV LaTeX content
   */
  async fixCVPageCount({ failedCV, actualPageCount, jobDescription }) {
    const tooLong = actualPageCount > 2;
    const tooShort = actualPageCount < 2;
    
    // Build the appropriate prompt based on page count
    let basePrompt = `System: You are a LaTeX editor. Your previous attempt to edit a CV failed a validation check.

User: Your previous .tex generation was compiled, and the resulting PDF was ${actualPageCount} pages long. This is an error. The output MUST be exactly 2 pages.

Here is the failed LaTeX code you generated:
[failed_cv.tex]
${failedCV}

Here is the original job description, for context:
[job_description.txt]
${jobDescription}

`;

    if (tooLong) {
      basePrompt += `Your Task: The document is TOO LONG (${actualPageCount} pages). You must strategically shorten it to exactly 2 pages.

CRITICAL CONSTRAINTS:
- Do NOT truncate the document. Do not just cut off the end.
- Be More Concise: Strategically shorten text throughout the document. Find long bullet points and make them more concise. Replace verbose phrases (e.g., "was responsible for the management of") with single words ("managed").
- Prioritize: While shortening, preserve the keywords and projects that are most relevant to the [job_description.txt]. Shorten the least relevant parts first.
- Preserve Structure: Do not change the LaTeX formatting, only the text content.
`;
    } else if (tooShort) {
      basePrompt += `Your Task: The document is TOO SHORT (${actualPageCount} pages). You must strategically expand it to exactly 2 pages.

CRITICAL CONSTRAINTS:
- Do NOT add filler content or fluff.
- Strategic Expansion: Add more relevant details to existing bullet points. Expand achievements with quantifiable metrics where possible.
- Enhance with Job-Relevant Content: Review the job description and ensure all relevant skills and experiences from the original CV are fully represented.
- Preserve Structure: Do not change the LaTeX formatting, only enhance the text content with substantive details.
`;
    }

    basePrompt += `
Output: Respond with only the new, revised, and complete LaTeX code. Do not include any markdown formatting or code blocks.`;

    return await this.generateWithRetry(basePrompt);
  }

  /**
   * Generate CV content based on job details and context (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - Existing CV context
   * @param {number} params.retryCount - Current retry count for page limit enforcement
   * @returns {Promise<string>} Generated CV LaTeX content
   */
  async generateCV({ jobDescription, companyInfo, cvContext, retryCount = 0 }) {
    const pageLimitWarning = retryCount > 0 
      ? `\n\nIMPORTANT: Previous attempt resulted in ${retryCount > 1 ? 'still too many' : 'too many'} pages. You MUST make the CV shorter to fit EXACTLY 2 pages. Remove less relevant content, reduce descriptions, and be more concise.`
      : '\n\nIMPORTANT: The CV MUST be EXACTLY 2 pages when compiled. Be concise and selective with content.';

    const prompt = `Generate a professional CV in LaTeX format tailored for the following job application.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Existing CV Context:
${cvContext}

${pageLimitWarning}

Requirements:
- Output ONLY valid LaTeX code (no markdown, no explanations)
- Use a professional CV template with clean formatting
- Tailor the content specifically to the job description
- Highlight relevant skills and experiences
- Keep it to EXACTLY 2 pages when compiled
- Include sections: Contact Info, Summary, Experience, Education, Skills
- Use \\documentclass{article} or similar
- Include necessary packages like geometry, enumitem, etc.

Return only the LaTeX code, starting with \\documentclass and ending with \\end{document}.`;

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
   * Generate cover letter content (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - CV context
   * @returns {Promise<string>} Generated cover letter text
   */
  async generateCoverLetter({ jobDescription, companyInfo, cvContext }) {
    const prompt = `Generate a professional cover letter for the following job application.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Candidate Background (from CV):
${cvContext}

Requirements:
- Write a compelling, personalized cover letter
- Address why the candidate is a great fit for this specific role
- Highlight 2-3 key qualifications that match the job requirements
- Show enthusiasm for the company and role
- Keep it to one page (around 3-4 paragraphs)
- Use professional business letter format
- Include proper salutation and closing

Return the complete cover letter text.`;

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
   * Generate cold email content (legacy method)
   * @param {Object} params - Generation parameters
   * @param {string} params.jobDescription - Job description
   * @param {string} params.companyInfo - Company information
   * @param {string} params.cvContext - CV context
   * @returns {Promise<string>} Generated cold email text
   */
  async generateColdEmail({ jobDescription, companyInfo, cvContext }) {
    const prompt = `Generate a professional cold email for a job application/networking outreach.

Job Description:
${jobDescription}

Company Information:
${companyInfo}

Candidate Background (from CV):
${cvContext}

Requirements:
- Write a concise, engaging cold email (150-200 words)
- Capture attention in the subject line and opening
- Briefly mention 1-2 key qualifications
- Express genuine interest in the company/role
- Include a clear call-to-action
- Professional but personable tone
- Format with Subject line followed by email body

Return the complete email including subject line.`;

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
   * Refine existing content based on feedback (legacy method)
   * @param {Object} params - Refinement parameters
   * @param {string} params.content - Content to refine
   * @param {string} params.feedback - User feedback
   * @param {string} params.contentType - Type of content (cv, cover_letter, email)
   * @returns {Promise<string>} Refined content
   */
  async refineContent({ content, feedback, contentType }) {
    const prompt = `Refine the following ${contentType} based on user feedback.

Current Content:
${content}

User Feedback:
${feedback}

Requirements:
- Apply the user's feedback to improve the content
- Maintain the same format and structure
- Keep professional quality
${contentType === 'cv' ? '- Ensure it remains EXACTLY 2 pages when compiled' : ''}

Return the refined ${contentType}.`;

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
