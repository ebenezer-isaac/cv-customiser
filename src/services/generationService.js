const { loadSourceFiles } = require('../utils/fileHelpers');
const { isURL, scrapeURL } = require('../utils/urlUtils');

// Constants
const CHAT_MESSAGE_PREVIEW_LENGTH = 500; // Characters to show in chat message preview

/**
 * Generation Service
 * Orchestrates the document generation workflow, containing the core business logic
 */
class GenerationService {
  constructor(services) {
    this.aiService = services.aiService;
    this.fileService = services.fileService;
    this.documentService = services.documentService;
    this.sessionService = services.sessionService;
    this.apolloService = services.apolloService;
    this.disambiguationService = services.disambiguationService;
  }

  /**
   * Process input and determine if it's a URL or text
   * @param {string} input - User input
   * @param {Function} logCallback - Optional logging callback
   * @returns {Promise<Object>} Object with jobDescription, isURLInput
   */
  async processInput(input, logCallback = null) {
    console.log('[DEBUG] Processing input in GenerationService');
    console.log(`[DEBUG] Input length: ${input.length} characters`);
    console.log(`[DEBUG] Input preview: ${input.substring(0, 100)}...`);
    
    let jobDescription;
    let isURLInput = false;

    if (isURL(input)) {
      isURLInput = true;
      console.log('[DEBUG] Input detected as URL');
      logCallback && logCallback('Input detected as URL, scraping content...', 'info');
      
      const scrapedContent = await scrapeURL(input);
      console.log(`[DEBUG] Scraped ${scrapedContent.length} characters from URL`);
      logCallback && logCallback(`Scraped ${scrapedContent.length} characters from URL`, 'success');
      
      // Use AI to extract clean job description from scraped HTML
      logCallback && logCallback('Extracting job description from scraped content...', 'info');
      jobDescription = await this.aiService.extractJobDescriptionContent(scrapedContent);
      console.log(`[DEBUG] Extracted job description: ${jobDescription.length} characters`);
      logCallback && logCallback('Job description extracted successfully', 'success');
    } else {
      console.log('[DEBUG] Input detected as text (not URL)');
      jobDescription = input;
    }

    return { jobDescription, isURLInput };
  }

  /**
   * Extract job details and email addresses from job description
   * @param {string} jobDescription - Job description text
   * @param {Function} logCallback - Optional logging callback
   * @returns {Promise<Object>} Object with jobDetails and emailAddresses
   */
  async extractJobInfo(jobDescription, logCallback = null) {
    console.log('[DEBUG] Extracting job info from description');
    logCallback && logCallback('Extracting job details...', 'info');
    const jobDetails = await this.aiService.extractJobDetails(jobDescription);
    console.log(`[DEBUG] Job details extracted: Company="${jobDetails.companyName}", Title="${jobDetails.jobTitle}"`);
    logCallback && logCallback(`Extracted: ${jobDetails.companyName} - ${jobDetails.jobTitle}`, 'success');

    // Extract email addresses from job description
    logCallback && logCallback('Extracting email addresses...', 'info');
    const emailAddresses = await this.aiService.extractEmailAddresses(jobDescription);
    console.log(`[DEBUG] Found ${emailAddresses.length} email address(es)`);
    if (emailAddresses.length > 0) {
      console.log(`[DEBUG] Email addresses: ${emailAddresses.join(', ')}`);
      logCallback && logCallback(`Found ${emailAddresses.length} email address(es): ${emailAddresses.join(', ')}`, 'success');
    } else {
      logCallback && logCallback('No email addresses found in job description', 'info');
    }

    return { jobDetails, emailAddresses };
  }

