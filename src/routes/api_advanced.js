const express = require('express');
const multer = require('multer');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs').promises;
const validator = require('validator');
const AIFailureError = require('../errors/AIFailureError');

// Constants
const CHAT_MESSAGE_PREVIEW_LENGTH = 500; // Characters to show in chat message preview

// Configure multer for file uploads
const upload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.tex', '.pdf', '.doc', '.docx', '.txt'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

// Configure multer for source document uploads (settings page)
const sourceUpload = multer({
  dest: 'uploads/',
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['.tex', '.txt', '.doc', '.docx'];
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`File type ${ext} not allowed for source documents. Allowed types: ${allowedTypes.join(', ')}`));
    }
  }
});

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
 * Helper function to scrape content from URL
 * @param {string} url - URL to scrape
 * @returns {Promise<string>} Scraped text content
 */
async function scrapeURL(url) {
  const MAX_CONTENT_LENGTH = 50000; // Maximum characters to extract
  
  try {
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

function createApiRoutes(services) {
  const router = express.Router();
  const { aiService, fileService, documentService, sessionService } = services;

  /**
   * Handle streaming generation with SSE
   */
  async function handleStreamingGeneration(req, res, sendEvent, services) {
    const { aiService, fileService, documentService, sessionService } = services;
    const generatedDocuments = {
      cv: null,
      coverLetter: null,
      coldEmail: null
    };
    let sessionId = null;
    const logs = [];
    
    // Helper to log and send event
    const logAndSend = (message, level = 'info') => {
      const logEntry = { message, level, timestamp: new Date().toISOString() };
      logs.push(logEntry);
      sendEvent('log', logEntry);
    };

    try {
      const { input, sessionId: requestSessionId, preferences } = req.body;
      
      if (!input) {
        sendEvent('error', { error: 'Missing required field: input is required' });
        return res.end();
      }

      // Parse generation preferences (default all true except apollo)
      const generateCoverLetter = preferences?.coverLetter !== false;
      const generateColdEmail = preferences?.coldEmail !== false;
      const generateApollo = preferences?.apollo === true;

      // Check if session exists and is locked
      if (requestSessionId) {
        const existingSession = await sessionService.getSession(requestSessionId);
        if (existingSession && await sessionService.isSessionLocked(requestSessionId)) {
          sendEvent('error', { error: 'Session is locked (approved)' });
          return res.end();
        }
      }

      // Store the original input for display
      const originalInput = input;
      
      // Detect if input is a URL and scrape if needed
      let jobDescription;
      let isURLInput = false;
      
      if (isURL(input)) {
        isURLInput = true;
        logAndSend('Input detected as URL, scraping content...', 'info');
        try {
          const scrapedContent = await scrapeURL(input);
          logAndSend(`Scraped ${scrapedContent.length} characters from URL`, 'success');
          
          // Use AI to extract clean job description from scraped HTML
          logAndSend('Extracting job description from scraped content...', 'info');
          jobDescription = await aiService.extractJobDescriptionContent(scrapedContent);
          logAndSend('Job description extracted successfully', 'success');
        } catch (error) {
          sendEvent('error', { error: 'Failed to scrape URL', message: error.message });
          return res.end();
        }
      } else {
        jobDescription = input;
      }

      logAndSend('Loading source files...', 'info');
      const sourceFiles = await loadSourceFiles();
      logAndSend('Source files loaded', 'success');

      logAndSend('Extracting job details...', 'info');
      const jobDetails = await aiService.extractJobDetails(jobDescription);
      logAndSend(`Extracted: ${jobDetails.companyName} - ${jobDetails.jobTitle}`, 'success');

      // Extract email addresses from job description
      logAndSend('Extracting email addresses...', 'info');
      const emailAddresses = await aiService.extractEmailAddresses(jobDescription);
      if (emailAddresses.length > 0) {
        logAndSend(`Found ${emailAddresses.length} email address(es): ${emailAddresses.join(', ')}`, 'success');
      } else {
        logAndSend('No email addresses found in job description', 'info');
      }

      // Create or get session
      let session;
      if (requestSessionId) {
        session = await sessionService.getSession(requestSessionId);
        if (!session) {
          sendEvent('error', { error: 'Session not found' });
          return res.end();
        }
        await sessionService.updateSession(requestSessionId, {
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
          emailAddresses
        });
      } else {
        logAndSend('Creating session...', 'info');
        session = await sessionService.createSession({
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
          emailAddresses
        });
        logAndSend(`Session created: ${session.id}`, 'success');
      }

      sessionId = session.id;
      const sessionDir = sessionService.getSessionDirectory(session.id);

      // Send session ID to client
      sendEvent('session', { sessionId: session.id });

      // Add user message to session chat history (with original input)
      await sessionService.addChatMessage(session.id, {
        role: 'user',
        content: originalInput,
        isURL: isURLInput,
        extractedJobDescription: isURLInput && jobDescription.length > CHAT_MESSAGE_PREVIEW_LENGTH 
          ? jobDescription.substring(0, CHAT_MESSAGE_PREVIEW_LENGTH) + '...' 
          : isURLInput ? jobDescription : undefined
      });

      // Generate CV
      logAndSend('Generating CV...', 'info');
      let cvResult;
      let cvChangeSummary = null;
      
      try {
        cvResult = await documentService.generateCVWithAdvancedRetry(aiService, {
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          originalCV: sourceFiles.originalCV,
          extensiveCV: sourceFiles.extensiveCV,
          cvStrategy: sourceFiles.cvStrategy,
          outputDir: sessionDir,
          logCallback: (msg) => {
            logAndSend(msg, 'info');
          }
        });

        if (cvResult.success) {
          logAndSend(`CV generated successfully (${cvResult.pageCount} pages, ${cvResult.attempts} attempt(s))`, 'success');
          
          // Generate CV change summary
          logAndSend('Generating CV change summary...', 'info');
          try {
            cvChangeSummary = await aiService.generateCVChangeSummary({
              originalCV: sourceFiles.originalCV,
              newCV: cvResult.cvContent
            });
            logAndSend('CV change summary generated', 'success');
          } catch (summaryError) {
            logAndSend('Failed to generate change summary', 'error');
            cvChangeSummary = 'Unable to generate change summary.';
          }
        } else {
          logAndSend(`CV generated with warnings: ${cvResult.error}`, 'warning');
        }

        generatedDocuments.cv = cvResult;
      } catch (error) {
        if (error.isAIFailure) {
          logAndSend(`CV generation failed: ${error.message}`, 'error');
        } else {
          throw error;
        }
      }

      // Extract text from generated CV PDF
      let validatedCVText = '';
      if (generatedDocuments.cv && generatedDocuments.cv.pdfPath) {
        try {
          validatedCVText = await documentService.extractPdfText(generatedDocuments.cv.pdfPath);
        } catch (error) {
          validatedCVText = generatedDocuments.cv.cvContent || '';
        }
      }

      // Generate cover letter (conditional)
      if (generateCoverLetter) {
        logAndSend('Generating cover letter...', 'info');
        let coverLetterContent, coverLetterPath;
        
        try {
          coverLetterContent = await aiService.generateCoverLetterAdvanced({
            jobDescription,
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle,
            validatedCVText,
            extensiveCV: sourceFiles.extensiveCV,
            coverLetterStrategy: sourceFiles.coverLetterStrategy
          });
          
          coverLetterPath = await documentService.saveCoverLetter(coverLetterContent, sessionDir, {
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle
          });
          logAndSend('Cover letter generated', 'success');
          generatedDocuments.coverLetter = { content: coverLetterContent, path: coverLetterPath };
        } catch (error) {
          if (error.isAIFailure) {
            logAndSend(`Cover letter generation failed: ${error.message}`, 'error');
          } else {
            throw error;
          }
        }
      } else {
        logAndSend('Cover letter generation skipped (disabled in preferences)', 'info');
      }

      // Generate cold email (conditional)
      if (generateColdEmail) {
        logAndSend('Generating cold email...', 'info');
        let coldEmailContent, coldEmailPath;
        
        try {
          coldEmailContent = await aiService.generateColdEmailAdvanced({
            jobDescription,
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle,
            validatedCVText,
            extensiveCV: sourceFiles.extensiveCV,
            coldEmailStrategy: sourceFiles.coldEmailStrategy
          });
          
          coldEmailPath = await documentService.saveColdEmail(coldEmailContent, sessionDir, {
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle
          });
          logAndSend('Cold email generated', 'success');
          generatedDocuments.coldEmail = { content: coldEmailContent, path: coldEmailPath };
        } catch (error) {
          if (error.isAIFailure) {
            logAndSend(`Cold email generation failed: ${error.message}`, 'error');
          } else {
            throw error;
          }
        }
      } else {
        logAndSend('Cold email generation skipped (disabled in preferences)', 'info');
      }

      // Apollo generation (placeholder for future feature)
      if (generateApollo) {
        logAndSend('Apollo generation not yet implemented', 'info');
      }
        if (error.isAIFailure) {
          logAndSend(`Cold email generation failed: ${error.message}`, 'error');
        } else {
          throw error;
        }
      }

      // Update session
      const generatedFiles = {};
      if (generatedDocuments.cv) {
        generatedFiles.cv = {
          texPath: generatedDocuments.cv.texPath,
          pdfPath: generatedDocuments.cv.pdfPath,
          pageCount: generatedDocuments.cv.pageCount,
          attempts: generatedDocuments.cv.attempts,
          success: generatedDocuments.cv.success
        };
      }
      if (generatedDocuments.coverLetter) {
        generatedFiles.coverLetter = { path: generatedDocuments.coverLetter.path };
      }
      if (generatedDocuments.coldEmail) {
        generatedFiles.coldEmail = { path: generatedDocuments.coldEmail.path };
      }

      await sessionService.completeSession(session.id, generatedFiles);
      logAndSend('All documents generated successfully', 'success');

      // Build results
      const sanitizedSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      const results = {
        cv: generatedDocuments.cv ? {
          content: generatedDocuments.cv.cvContent,
          success: generatedDocuments.cv.success,
          pageCount: generatedDocuments.cv.pageCount,
          attempts: generatedDocuments.cv.attempts,
          error: generatedDocuments.cv.error,
          changeSummary: cvChangeSummary,
          pdfPath: generatedDocuments.cv.pdfPath ? `/documents/${sanitizedSessionId}/${path.basename(generatedDocuments.cv.pdfPath)}` : null
        } : null,
        coverLetter: generatedDocuments.coverLetter ? {
          content: generatedDocuments.coverLetter.content
        } : null,
        coldEmail: generatedDocuments.coldEmail ? {
          content: generatedDocuments.coldEmail.content,
          emailAddresses: emailAddresses
        } : null,
        emailAddresses: emailAddresses,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle
      };

      // Add assistant response to chat history with logs and results
      await sessionService.addChatMessage(session.id, {
        role: 'assistant',
        content: 'Documents generated successfully',
        results: results,
        logs: logs
      });

      // Send completion event
      sendEvent('complete', {
        success: true,
        sessionId: session.id,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        results: results
      });

      res.end();

    } catch (error) {
      console.error('Error in streaming generation:', error);
      logAndSend(`Error: ${error.message}`, 'error');
      sendEvent('error', { error: 'Failed to generate documents', message: error.message });
      res.end();
    }
  }

  // Supported file extensions for extensive_cv
  const EXTENSIVE_CV_EXTENSIONS = ['.txt', '.doc', '.docx'];

  // Source files paths
  const SOURCE_FILES = {
    originalCV: path.join(process.cwd(), 'source_files', 'original_cv.tex'),
    extensiveCV: path.join(process.cwd(), 'source_files', 'extensive_cv.txt'),
    cvStrategy: path.join(process.cwd(), 'source_files', 'cv_strat.txt'),
    coverLetterStrategy: path.join(process.cwd(), 'source_files', 'cover_letter.txt'),
    coldEmailStrategy: path.join(process.cwd(), 'source_files', 'cold_mail.txt')
  };

  /**
   * Load all source files
   */
  async function loadSourceFiles() {
    try {
      // For extensiveCV, check which file extension exists
      let extensiveCVPath = SOURCE_FILES.extensiveCV;
      
      for (const ext of EXTENSIVE_CV_EXTENSIONS) {
        const checkPath = path.join(process.cwd(), 'source_files', `extensive_cv${ext}`);
        if (await fileService.fileExists(checkPath)) {
          extensiveCVPath = checkPath;
          break;
        }
      }

      const [originalCV, extensiveCV, cvStrategy, coverLetterStrategy, coldEmailStrategy] = await Promise.all([
        fileService.readFile(SOURCE_FILES.originalCV),
        fileService.readFile(extensiveCVPath),
        fileService.readFile(SOURCE_FILES.cvStrategy),
        fileService.readFile(SOURCE_FILES.coverLetterStrategy),
        fileService.readFile(SOURCE_FILES.coldEmailStrategy)
      ]);

      return {
        originalCV,
        extensiveCV,
        cvStrategy,
        coverLetterStrategy,
        coldEmailStrategy
      };
    } catch (error) {
      console.error('Error loading source files:', error);
      throw new Error('Failed to load source files. Please ensure all source files exist in the source_files directory.');
    }
  }

  /**
   * POST /api/generate
   * Generate CV, cover letter, and cold email using sophisticated AI prompts
   * Supports Server-Sent Events for real-time progress streaming
   */
  router.post('/generate', upload.single('cvFile'), async (req, res) => {
    // Check if client wants SSE streaming
    const useSSE = req.headers.accept && req.headers.accept.includes('text/event-stream');
    
    if (useSSE) {
      // Set up SSE
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders();
      
      // Helper function to send SSE events
      const sendEvent = (eventType, data) => {
        res.write(`event: ${eventType}\n`);
        res.write(`data: ${JSON.stringify(data)}\n\n`);
      };
      
      // Handle streaming generation
      return handleStreamingGeneration(req, res, sendEvent, services);
    }
    
    // Non-streaming fallback (original implementation)
    return handleNonStreamingGeneration(req, res, services);
  });

  /**
   * Handle non-streaming generation (original implementation)
   */
  async function handleNonStreamingGeneration(req, res, services) {
    const { aiService, fileService, documentService, sessionService } = services;
    const generatedDocuments = {
      cv: null,
      coverLetter: null,
      coldEmail: null
    };
    let sessionId = null;
    let aiFailureOccurred = false;
    let aiFailureMessage = '';

    try {
      const { input, sessionId: requestSessionId, preferences } = req.body;
      
      // Validate required field
      if (!input) {
        return res.status(400).json({
          error: 'Missing required field: input is required (either job description or URL)'
        });
      }

      // Parse generation preferences (default all true except apollo)
      const generateCoverLetter = preferences?.coverLetter !== false;
      const generateColdEmail = preferences?.coldEmail !== false;
      const generateApollo = preferences?.apollo === true;

      // Check if session exists and is locked
      if (requestSessionId) {
        const existingSession = await sessionService.getSession(requestSessionId);
        if (existingSession && await sessionService.isSessionLocked(requestSessionId)) {
          return res.status(403).json({
            error: 'Session is locked (approved). Cannot modify approved sessions.'
          });
        }
      }

      // Store the original input for display
      const originalInput = input;
      
      // Detect if input is a URL and scrape if needed
      let jobDescription;
      let isURLInput = false;
      
      if (isURL(input)) {
        isURLInput = true;
        console.log('\n=== Input detected as URL, scraping content... ===');
        try {
          const scrapedContent = await scrapeURL(input);
          console.log(`✓ Scraped ${scrapedContent.length} characters from URL`);
          
          // Use AI to extract clean job description from scraped HTML
          console.log('Extracting job description from scraped content...');
          jobDescription = await aiService.extractJobDescriptionContent(scrapedContent);
          console.log('✓ Job description extracted successfully');
        } catch (error) {
          return res.status(400).json({
            error: 'Failed to scrape URL',
            message: error.message
          });
        }
      } else {
        jobDescription = input;
      }

      console.log('\n=== Starting Document Generation ===');
      console.log('Step 1: Loading source files...');
      
      // Load all source files
      const sourceFiles = await loadSourceFiles();
      console.log('✓ Source files loaded');

      console.log('\nStep 2: Extracting job details from description...');
      
      // Extract company name and job title
      const jobDetails = await aiService.extractJobDetails(jobDescription);
      console.log(`✓ Extracted: ${jobDetails.companyName} - ${jobDetails.jobTitle}`);

      // Extract email addresses from job description
      console.log('Extracting email addresses...');
      const emailAddresses = await aiService.extractEmailAddresses(jobDescription);
      if (emailAddresses.length > 0) {
        console.log(`✓ Found ${emailAddresses.length} email address(es): ${emailAddresses.join(', ')}`);
      } else {
        console.log('No email addresses found in job description');
      }

      // Create or get session
      let session;
      if (requestSessionId) {
        session = await sessionService.getSession(requestSessionId);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        // Update with new job details
        await sessionService.updateSession(requestSessionId, {
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
          emailAddresses
        });
      } else {
        console.log('\nStep 3: Creating session directory...');
        session = await sessionService.createSession({
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
          emailAddresses
        });
        console.log(`✓ Created session: ${session.id}`);
      }

      sessionId = session.id;

      const sessionDir = sessionService.getSessionDirectory(session.id);

      // Log to chat history
      await sessionService.logToChatHistory(session.id, `Starting document generation for ${jobDetails.companyName} - ${jobDetails.jobTitle}`);
      await sessionService.logToChatHistory(session.id, 'Loading source files...');
      await sessionService.logToChatHistory(session.id, '✓ Source files loaded successfully');

      // Add user message to session chat history (store original input)
      await sessionService.addChatMessage(session.id, {
        role: 'user',
        content: originalInput,
        isURL: isURLInput,
        extractedJobDescription: isURLInput && jobDescription.length > CHAT_MESSAGE_PREVIEW_LENGTH
          ? jobDescription.substring(0, CHAT_MESSAGE_PREVIEW_LENGTH) + '...'
          : isURLInput ? jobDescription : undefined
      });

      console.log('\nStep 4: Generating CV with advanced prompts and retry logic...');
      await sessionService.logToChatHistory(session.id, 'Starting CV generation with page validation...');

      // Generate CV using advanced method with retry logic
      let cvResult;
      let cvChangeSummary = null;
      
      try {
        cvResult = await documentService.generateCVWithAdvancedRetry(aiService, {
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          originalCV: sourceFiles.originalCV,
          extensiveCV: sourceFiles.extensiveCV,
          cvStrategy: sourceFiles.cvStrategy,
          outputDir: sessionDir,
          logCallback: (msg) => {
            sessionService.logToChatHistory(session.id, msg).catch(err => console.error('Log error:', err));
          }
        });

        if (cvResult.success) {
          await sessionService.logToChatHistory(session.id, `✓ CV generated successfully (${cvResult.pageCount} pages, ${cvResult.attempts} attempt(s))`, 'success');
          
          // Generate CV change summary
          console.log('\nGenerating CV change summary...');
          await sessionService.logToChatHistory(session.id, 'Generating CV change summary...');
          
          try {
            cvChangeSummary = await aiService.generateCVChangeSummary({
              originalCV: sourceFiles.originalCV,
              newCV: cvResult.cvContent
            });
            await sessionService.logToChatHistory(session.id, '✓ CV change summary generated', 'success');
          } catch (summaryError) {
            console.error('Error generating CV change summary:', summaryError);
            cvChangeSummary = 'Unable to generate change summary due to an error.';
            await sessionService.logToChatHistory(session.id, '⚠ Failed to generate change summary', 'error');
          }
        } else {
          await sessionService.logToChatHistory(session.id, `⚠ CV generated with warnings: ${cvResult.error}`, 'error');
        }

        generatedDocuments.cv = cvResult;
      } catch (error) {
        if (error.isAIFailure) {
          console.error('AI Service failure during CV generation:', error.message);
          await sessionService.logToChatHistory(session.id, `✗ CV generation failed: ${error.message}`, 'error');
          aiFailureOccurred = true;
          aiFailureMessage = error.message;
          // Continue with other documents
        } else {
          throw error; // Re-throw non-AI errors
        }
      }

      // Extract text from generated CV PDF for use in cover letter and email
      let validatedCVText = '';
      if (generatedDocuments.cv && generatedDocuments.cv.pdfPath) {
        try {
          validatedCVText = await documentService.extractPdfText(generatedDocuments.cv.pdfPath);
        } catch (error) {
          console.error('Error extracting PDF text:', error);
          // Fallback to using the LaTeX content
          validatedCVText = generatedDocuments.cv.cvContent;
        }
      } else if (generatedDocuments.cv && generatedDocuments.cv.cvContent) {
        validatedCVText = generatedDocuments.cv.cvContent;
      }

      // Generate cover letter (conditional)
      if (generateCoverLetter) {
        console.log('\nStep 5: Generating cover letter...');
        await sessionService.logToChatHistory(session.id, 'Generating cover letter...');

        let coverLetterContent;
        let coverLetterPath;
        
        try {
          coverLetterContent = await aiService.generateCoverLetterAdvanced({
            jobDescription,
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle,
            validatedCVText,
            extensiveCV: sourceFiles.extensiveCV,
            coverLetterStrategy: sourceFiles.coverLetterStrategy
          });
          
          coverLetterPath = await documentService.saveCoverLetter(coverLetterContent, sessionDir, {
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle
          });
          await sessionService.logToChatHistory(session.id, '✓ Cover letter generated', 'success');
          
          generatedDocuments.coverLetter = { content: coverLetterContent, path: coverLetterPath };
        } catch (error) {
          if (error.isAIFailure) {
            console.error('AI Service failure during cover letter generation:', error.message);
            await sessionService.logToChatHistory(session.id, `✗ Cover letter generation failed: ${error.message}`, 'error');
            aiFailureOccurred = true;
            aiFailureMessage = error.message;
          } else {
            throw error;
          }
        }
      } else {
        console.log('\nStep 5: Cover letter generation skipped (disabled in preferences)');
        await sessionService.logToChatHistory(session.id, 'Cover letter generation skipped (disabled in preferences)', 'info');
      }

      // Generate cold email (conditional)
      if (generateColdEmail) {
        console.log('\nStep 6: Generating cold email...');
        await sessionService.logToChatHistory(session.id, 'Generating cold email...');

        let coldEmailContent;
        let coldEmailPath;
        
        try {
          coldEmailContent = await aiService.generateColdEmailAdvanced({
            jobDescription,
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle,
            validatedCVText,
            extensiveCV: sourceFiles.extensiveCV,
            coldEmailStrategy: sourceFiles.coldEmailStrategy
          });
          
          coldEmailPath = await documentService.saveColdEmail(coldEmailContent, sessionDir, {
            companyName: jobDetails.companyName,
            jobTitle: jobDetails.jobTitle
          });
          await sessionService.logToChatHistory(session.id, '✓ Cold email generated', 'success');
          
          generatedDocuments.coldEmail = { content: coldEmailContent, path: coldEmailPath };
        } catch (error) {
          if (error.isAIFailure) {
            console.error('AI Service failure during cold email generation:', error.message);
            await sessionService.logToChatHistory(session.id, `✗ Cold email generation failed: ${error.message}`, 'error');
            aiFailureOccurred = true;
            aiFailureMessage = error.message;
          } else {
            throw error;
          }
        }
      } else {
        console.log('\nStep 6: Cold email generation skipped (disabled in preferences)');
        await sessionService.logToChatHistory(session.id, 'Cold email generation skipped (disabled in preferences)', 'info');
      }

      // Apollo generation (placeholder for future feature)
      if (generateApollo) {
        console.log('\nApollo generation not yet implemented');
        await sessionService.logToChatHistory(session.id, 'Apollo generation not yet implemented', 'info');
      }

      // Update session with generated files
      const generatedFiles = {};
      
      if (generatedDocuments.cv) {
        generatedFiles.cv = {
          texPath: generatedDocuments.cv.texPath,
          pdfPath: generatedDocuments.cv.pdfPath,
          pageCount: generatedDocuments.cv.pageCount,
          attempts: generatedDocuments.cv.attempts,
          success: generatedDocuments.cv.success
        };
      }
      
      if (generatedDocuments.coverLetter) {
        generatedFiles.coverLetter = {
          path: generatedDocuments.coverLetter.path
        };
      }
      
      if (generatedDocuments.coldEmail) {
        generatedFiles.coldEmail = {
          path: generatedDocuments.coldEmail.path
        };
      }

      await sessionService.completeSession(session.id, generatedFiles);
      
      if (aiFailureOccurred) {
        await sessionService.logToChatHistory(session.id, '⚠ Generation completed with some failures', 'error');
      } else {
        await sessionService.logToChatHistory(session.id, '✓ All documents generated successfully', 'success');
      }

      console.log('\n=== Generation Complete ===\n');

      // Build results object
      // Sanitize session ID for URL safety
      const sanitizedSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
      
      const results = {
        cv: generatedDocuments.cv ? {
          content: generatedDocuments.cv.cvContent,
          success: generatedDocuments.cv.success,
          pageCount: generatedDocuments.cv.pageCount,
          attempts: generatedDocuments.cv.attempts,
          error: generatedDocuments.cv.error,
          changeSummary: cvChangeSummary,
          pdfPath: generatedDocuments.cv.pdfPath ? `/documents/${sanitizedSessionId}/${path.basename(generatedDocuments.cv.pdfPath)}` : null
        } : null,
        coverLetter: generatedDocuments.coverLetter ? {
          content: generatedDocuments.coverLetter.content
        } : null,
        coldEmail: generatedDocuments.coldEmail ? {
          content: generatedDocuments.coldEmail.content,
          emailAddresses: emailAddresses
        } : null,
        emailAddresses: emailAddresses,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle
      };

      // Get logs from chat history file
      const logs = await sessionService.getChatHistoryFromFile(session.id);

      // Add assistant response to chat history with rich content
      await sessionService.addChatMessage(session.id, {
        role: 'assistant',
        content: aiFailureOccurred 
          ? 'Document generation completed with some failures.'
          : 'Documents generated successfully',
        results: results,
        logs: logs,
        aiFailureMessage: aiFailureOccurred ? aiFailureMessage : undefined
      });

      // Return response
      const responseData = {
        success: !aiFailureOccurred,
        partialSuccess: aiFailureOccurred,
        sessionId: session.id,
        message: aiFailureOccurred 
          ? 'Documents generated with some failures due to AI service issues' 
          : 'Documents generated successfully',
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        results,
        aiFailureMessage: aiFailureOccurred ? aiFailureMessage : undefined
      };

      res.json(responseData);

    } catch (error) {
      console.error('Error in /api/generate:', error);
      res.status(500).json({
        error: 'Failed to generate documents',
        message: error.message
      });
    }
  }

  /**
   * GET /api/history
   * Get list of all sessions
   */
  router.get('/history', async (req, res) => {
    try {
      const sessions = await sessionService.listSessions();
      res.json({
        success: true,
        sessions
      });
    } catch (error) {
      console.error('Error in /api/history:', error);
      res.status(500).json({
        error: 'Failed to retrieve history',
        message: error.message
      });
    }
  });

  /**
   * GET /api/history/:session_id
   * Get detailed information for a specific session
   */
  router.get('/history/:session_id', async (req, res) => {
    try {
      const { session_id } = req.params;
      const session = await sessionService.getSession(session_id);
      
      if (!session) {
        return res.status(404).json({
          error: 'Session not found'
        });
      }

      // Also get the chat history from file
      const fileHistory = await sessionService.getChatHistoryFromFile(session_id);

      res.json({
        success: true,
        session: {
          ...session,
          fileHistory
        }
      });
    } catch (error) {
      console.error('Error in /api/history/:session_id:', error);
      res.status(500).json({
        error: 'Failed to retrieve session',
        message: error.message
      });
    }
  });

  /**
   * POST /api/refine
   * Refine generated content based on user feedback
   */
  router.post('/refine', async (req, res) => {
    try {
      const { sessionId, contentType, feedback } = req.body;

      if (!sessionId || !contentType || !feedback) {
        return res.status(400).json({
          error: 'Missing required fields: sessionId, contentType, and feedback are required'
        });
      }

      const session = await sessionService.getSession(sessionId);
      
      if (!session) {
        return res.status(404).json({
          error: 'Session not found'
        });
      }

      // Check if session is locked
      if (await sessionService.isSessionLocked(sessionId)) {
        return res.status(403).json({
          error: 'Session is locked (approved). Cannot modify approved sessions.'
        });
      }

      // Get the current content based on type
      const sessionDir = sessionService.getSessionDirectory(sessionId);
      let currentContent = '';
      let filePath = '';

      if (contentType === 'cv') {
        filePath = path.join(sessionDir, 'generated_cv.tex');
      } else if (contentType === 'cover_letter') {
        filePath = path.join(sessionDir, 'cover_letter.txt');
      } else if (contentType === 'cold_email') {
        filePath = path.join(sessionDir, 'cold_email.txt');
      } else {
        return res.status(400).json({
          error: 'Invalid contentType. Must be one of: cv, cover_letter, cold_email'
        });
      }

      try {
        currentContent = await fileService.readFile(filePath);
      } catch (error) {
        return res.status(404).json({
          error: 'Content file not found for this session'
        });
      }

      // Add feedback to chat history
      await sessionService.addChatMessage(sessionId, {
        role: 'user',
        content: `Refine ${contentType}: ${feedback}`
      });

      await sessionService.logToChatHistory(sessionId, `Refining ${contentType}: ${feedback}`);

      // Get chat history for context
      const chatHistory = session.chatHistory || [];

      // Refine using advanced prompt
      const refinedContent = await aiService.refineContentAdvanced({
        content: currentContent,
        feedback,
        contentType,
        chatHistory
      });

      // Save refined content
      await fileService.writeFile(filePath, refinedContent);

      await sessionService.logToChatHistory(sessionId, `✓ ${contentType} refined successfully`, 'success');

      // If refining CV, recompile and validate
      if (contentType === 'cv') {
        await sessionService.logToChatHistory(sessionId, 'Recompiling CV...');
        
        const compileResult = await documentService.compileLatexToPdf(filePath, sessionDir, 1);
        
        if (compileResult.success) {
          await sessionService.logToChatHistory(sessionId, `✓ CV recompiled (${compileResult.pageCount} pages)`, 'success');
        } else {
          await sessionService.logToChatHistory(sessionId, `⚠ CV compilation warning: ${compileResult.message}`, 'error');
        }
      }

      // Add assistant response to chat history
      await sessionService.addChatMessage(sessionId, {
        role: 'assistant',
        content: `${contentType} has been refined based on your feedback:\n\n${refinedContent}`
      });

      res.json({
        success: true,
        message: 'Content refined successfully',
        sessionId,
        contentType,
        refinedContent
      });

    } catch (error) {
      console.error('Error in /api/refine:', error);
      res.status(500).json({
        error: 'Failed to refine content',
        message: error.message
      });
    }
  });

  /**
   * POST /api/approve/:session_id
   * Approve and lock a session
   */
  router.post('/approve/:session_id', async (req, res) => {
    try {
      const { session_id } = req.params;
      const session = await sessionService.approveSession(session_id);
      
      await sessionService.logToChatHistory(session_id, '✓ Session approved and locked', 'success');

      res.json({
        success: true,
        message: 'Session approved and locked. No further changes can be made.',
        session
      });
    } catch (error) {
      console.error('Error in /api/approve/:session_id:', error);
      res.status(500).json({
        error: 'Failed to approve session',
        message: error.message
      });
    }
  });

  /**
   * POST /api/upload-source-doc
   * Upload and replace source documents (original_cv.tex or extensive_cv.doc)
   */
  router.post('/upload-source-doc', sourceUpload.single('file'), async (req, res) => {
    try {
      const { docType } = req.body;
      
      if (!req.file) {
        return res.status(400).json({
          error: 'No file uploaded'
        });
      }

      if (!docType || !['original_cv', 'extensive_cv'].includes(docType)) {
        return res.status(400).json({
          error: 'Invalid docType. Must be either "original_cv" or "extensive_cv"'
        });
      }

      // Determine target filename and path
      let targetFilename;
      let targetPath;
      
      if (docType === 'original_cv') {
        // Must be .tex file
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (ext !== '.tex') {
          await fs.unlink(req.file.path); // Clean up uploaded file
          return res.status(400).json({
            error: 'original_cv must be a .tex file'
          });
        }
        targetFilename = 'original_cv.tex';
        targetPath = path.join(process.cwd(), 'source_files', targetFilename);
      } else if (docType === 'extensive_cv') {
        // Accept .txt, .doc or .docx file
        const ext = path.extname(req.file.originalname).toLowerCase();
        if (!EXTENSIVE_CV_EXTENSIONS.includes(ext)) {
          await fs.unlink(req.file.path); // Clean up uploaded file
          return res.status(400).json({
            error: `extensive_cv must be one of: ${EXTENSIVE_CV_EXTENSIONS.join(', ')}`
          });
        }
        // Preserve the file extension to maintain format integrity
        // The fileService will handle reading different formats
        if (ext === '.txt') {
          targetFilename = 'extensive_cv.txt';
        } else if (ext === '.doc') {
          targetFilename = 'extensive_cv.doc';
        } else {
          targetFilename = 'extensive_cv.docx';
        }
        targetPath = path.join(process.cwd(), 'source_files', targetFilename);
      }

      // Read the uploaded file content
      const fileContent = await fs.readFile(req.file.path);
      
      // Ensure source_files directory exists
      const sourceDir = path.join(process.cwd(), 'source_files');
      await fileService.ensureDirectory(sourceDir);

      // Clean up old extensive_cv files with different extensions if uploading extensive_cv
      // This ensures only one version exists at a time
      if (docType === 'extensive_cv') {
        for (const checkExt of EXTENSIVE_CV_EXTENSIONS) {
          if (checkExt !== path.extname(targetFilename).toLowerCase()) {
            const oldFilePath = path.join(sourceDir, `extensive_cv${checkExt}`);
            try {
              if (await fileService.fileExists(oldFilePath)) {
                await fs.unlink(oldFilePath);
                console.log(`✓ Removed old extensive_cv file: extensive_cv${checkExt}`);
              }
            } catch (error) {
              console.warn(`Could not remove old file extensive_cv${checkExt}:`, error.message);
            }
          }
        }
      }

      // Backup existing file if it exists
      const backupPath = targetPath + '.backup';
      try {
        const exists = await fileService.fileExists(targetPath);
        if (exists) {
          await fs.copyFile(targetPath, backupPath);
          console.log(`✓ Backed up existing file to ${backupPath}`);
        }
      } catch (error) {
        console.warn('Could not create backup:', error.message);
      }

      // Write the new file
      await fs.writeFile(targetPath, fileContent);
      console.log(`✓ Uploaded ${docType} to ${targetPath}`);

      // Clean up the temporary uploaded file
      await fs.unlink(req.file.path);

      res.json({
        success: true,
        message: `${docType} uploaded successfully`,
        filename: targetFilename,
        path: targetPath
      });

    } catch (error) {
      console.error('Error in /api/upload-source-doc:', error);
      
      // Clean up uploaded file if it exists
      if (req.file && req.file.path) {
        try {
          await fs.unlink(req.file.path);
        } catch (cleanupError) {
          console.error('Error cleaning up uploaded file:', cleanupError);
        }
      }

      res.status(500).json({
        error: 'Failed to upload source document',
        message: error.message
      });
    }
  });

  /**
   * POST /api/save-content
   * Save edited content (cover letter or cold email)
   */
  router.post('/save-content', async (req, res) => {
    try {
      const { sessionId, contentType, content } = req.body;
      
      if (!sessionId || !contentType || content === undefined) {
        return res.status(400).json({
          error: 'Missing required fields: sessionId, contentType, and content are required'
        });
      }

      // Get session directory
      const sessionDir = sessionService.getSessionDirectory(sessionId);
      
      // Determine file path based on content type
      let filePath;
      if (contentType === 'coverLetter') {
        filePath = path.join(sessionDir, 'cover_letter.txt');
      } else if (contentType === 'coldEmail') {
        filePath = path.join(sessionDir, 'cold_email.txt');
      } else {
        return res.status(400).json({
          error: 'Invalid contentType. Must be "coverLetter" or "coldEmail"'
        });
      }

      // Save the content
      await fileService.writeFile(filePath, content);
      
      res.json({
        success: true,
        message: `${contentType} saved successfully`
      });

    } catch (error) {
      console.error('Error in /api/save-content:', error);
      res.status(500).json({
        error: 'Failed to save content',
        message: error.message
      });
    }
  });

  /**
   * GET /api/download/cover-letter/:sessionId
   * Download cover letter as .docx
   */
  router.get('/download/cover-letter/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Get session
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const sessionDir = sessionService.getSessionDirectory(sessionId);
      const coverLetterPath = path.join(sessionDir, 'cover_letter.txt');
      
      // Check if file exists
      if (!await fileService.fileExists(coverLetterPath)) {
        return res.status(404).json({ error: 'Cover letter not found' });
      }

      // Read content
      const content = await fileService.readFile(coverLetterPath);
      
      // For now, download as .txt (converting to .docx requires additional library)
      // We'll use a simple text file with proper formatting
      const fileName = `${sessionId}_CoverLetter.txt`;
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(content);

    } catch (error) {
      console.error('Error in /api/download/cover-letter:', error);
      res.status(500).json({
        error: 'Failed to download cover letter',
        message: error.message
      });
    }
  });

  /**
   * GET /api/download/cold-email/:sessionId
   * Download cold email as .txt
   */
  router.get('/download/cold-email/:sessionId', async (req, res) => {
    try {
      const { sessionId } = req.params;
      
      // Get session
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }

      const sessionDir = sessionService.getSessionDirectory(sessionId);
      const coldEmailPath = path.join(sessionDir, 'cold_email.txt');
      
      // Check if file exists
      if (!await fileService.fileExists(coldEmailPath)) {
        return res.status(404).json({ error: 'Cold email not found' });
      }

      // Read content
      const content = await fileService.readFile(coldEmailPath);
      
      const fileName = `${sessionId}_ColdEmail.txt`;
      
      res.setHeader('Content-Type', 'text/plain');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(content);

    } catch (error) {
      console.error('Error in /api/download/cold-email:', error);
      res.status(500).json({
        error: 'Failed to download cold email',
        message: error.message
      });
    }
  });

  return router;
}

module.exports = createApiRoutes;
