const path = require('path');
const fs = require('fs').promises;
const { isURL, scrapeURL } = require('../utils/urlUtils');

// Constants
const CHAT_MESSAGE_PREVIEW_LENGTH = 500; // Characters to show in chat message preview

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
async function loadSourceFiles(fileService) {
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
    const sourceFiles = await loadSourceFiles(fileService);
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
    
    // Mark session as failed if it was created
    if (sessionId) {
      try {
        await sessionService.failSession(sessionId, error.message);
      } catch (failError) {
        console.error('Failed to update session status:', failError);
      }
    }
    
    sendEvent('error', { error: 'Failed to generate documents', message: error.message });
    res.end();
  }
}

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
    const sourceFiles = await loadSourceFiles(fileService);
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
    
    // Mark session as failed if it was created
    if (sessionId) {
      try {
        await sessionService.failSession(sessionId, error.message);
      } catch (failError) {
        console.error('Failed to update session status:', failError);
      }
    }
    
    res.status(500).json({
      error: 'Failed to generate documents',
      message: error.message
    });
  }
}

/**
 * Handle cold outreach workflow
 * Orchestrates company profiling, contact search, and personalized email generation
 */
async function handleColdOutreachPath(req, res, sendEvent, services) {
  const { aiService, fileService, documentService, sessionService, apolloService, disambiguationService } = services;
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
    if (sendEvent) {
      sendEvent('log', logEntry);
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
  };

  try {
    const { input: companyName, sessionId: requestSessionId, preferences } = req.body;
    
    if (!companyName) {
      const error = { error: 'Missing required field: input (company name) is required' };
      if (sendEvent) {
        sendEvent('error', error);
        return res.end();
      }
      return res.status(400).json(error);
    }

    // Check if session exists and is locked
    if (requestSessionId) {
      const existingSession = await sessionService.getSession(requestSessionId);
      if (existingSession && await sessionService.isSessionLocked(requestSessionId)) {
        const error = { error: 'Session is locked (approved)' };
        if (sendEvent) {
          sendEvent('error', error);
          return res.end();
        }
        return res.status(403).json(error);
      }
    }

    logAndSend(`Starting cold outreach workflow for: ${companyName}`, 'info');

    // Step 1: Generate company profile
    logAndSend('Step 1: Researching company and generating profile...', 'info');
    const companyProfile = await aiService.generateCompanyProfile(companyName);
    logAndSend(`✓ Company profile generated`, 'success');
    logAndSend(`Generic contact email: ${companyProfile.contactEmail || 'Not found'}`, 'info');

    // Step 2: Load original CV for persona identification
    logAndSend('Step 2: Loading CV to identify target personas...', 'info');
    const sourceFiles = await loadSourceFiles(fileService);
    
    // Step 3: Find target personas
    logAndSend('Step 3: Analyzing CV to identify target job titles...', 'info');
    const targetPersonas = await aiService.findTargetPersonas({
      originalCV: sourceFiles.originalCV,
      companyName: companyName
    });
    logAndSend(`✓ Target personas identified: ${targetPersonas.join(', ')}`, 'success');

    // Step 4: Search Apollo for contacts (if enabled)
    let apolloContact = null;
    let apolloError = null;
    
    if (apolloService.isEnabled()) {
      try {
        logAndSend('Step 4: Searching Apollo.io for contacts...', 'info');
        const contacts = await apolloService.searchPeople({
          companyName: companyName,
          targetTitles: targetPersonas,
          limit: 10
        });
        
        if (contacts && contacts.length > 0) {
          logAndSend(`Found ${contacts.length} potential contact(s)`, 'success');
          
          // Filter to only verified/guessed emails
          const contactsWithEmails = disambiguationService.filterContactsWithEmails(contacts);
          logAndSend(`${contactsWithEmails.length} contact(s) with verified/guessed emails`, 'info');
          
          if (contactsWithEmails.length > 0) {
            // Select best contact
            apolloContact = disambiguationService.selectBestContact(contactsWithEmails);
            
            if (apolloContact && disambiguationService.isValidContact(apolloContact)) {
              logAndSend(`✓ Selected contact: ${apolloContact.name} (${apolloContact.title})`, 'success');
              logAndSend(`Email: ${apolloContact.email} [${apolloContact.emailStatus}]`, 'info');
            } else {
              logAndSend('⚠ No valid contact found in results', 'warning');
              apolloContact = null;
            }
          } else {
            logAndSend('⚠ No contacts with verified emails found', 'warning');
          }
        } else {
          logAndSend('⚠ No contacts found on Apollo.io', 'warning');
        }
      } catch (error) {
        logAndSend(`✗ Apollo.io search failed: ${error.message}`, 'error');
        apolloError = error.message;
      }
    } else {
      logAndSend('Step 4: Apollo.io integration disabled (API key not configured)', 'info');
    }

    // Create session
    let session;
    if (requestSessionId) {
      session = await sessionService.getSession(requestSessionId);
      if (!session) {
        const error = { error: 'Session not found' };
        if (sendEvent) {
          sendEvent('error', error);
          return res.end();
        }
        return res.status(404).json(error);
      }
      await sessionService.updateSession(requestSessionId, {
        companyName: companyName,
        jobTitle: 'Cold Outreach',
        companyInfo: `${companyName} - Cold Outreach`,
        mode: 'cold_outreach'
      });
    } else {
      logAndSend('Creating session...', 'info');
      session = await sessionService.createSession({
        companyName: companyName,
        jobTitle: 'Cold Outreach',
        companyInfo: `${companyName} - Cold Outreach`,
        mode: 'cold_outreach'
      });
      logAndSend(`✓ Session created: ${session.id}`, 'success');
    }

    sessionId = session.id;
    const sessionDir = sessionService.getSessionDirectory(session.id);

    // Send session ID to client
    if (sendEvent) {
      sendEvent('session', { sessionId: session.id });
    }

    // Add user message to chat history
    await sessionService.addChatMessage(session.id, {
      role: 'user',
      content: `Cold outreach to: ${companyName}`,
      mode: 'cold_outreach'
    });

    // Step 5: Generate CV tailored to company
    logAndSend('Step 5: Generating CV tailored to company...', 'info');
    let cvResult;
    let cvChangeSummary = null;
    
    try {
      // Use company profile as "job description" for CV generation
      const syntheticJobDescription = `${companyProfile.description}\n\nTarget Roles: ${targetPersonas.join(', ')}`;
      
      cvResult = await documentService.generateCVWithAdvancedRetry(aiService, {
        jobDescription: syntheticJobDescription,
        companyName: companyName,
        jobTitle: 'Cold Outreach',
        originalCV: sourceFiles.originalCV,
        extensiveCV: sourceFiles.extensiveCV,
        cvStrategy: sourceFiles.cvStrategy,
        outputDir: sessionDir,
        logCallback: (msg) => {
          logAndSend(msg, 'info');
        }
      });

      if (cvResult.success) {
        logAndSend(`✓ CV generated successfully (${cvResult.pageCount} pages)`, 'success');
        
        // Generate CV change summary
        try {
          cvChangeSummary = await aiService.generateCVChangeSummary({
            originalCV: sourceFiles.originalCV,
            newCV: cvResult.cvContent
          });
          logAndSend('✓ CV change summary generated', 'success');
        } catch (summaryError) {
          cvChangeSummary = 'Unable to generate change summary.';
        }
      }

      generatedDocuments.cv = cvResult;
    } catch (error) {
      if (error.isAIFailure) {
        logAndSend(`✗ CV generation failed: ${error.message}`, 'error');
      } else {
        throw error;
      }
    }

    // Extract CV text for email generation
    let validatedCVText = '';
    if (generatedDocuments.cv && generatedDocuments.cv.pdfPath) {
      try {
        validatedCVText = await documentService.extractPdfText(generatedDocuments.cv.pdfPath);
      } catch (error) {
        validatedCVText = generatedDocuments.cv.cvContent || '';
      }
    }

    // Step 6: Generate personalized or generic cold email
    logAndSend('Step 6: Generating cold email...', 'info');
    let coldEmailContent, coldEmailPath;
    let emailRecipient = null;
    
    try {
      if (apolloContact) {
        // Generate hyper-personalized email
        logAndSend('Generating personalized email for contact...', 'info');
        coldEmailContent = await aiService.generatePersonalizedColdEmail({
          companyName: companyName,
          companyProfile: companyProfile.description,
          contact: apolloContact,
          validatedCVText: validatedCVText,
          extensiveCV: sourceFiles.extensiveCV,
          coldEmailStrategy: sourceFiles.coldEmailStrategy
        });
        emailRecipient = apolloContact.email;
        logAndSend(`✓ Personalized email generated for ${apolloContact.name}`, 'success');
      } else {
        // Generate generic email
        // Sanitize company name for email: remove special chars, spaces, convert to lowercase
        const sanitizedCompanyName = companyName
          .toLowerCase()
          .replace(/[^a-z0-9]/g, '')
          .substring(0, 50); // Limit length
        const genericEmail = companyProfile.contactEmail || `info@${sanitizedCompanyName}.com`;
        logAndSend('Generating generic cold email (no specific contact found)...', 'info');
        coldEmailContent = await aiService.generateGenericColdEmail({
          companyName: companyName,
          companyProfile: companyProfile.description,
          genericEmail: genericEmail,
          validatedCVText: validatedCVText,
          extensiveCV: sourceFiles.extensiveCV,
          coldEmailStrategy: sourceFiles.coldEmailStrategy
        });
        emailRecipient = genericEmail;
        
        if (apolloError) {
          logAndSend(`⚠ Using generic email due to Apollo error: ${apolloError}`, 'warning');
        } else {
          logAndSend('✓ Generic cold email generated', 'success');
        }
      }
      
      coldEmailPath = await documentService.saveColdEmail(coldEmailContent, sessionDir, {
        companyName: companyName,
        jobTitle: 'ColdOutreach'
      });
      generatedDocuments.coldEmail = { content: coldEmailContent, path: coldEmailPath };
      
    } catch (error) {
      if (error.isAIFailure) {
        logAndSend(`✗ Cold email generation failed: ${error.message}`, 'error');
      } else {
        throw error;
      }
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
    if (generatedDocuments.coldEmail) {
      generatedFiles.coldEmail = { path: generatedDocuments.coldEmail.path };
    }

    await sessionService.completeSession(session.id, generatedFiles);
    logAndSend('✓ Cold outreach workflow completed', 'success');

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
      coldEmail: generatedDocuments.coldEmail ? {
        content: generatedDocuments.coldEmail.content,
        emailAddresses: [emailRecipient],
        recipientName: apolloContact ? apolloContact.name : null,
        recipientTitle: apolloContact ? apolloContact.title : null,
        isPersonalized: !!apolloContact
      } : null,
      companyName: companyName,
      companyProfile: companyProfile.description,
      targetPersonas: targetPersonas,
      apolloContact: apolloContact ? {
        name: apolloContact.name,
        title: apolloContact.title,
        email: apolloContact.email
      } : null,
      apolloError: apolloError
    };

    // Add assistant response to chat history
    await sessionService.addChatMessage(session.id, {
      role: 'assistant',
      content: 'Cold outreach workflow completed',
      results: results,
      logs: logs
    });

    // Send response
    if (sendEvent) {
      sendEvent('complete', {
        success: true,
        sessionId: session.id,
        companyName: companyName,
        results: results
      });
      res.end();
    } else {
      res.json({
        success: true,
        sessionId: session.id,
        message: 'Cold outreach workflow completed successfully',
        companyName: companyName,
        results: results
      });
    }

  } catch (error) {
    console.error('Error in cold outreach workflow:', error);
    logAndSend(`Error: ${error.message}`, 'error');
    
    // Mark session as failed if it was created
    if (sessionId) {
      try {
        await sessionService.failSession(sessionId, error.message);
      } catch (failError) {
        console.error('Failed to update session status:', failError);
      }
    }
    
    if (sendEvent) {
      sendEvent('error', { error: 'Failed to complete cold outreach', message: error.message });
      res.end();
    } else {
      res.status(500).json({
        error: 'Failed to complete cold outreach workflow',
        message: error.message
      });
    }
  }
}

module.exports = {
  handleStreamingGeneration,
  handleNonStreamingGeneration,
  handleColdOutreachPath,
  loadSourceFiles,
  EXTENSIVE_CV_EXTENSIONS,
  SOURCE_FILES
};