  /**
   * Generate CV with advanced retry logic
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} CV generation result
   */
  async generateCV(params) {
    const { jobDescription, companyName, jobTitle, sourceFiles, sessionDir, logCallback } = params;

    logCallback && logCallback('Generating CV...', 'info');
    
    try {
      const cvResult = await this.documentService.generateCVWithAdvancedRetry(this.aiService, {
        jobDescription,
        companyName,
        jobTitle,
        originalCV: sourceFiles.originalCV,
        extensiveCV: sourceFiles.extensiveCV,
        cvStrategy: sourceFiles.cvStrategy,
        outputDir: sessionDir,
        logCallback: (msg) => logCallback && logCallback(msg, 'info')
      });

      if (cvResult.success) {
        logCallback && logCallback(`CV generated successfully (${cvResult.pageCount} pages, ${cvResult.attempts} attempt(s))`, 'success');
        
        // Generate CV change summary
        logCallback && logCallback('Generating CV change summary...', 'info');
        try {
          const cvChangeSummary = await this.aiService.generateCVChangeSummary({
            originalCV: sourceFiles.originalCV,
            newCV: cvResult.cvContent
          });
          logCallback && logCallback('CV change summary generated', 'success');
          cvResult.changeSummary = cvChangeSummary;
        } catch (summaryError) {
          console.error('[DEBUG] Error generating CV change summary:', summaryError);
          logCallback && logCallback('Failed to generate change summary', 'error');
          cvResult.changeSummary = 'Unable to generate change summary.';
        }
      } else {
        logCallback && logCallback(`CV generated with warnings: ${cvResult.error}`, 'warning');
      }

      return cvResult;
    } catch (error) {
      console.error('[DEBUG] Error in CV generation:', error);
      if (error.isAIFailure) {
        logCallback && logCallback(`CV generation failed: ${error.message}`, 'error');
        throw error;
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate cover letter
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} Cover letter generation result
   */
  async generateCoverLetter(params) {
    const { jobDescription, companyName, jobTitle, validatedCVText, sourceFiles, sessionDir, logCallback } = params;

    logCallback && logCallback('Generating cover letter...', 'info');

    try {
      const coverLetterContent = await this.aiService.generateCoverLetterAdvanced({
        jobDescription,
        companyName,
        jobTitle,
        validatedCVText,
        extensiveCV: sourceFiles.extensiveCV,
        coverLetterStrategy: sourceFiles.coverLetterStrategy
      });
      
      const coverLetterPath = await this.documentService.saveCoverLetter(coverLetterContent, sessionDir, {
        companyName,
        jobTitle
      });
      
      logCallback && logCallback('Cover letter generated', 'success');
      return { content: coverLetterContent, path: coverLetterPath };
    } catch (error) {
      console.error('[DEBUG] Error in cover letter generation:', error);
      if (error.isAIFailure) {
        logCallback && logCallback(`Cover letter generation failed: ${error.message}`, 'error');
        throw error;
      } else {
        throw error;
      }
    }
  }

  /**
   * Generate cold email
   * @param {Object} params - Generation parameters
   * @returns {Promise<Object>} Cold email generation result
   */
  async generateColdEmail(params) {
    const { jobDescription, companyName, jobTitle, validatedCVText, sourceFiles, sessionDir, logCallback } = params;

    logCallback && logCallback('Generating cold email...', 'info');

    try {
      const coldEmailContent = await this.aiService.generateColdEmailAdvanced({
        jobDescription,
        companyName,
        jobTitle,
        validatedCVText,
        extensiveCV: sourceFiles.extensiveCV,
        coldEmailStrategy: sourceFiles.coldEmailStrategy
      });
      
      const coldEmailPath = await this.documentService.saveColdEmail(coldEmailContent, sessionDir, {
        companyName,
        jobTitle
      });
      
      logCallback && logCallback('Cold email generated', 'success');
      return { content: coldEmailContent, path: coldEmailPath };
    } catch (error) {
      console.error('[DEBUG] Error in cold email generation:', error);
      if (error.isAIFailure) {
        logCallback && logCallback(`Cold email generation failed: ${error.message}`, 'error');
        throw error;
      } else {
        throw error;
      }
    }
  }

  /**
   * Extract text from CV PDF
   * @param {string} pdfPath - Path to PDF file
   * @param {string} fallbackContent - Fallback content if extraction fails
   * @returns {Promise<string>} Extracted text
   */
  async extractCVText(pdfPath, fallbackContent = '') {
    if (!pdfPath) {
      return fallbackContent;
    }

    try {
      return await this.documentService.extractPdfText(pdfPath);
    } catch (error) {
      console.error('Error extracting PDF text:', error);
      return fallbackContent;
    }
  }

  /**
   * Create or update session
   * @param {Object} params - Session parameters
   * @returns {Promise<Object>} Session object
   */
  async createOrUpdateSession(params) {
    const { requestSessionId, jobDescription, companyName, jobTitle, emailAddresses, mode } = params;

    if (requestSessionId) {
      const session = await this.sessionService.getSession(requestSessionId);
      if (!session) {
        throw new Error('Session not found');
      }
      await this.sessionService.updateSession(requestSessionId, {
        jobDescription,
        companyName,
        jobTitle,
        companyInfo: `${companyName} - ${jobTitle}`,
        emailAddresses,
        mode
      });
      return session;
    } else {
      const session = await this.sessionService.createSession({
        jobDescription,
        companyName,
        jobTitle,
        companyInfo: `${companyName} - ${jobTitle}`,
        emailAddresses,
        mode
      });
      return session;
    }
  }

  /**
   * Generate company profile for cold outreach
   * @param {string} companyName - Company name
   * @param {Function} logCallback - Logging callback
   * @returns {Promise<Object>} Company profile
   */
  async generateCompanyProfile(companyName, logCallback = null) {
    logCallback && logCallback('Step 1: Researching company and generating profile...', 'info');
    const companyProfile = await this.aiService.generateCompanyProfile(companyName);
    logCallback && logCallback('✓ Company profile generated', 'success');
    logCallback && logCallback(`Generic contact email: ${companyProfile.contactEmail || 'Not found'}`, 'info');
    return companyProfile;
  }

  /**
   * Find target personas for cold outreach
   * @param {string} originalCV - Original CV content
   * @param {string} companyName - Company name
   * @param {Function} logCallback - Logging callback
   * @returns {Promise<Array<string>>} Array of target personas
   */
  async findTargetPersonas(originalCV, companyName, logCallback = null) {
    console.log('[DEBUG] Finding target personas for cold outreach');
    console.log(`[DEBUG] Company: ${companyName}`);
    logCallback && logCallback('Step 3: Analyzing CV to identify target job titles...', 'info');
    const targetPersonas = await this.aiService.findTargetPersonas({
      originalCV,
      companyName
    });
    console.log(`[DEBUG] Target personas identified: ${targetPersonas.join(', ')}`);
    logCallback && logCallback(`✓ Target personas identified: ${targetPersonas.join(', ')}`, 'success');
    return targetPersonas;
  }

  /**
   * Research company and identify decision-makers using AI (NEW STRATEGIC APPROACH)
   * @param {Object} params - Research parameters
   * @param {string} params.companyName - Target company name
   * @param {string} params.originalCV - Candidate's CV
   * @param {string} params.reconStrategy - Reconnaissance strategy guidelines
   * @param {string} params.roleContext - Optional role context
   * @param {Function} params.logCallback - Logging callback
   * @returns {Promise<Object>} Research results
   */
  async researchCompanyAndIdentifyPeople({ companyName, originalCV, reconStrategy, roleContext, logCallback = null }) {
    console.log('[DEBUG] Starting strategic company research workflow');
    console.log(`[DEBUG] Company: ${companyName}, Role Context: ${roleContext || 'None'}`);
    
    logCallback && logCallback('Conducting AI-powered research on company and decision-makers...', 'info');
    logCallback && logCallback('Using strategic reconnaissance guidelines to identify high-level contacts...', 'info');
    
    const research = await this.aiService.researchCompanyAndIdentifyPeople({
      companyName,
      originalCV,
      reconStrategy,
      roleContext
    });
    
    console.log('[DEBUG] Research completed successfully');
    console.log(`[DEBUG] Found ${research.decisionMakers?.length || 0} decision makers`);
    
    logCallback && logCallback(`✓ Research complete: ${research.decisionMakers?.length || 0} decision-makers identified`, 'success');
    
    return research;
  }
}

module.exports = GenerationService;
