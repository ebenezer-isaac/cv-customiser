const path = require('path');
const { loadSourceFiles, EXTENSIVE_CV_EXTENSIONS, SOURCE_FILES } = require('../utils/fileHelpers');
const GenerationService = require('../services/generationService');

// Constants
const CHAT_MESSAGE_PREVIEW_LENGTH = 500; // Characters to show in chat message preview
const FALLBACK_TARGET_PERSONAS = ['CEO', 'CTO', 'VP of Engineering']; // Default personas if research fails

/**
 * Helper function to handle session failure
 * @param {string} sessionId - Session ID
 * @param {Object} sessionService - Session service instance
 * @param {Error} error - Error object
 */
async function handleSessionFailure(sessionId, sessionService, error) {
  if (sessionId) {
    try {
      await sessionService.failSession(sessionId, error.message);
    } catch (failError) {
      console.error('Failed to update session status:', failError);
    }
  }
}



/**
 * Handle streaming generation with SSE
 */
async function handleStreamingGeneration(req, res, sendEvent, services) {
  const { fileService, sessionService } = services;
  const generationService = new GenerationService(services);
  
  console.log('[DEBUG] ====== STREAMING GENERATION REQUEST STARTED ======');
  console.log('[DEBUG] Request body keys:', Object.keys(req.body));
  console.log('[DEBUG] Request body:', JSON.stringify(req.body, null, 2));
  
  const generatedDocuments = {
    cv: null,
    coverLetter: null,
    coldEmail: null
  };
  let sessionId = null;
  const logs = [];
  const failedLogs = []; // Store failed log writes for potential retry
  
  // Helper to log and send event - also writes to session logs.jsonl
  const logAndSend = (message, level = 'info') => {
    const logEntry = { message, level, timestamp: new Date().toISOString() };
    logs.push(logEntry);
    sendEvent('log', logEntry);
    // Write to session logs if session exists
    if (sessionId) {
      sessionService.logToChatHistory(sessionId, message, level).catch(err => {
        console.error('Failed to log to chat history:', err);
        // Store failed log for potential retry
        failedLogs.push(logEntry);
      });
    }
  };

  try {
    const { input, sessionId: requestSessionId, preferences } = req.body;
    
    console.log(`[DEBUG] Input received: ${input ? input.substring(0, 100) + '...' : 'NONE'}`);
    console.log(`[DEBUG] Session ID: ${requestSessionId || 'NEW'}`);
    console.log(`[DEBUG] Preferences:`, preferences);
    
    if (!input) {
      console.log('[DEBUG] ERROR: Missing input field');
      sendEvent('error', { error: 'Missing required field: input is required' });
      return res.end();
    }

    // Parse generation preferences (default all true except apollo)
    const generateCoverLetterFlag = preferences?.coverLetter !== false;
    const generateColdEmailFlag = preferences?.coldEmail !== false;
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
    
    // PART 2.1: Create session immediately at the start (before slow URL scraping)
    let session;
    if (requestSessionId) {
      // Using existing session
      session = await sessionService.getSession(requestSessionId);
      if (!session) {
        console.error('[DEBUG] APIController: Session not found');
        sendEvent('error', { error: 'Session not found' });
        return res.end();
      }
      console.log(`[DEBUG] APIController: Using existing session: ${session.id}`);
    } else {
      // Create new session immediately with minimal data
      console.log('[DEBUG] APIController: Creating new session immediately');
      session = await sessionService.createSession({
        companyName: 'Processing',
        jobTitle: 'Processing',
        mode: 'standard'
      });
      console.log(`[DEBUG] APIController: ✓ Session created immediately: ${session.id}`);
    }
    
    sessionId = session.id;
    
    // PART 2.2: Send session ID as first SSE event
    sendEvent('session', { sessionId: session.id });
    console.log(`[DEBUG] APIController: ✓ Session ID sent to client: ${session.id}`);
    
    // PART 2.3: Persist user message immediately
    console.log('[DEBUG] APIController: Persisting user message to chat history');
    await sessionService.addChatMessage(session.id, {
      role: 'user',
      content: originalInput,
      timestamp: new Date().toISOString()
    });
    console.log('[DEBUG] APIController: ✓ User message persisted');
    
    // Process input (detect URL and scrape if needed) - NEW: Returns structured jobData
    let jobData, isURLInput;
    try {
      console.log('[DEBUG] APIController: Calling generationService.processInput');
      const result = await generationService.processInput(input, logAndSend);
      jobData = result.jobData;
      isURLInput = result.isURLInput;
      console.log('[DEBUG] APIController: Received structured jobData from generationService');
      console.log(`[DEBUG] APIController: jobData fields: ${Object.keys(jobData).join(', ')}`);
    } catch (error) {
      console.error('[DEBUG] APIController: Error processing input:', error);
      sendEvent('error', { error: 'Failed to process input', message: error.message });
      return res.end();
    }

    console.log('[DEBUG] APIController: Loading source files...');
    logAndSend('Loading source files...', 'info');
    const sourceFiles = await loadSourceFiles(fileService);
    console.log('[DEBUG] APIController: Source files loaded successfully');
    logAndSend('Source files loaded', 'success');

    // Extract email addresses from job data
    console.log('[DEBUG] APIController: Extracting email addresses from jobData');
    const { emailAddresses } = await generationService.extractJobInfo(jobData, logAndSend);

    // Update session with extracted job information
    console.log('[DEBUG] APIController: Updating session with extracted job information');
    await sessionService.updateSession(session.id, {
      jobDescription: jobData.jobDescription,
      companyName: jobData.companyName,
      jobTitle: jobData.jobTitle,
      companyInfo: `${jobData.jobTitle} at ${jobData.companyName}`
    });
    console.log(`[DEBUG] APIController: Session updated with job info`);

    const sessionDir = sessionService.getSessionDirectory(session.id);

    // Update user message with extracted metadata if it was a URL
    if (isURLInput) {
      console.log('[DEBUG] APIController: Updating user message with URL metadata');
      await sessionService.addChatMessage(session.id, {
        role: 'system',
        content: 'URL processed',
        extractedJobDescription: jobData.jobDescription.length > CHAT_MESSAGE_PREVIEW_LENGTH 
          ? jobData.jobDescription.substring(0, CHAT_MESSAGE_PREVIEW_LENGTH) + '...' 
          : jobData.jobDescription,
        companyName: jobData.companyName,
        jobTitle: jobData.jobTitle
      });
    }

    // Generate CV using structured jobData
    console.log('[DEBUG] APIController: Starting CV generation with structured jobData');
    try {
      const cvResult = await generationService.generateCV({
        jobDescription: jobData.jobDescription,
        companyName: jobData.companyName,
        jobTitle: jobData.jobTitle,
        sourceFiles,
        sessionDir,
        logCallback: logAndSend
      });
      generatedDocuments.cv = cvResult;
      console.log('[DEBUG] APIController: CV generation completed');
    } catch (error) {
      console.error('[DEBUG] APIController: Error in CV generation (streaming):', error);
      if (error.isAIFailure) {
        logAndSend(`CV generation failed: ${error.message}`, 'error');
      } else {
        throw error;
      }
    }

    // Extract text from generated CV PDF
    console.log('[DEBUG] APIController: Extracting text from generated CV PDF');
    const validatedCVText = await generationService.extractCVText(
      generatedDocuments.cv?.pdfPath,
      generatedDocuments.cv?.cvContent || ''
    );

    // Generate cover letter (conditional)
    if (generateCoverLetterFlag) {
      console.log('[DEBUG] APIController: Starting cover letter generation');
      try {
        const coverLetterResult = await generationService.generateCoverLetter({
          jobDescription: jobData.jobDescription,
          companyName: jobData.companyName,
          jobTitle: jobData.jobTitle,
          validatedCVText,
          sourceFiles,
          sessionDir,
          logCallback: logAndSend
        });
        generatedDocuments.coverLetter = coverLetterResult;
        console.log('[DEBUG] APIController: Cover letter generation completed');
      } catch (error) {
        console.error('[DEBUG] APIController: Error in cover letter generation (streaming):', error);
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
    if (generateColdEmailFlag) {
      console.log('[DEBUG] APIController: Starting cold email generation');
      try {
        const coldEmailResult = await generationService.generateColdEmail({
          jobDescription: jobData.jobDescription,
          companyName: jobData.companyName,
          jobTitle: jobData.jobTitle,
          validatedCVText,
          sourceFiles,
          sessionDir,
          logCallback: logAndSend
        });
        generatedDocuments.coldEmail = coldEmailResult;
        console.log('[DEBUG] APIController: Cold email generation completed');
      } catch (error) {
        console.error('[DEBUG] APIController: Error in cold email generation (streaming):', error);
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
    console.log('[DEBUG] APIController: Building results object with jobData');
    const sanitizedSessionId = session.id.replace(/[^a-zA-Z0-9_-]/g, '_');
    const results = {
      cv: generatedDocuments.cv ? {
        content: generatedDocuments.cv.cvContent,
        success: generatedDocuments.cv.success,
        pageCount: generatedDocuments.cv.pageCount,
        attempts: generatedDocuments.cv.attempts,
        error: generatedDocuments.cv.error,
        changeSummary: generatedDocuments.cv.changeSummary,
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
      companyName: jobData.companyName,
      jobTitle: jobData.jobTitle
    };

    // Add assistant response to chat history with logs and results
    console.log('[DEBUG] APIController: Adding assistant response to chat history');
    await sessionService.addChatMessage(session.id, {
      role: 'assistant',
      content: 'Documents generated successfully',
      results: results,
      logs: logs
    });

    // Send completion event
    console.log('[DEBUG] APIController: Sending completion event to client');
    sendEvent('complete', {
      success: true,
      sessionId: session.id,
      companyName: jobData.companyName,
      jobTitle: jobData.jobTitle,
      results: results
    });

    console.log('[DEBUG] APIController: Streaming generation completed successfully');
    res.end();

  } catch (error) {
    console.error('[DEBUG] APIController: Error in streaming generation:', error);
    logAndSend(`Error: ${error.message}`, 'error');
    
    // Mark session as failed if it was created
    await handleSessionFailure(sessionId, sessionService, error);
    
    sendEvent('error', { error: 'Failed to generate documents', message: error.message });
    res.end();
  }
}

/**
 * Handle non-streaming generation (original implementation)
 */
async function handleNonStreamingGeneration(req, res, services) {
  const { fileService, sessionService } = services;
  const generationService = new GenerationService(services);
  
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
    const generateCoverLetterFlag = preferences?.coverLetter !== false;
    const generateColdEmailFlag = preferences?.coldEmail !== false;
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
    
    // Process input (detect URL and scrape if needed) - NEW: Returns structured jobData
    let jobData, isURLInput;
    try {
      console.log('[DEBUG] APIController (non-streaming): Calling generationService.processInput');
      const result = await generationService.processInput(input, (msg, level) => {
        console.log(level === 'error' ? `✗ ${msg}` : level === 'success' ? `✓ ${msg}` : msg);
      });
      jobData = result.jobData;
      isURLInput = result.isURLInput;
      console.log('[DEBUG] APIController (non-streaming): Received structured jobData from generationService');
      console.log(`[DEBUG] APIController (non-streaming): jobData fields: ${Object.keys(jobData).join(', ')}`);
    } catch (error) {
      console.error('[DEBUG] APIController (non-streaming): Error processing input:', error);
      return res.status(400).json({
        error: 'Failed to process input',
        message: error.message
      });
    }

    console.log('\n=== Starting Document Generation ===');
    console.log('Step 1: Loading source files...');
    
    // Load all source files
    const sourceFiles = await loadSourceFiles(fileService);
    console.log('✓ Source files loaded');

    console.log('\nStep 2: Extracting email addresses from jobData...');
    
    // Extract email addresses from job data
    const { emailAddresses } = await generationService.extractJobInfo(jobData, (msg, level) => {
      console.log(level === 'error' ? `✗ ${msg}` : level === 'success' ? `✓ ${msg}` : msg);
    });

    // Create or get session
    let session;
    try {
      console.log('\nStep 3: Creating/updating session...');
      session = await generationService.createOrUpdateSession({
        requestSessionId,
        jobDescription: jobData.jobDescription,
        companyName: jobData.companyName,
        jobTitle: jobData.jobTitle,
        emailAddresses
      });
      console.log(`✓ Session ready: ${session.id}`);
    } catch (error) {
      console.error('[DEBUG] APIController (non-streaming): Error creating/updating session:', error);
      return res.status(404).json({ error: error.message });
    }

    sessionId = session.id;
    const sessionDir = sessionService.getSessionDirectory(session.id);

    // Log to chat history
    await sessionService.logToChatHistory(session.id, `Starting document generation for ${jobData.companyName} - ${jobData.jobTitle}`);
    await sessionService.logToChatHistory(session.id, 'Loading source files...');
    await sessionService.logToChatHistory(session.id, '✓ Source files loaded successfully');

    // Add user message to session chat history (store original input)
    await sessionService.addChatMessage(session.id, {
      role: 'user',
      content: originalInput,
      isURL: isURLInput,
      extractedJobDescription: isURLInput && jobData.jobDescription.length > CHAT_MESSAGE_PREVIEW_LENGTH
        ? jobData.jobDescription.substring(0, CHAT_MESSAGE_PREVIEW_LENGTH) + '...'
        : isURLInput ? jobData.jobDescription : undefined
    });

    console.log('\nStep 4: Generating CV with advanced prompts and retry logic...');
    await sessionService.logToChatHistory(session.id, 'Starting CV generation with page validation...');

    // Generate CV using generation service with structured jobData
    try {
      const cvResult = await generationService.generateCV({
        jobDescription: jobData.jobDescription,
        companyName: jobData.companyName,
        jobTitle: jobData.jobTitle,
        sourceFiles,
        sessionDir,
        logCallback: (msg, level) => {
          const logMsg = level === 'error' ? `✗ ${msg}` : level === 'success' ? `✓ ${msg}` : msg;
          console.log(logMsg);
          sessionService.logToChatHistory(session.id, logMsg, level).catch(err => console.error('Log error:', err));
        }
      });
      generatedDocuments.cv = cvResult;
    } catch (error) {
      console.error('[DEBUG] APIController (non-streaming): Error in CV generation:', error);
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
    const validatedCVText = await generationService.extractCVText(
      generatedDocuments.cv?.pdfPath,
      generatedDocuments.cv?.cvContent || ''
    );

    // Generate cover letter (conditional)
    if (generateCoverLetterFlag) {
      console.log('\nStep 5: Generating cover letter...');
      await sessionService.logToChatHistory(session.id, 'Generating cover letter...');

      try {
        const coverLetterResult = await generationService.generateCoverLetter({
          jobDescription: jobData.jobDescription,
          companyName: jobData.companyName,
          jobTitle: jobData.jobTitle,
          validatedCVText,
          sourceFiles,
          sessionDir,
          logCallback: (msg, level) => {
            const logMsg = level === 'error' ? `✗ ${msg}` : level === 'success' ? `✓ ${msg}` : msg;
            console.log(logMsg);
            sessionService.logToChatHistory(session.id, logMsg, level).catch(err => console.error('Log error:', err));
          }
        });
        generatedDocuments.coverLetter = coverLetterResult;
      } catch (error) {
        console.error('[DEBUG] APIController (non-streaming): Error in cover letter generation:', error);
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
    if (generateColdEmailFlag) {
      console.log('\nStep 6: Generating cold email...');
      await sessionService.logToChatHistory(session.id, 'Generating cold email...');

      try {
        const coldEmailResult = await generationService.generateColdEmail({
          jobDescription: jobData.jobDescription,
          companyName: jobData.companyName,
          jobTitle: jobData.jobTitle,
          validatedCVText,
          sourceFiles,
          sessionDir,
          logCallback: (msg, level) => {
            const logMsg = level === 'error' ? `✗ ${msg}` : level === 'success' ? `✓ ${msg}` : msg;
            console.log(logMsg);
            sessionService.logToChatHistory(session.id, logMsg, level).catch(err => console.error('Log error:', err));
          }
        });
        generatedDocuments.coldEmail = coldEmailResult;
      } catch (error) {
        console.error('[DEBUG] APIController (non-streaming): Error in cold email generation:', error);
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
        changeSummary: generatedDocuments.cv.changeSummary,
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
      companyName: jobData.companyName,
      jobTitle: jobData.jobTitle
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
      companyName: jobData.companyName,
      jobTitle: jobData.jobTitle,
      results,
      aiFailureMessage: aiFailureOccurred ? aiFailureMessage : undefined
    };

    res.json(responseData);

  } catch (error) {
    console.error('[DEBUG] APIController (non-streaming): Error in /api/generate:', error);
    
    // Mark session as failed if it was created
    await handleSessionFailure(sessionId, sessionService, error);
    
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
  const failedLogs = []; // Store failed log writes for potential retry
  
  // Helper to log and send event - also writes to session logs.jsonl
  const logAndSend = (message, level = 'info') => {
    const logEntry = { message, level, timestamp: new Date().toISOString() };
    logs.push(logEntry);
    if (sendEvent) {
      sendEvent('log', logEntry);
    } else {
      console.log(`[${level.toUpperCase()}] ${message}`);
    }
    // Write to session logs if session exists
    if (sessionId) {
      sessionService.logToChatHistory(sessionId, message, level).catch(err => {
        console.error('Failed to log to chat history:', err);
        // Store failed log for potential retry
        failedLogs.push(logEntry);
      });
    }
  };

  try {
    const { input: rawInput, sessionId: requestSessionId, preferences } = req.body;
    
    if (!rawInput) {
      const error = { error: 'Missing required field: input (company name or cold outreach details) is required' };
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
    
    // PART 2.1: Create session immediately at the start
    let session;
    if (requestSessionId) {
      // Using existing session
      session = await sessionService.getSession(requestSessionId);
      if (!session) {
        const error = { error: 'Session not found' };
        if (sendEvent) {
          sendEvent('error', error);
          return res.end();
        }
        return res.status(404).json(error);
      }
      console.log(`[DEBUG] Cold Outreach: Using existing session: ${session.id}`);
    } else {
      // Create new session immediately with minimal data
      console.log('[DEBUG] Cold Outreach: Creating new session immediately');
      session = await sessionService.createSession({
        companyName: 'Processing',
        jobTitle: 'Cold Outreach',
        mode: 'cold_outreach'
      });
      console.log(`[DEBUG] Cold Outreach: ✓ Session created immediately: ${session.id}`);
    }
    
    sessionId = session.id;
    
    // PART 2.2: Send session ID as first SSE event
    if (sendEvent) {
      sendEvent('session', { sessionId: session.id });
    }
    console.log(`[DEBUG] Cold Outreach: ✓ Session ID sent to client: ${session.id}`);
    
    // PART 2.3: Persist user message immediately
    console.log('[DEBUG] Cold Outreach: Persisting user message to chat history');
    await sessionService.addChatMessage(session.id, {
      role: 'user',
      content: rawInput,
      mode: 'cold_outreach',
      timestamp: new Date().toISOString()
    });
    console.log('[DEBUG] Cold Outreach: ✓ User message persisted');
    
    const generationService = new GenerationService(services);
    logAndSend(`Starting cold outreach workflow for: ${rawInput}`, 'info');

    // Parse the input to extract structured information
    logAndSend('Parsing input to extract company, contact, and role context...', 'info');
    const parsedInput = await aiService.parseColdOutreachInput(rawInput);
    const companyName = parsedInput.companyName;
    const targetPersonFromInput = parsedInput.targetPerson;
    const roleContext = parsedInput.roleContext;
    
    if (targetPersonFromInput) {
      logAndSend(`✓ Target person identified: ${targetPersonFromInput}`, 'success');
    }
    if (roleContext) {
      logAndSend(`✓ Role context identified: ${roleContext}`, 'success');
    }
    logAndSend(`✓ Company: ${companyName}`, 'success');

    // NEW STRATEGIC WORKFLOW: AI-Powered Research Instead of Guessing
    console.log('[DEBUG] Starting NEW strategic research workflow');
    
    // Step 1: Load source files (including recon strategy)
    console.log('[DEBUG] Step 1: Loading source files including recon_strat.txt');
    logAndSend('Step 1: Loading source files and reconnaissance strategy...', 'info');
    const sourceFiles = await loadSourceFiles(fileService);
    logAndSend('✓ Source files loaded', 'success');
    
    // Step 2: Conduct AI-powered research using web search
    console.log('[DEBUG] Step 2: Conducting AI-powered research with web search');
    logAndSend('Step 2: Conducting deep AI-powered research on company...', 'info');
    logAndSend('Using strategic reconnaissance to identify decision-makers and opportunities...', 'info');
    
    const research = await generationService.researchCompanyAndIdentifyPeople({
      companyName,
      originalCV: sourceFiles.originalCV,
      reconStrategy: sourceFiles.reconStrategy,
      roleContext,
      logCallback: logAndSend
    });
    
    // Extract key information from research
    const companyDomain = research.company_intelligence.domain;
    const companyProfile = {
      description: research.company_intelligence.description,
      contactEmail: research.company_intelligence.genericEmail
    };
    
    // Log domain extraction
    if (companyDomain) {
      logAndSend(`✓ Company domain identified: ${companyDomain}`, 'success');
    } else {
      logAndSend('⚠ Warning: No company domain found in research results', 'warning');
    }
    
    // Extract decision makers from research results
    const decisionMakers = research.decision_makers || [];
    console.log(`[DEBUG] Research identified ${decisionMakers.length} decision makers`);
    
    // Extract target personas (job titles) from decision makers for Apollo search
    const targetPersonas = decisionMakers.length > 0 
      ? decisionMakers.map(dm => dm.title)
      : FALLBACK_TARGET_PERSONAS; // Fallback if AI didn't find any
    
    console.log(`[DEBUG] Target personas for Apollo: ${targetPersonas.join(', ')}`);
    logAndSend(`✓ Identified ${decisionMakers.length} high-level decision-makers from research`, 'success');
    if (decisionMakers.length > 0) {
      logAndSend(`Decision-makers: ${decisionMakers.map(dm => `${dm.name} (${dm.title})`).join(', ')}`, 'info');
    }
    // Step 4: Search Apollo for contact using ENHANCED Target Acquisition Algorithm
    let apolloContact = null;
    let apolloError = null;
    
    if (apolloService.isEnabled()) {
      try {
        logAndSend('Step 4: Starting Enhanced Target Acquisition Algorithm...', 'info');
        
        // PROACTIVE AI INTELLIGENCE: Use AI research to find executive names
        // Priority: User input > AI-discovered decision makers
        let targetName = targetPersonFromInput;
        
        if (!targetName && decisionMakers.length > 0) {
          targetName = decisionMakers[0].name;
          logAndSend(`✓ AI proactively identified target: ${targetName} (${decisionMakers[0].title})`, 'success');
        }
        
        if (targetName) {
          logAndSend(`Initiating multi-stage search for: ${targetName}`, 'info');
          apolloContact = await apolloService.findContact(targetName, companyName, companyDomain, logAndSend);
        } else {
          logAndSend('⚠ No specific target person identified (neither from user nor AI research)', 'warning');
        }
        
        if (apolloContact) {
          logAndSend(`✓ Target acquired! Found ${apolloContact.name} (${apolloContact.title}) with email ${apolloContact.email}`, 'success');
        } else if (targetName) {
          logAndSend('✗ Target Acquisition completed but no contact with email found', 'warning');
        }
        
      } catch (error) {
        console.error('[DEBUG] Apollo.io Target Acquisition error:', error);
        logAndSend(`✗ Apollo.io Target Acquisition failed: ${error.message}`, 'error');
        apolloError = error.message;
      }
    } else {
      logAndSend('Step 4: Apollo.io integration disabled (API key not configured)', 'info');
    }

    // Update session with parsed information
    const sessionTitle = roleContext 
      ? `${companyName} - ${roleContext}`
      : `${companyName} - Cold Outreach`;
    
    console.log('[DEBUG] Cold Outreach: Updating session with parsed information');
    await sessionService.updateSession(session.id, {
      companyName: companyName,
      jobTitle: roleContext || 'Cold Outreach',
      companyInfo: sessionTitle,
      mode: 'cold_outreach'
    });
    console.log('[DEBUG] Cold Outreach: Session updated with company info');

    const sessionDir = sessionService.getSessionDirectory(session.id);

    // Update user message with parsed information
    await sessionService.addChatMessage(session.id, {
      role: 'system',
      content: 'Input parsed',
      parsedInput: { companyName, targetPerson: targetPersonFromInput, roleContext }
    });

    // Step 5: Generate CV tailored to company
    try {
      // Use company profile and role context as "job description" for CV generation
      let syntheticJobDescription = companyProfile.description;
      if (roleContext) {
        syntheticJobDescription += `\n\nTarget Role: ${roleContext}`;
      }
      syntheticJobDescription += `\n\nTarget Personas: ${targetPersonas.join(', ')}`;
      
      const cvResult = await generationService.generateCV({
        jobDescription: syntheticJobDescription,
        companyName: companyName,
        jobTitle: 'Cold Outreach',
        sourceFiles,
        sessionDir,
        logCallback: logAndSend
      });
      generatedDocuments.cv = cvResult;
    } catch (error) {
      console.error('[DEBUG] Error in CV generation (cold outreach):', error);
      if (error.isAIFailure) {
        logAndSend(`✗ CV generation failed: ${error.message}`, 'error');
      } else {
        throw error;
      }
    }

    // Extract CV text for email generation
    const validatedCVText = await generationService.extractCVText(
      generatedDocuments.cv?.pdfPath,
      generatedDocuments.cv?.cvContent || ''
    );

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
        // Use the found domain if available, otherwise fallback to sanitized company name
        let genericEmail;
        if (companyDomain) {
          genericEmail = companyProfile.contactEmail || `info@${companyDomain}`;
          logAndSend(`Using domain-based email: ${genericEmail}`, 'info');
        } else {
          // Fallback: sanitize company name for email
          const sanitizedCompanyName = companyName
            .toLowerCase()
            .replace(/[^a-z0-9]/g, '')
            .substring(0, 50); // Limit length
          genericEmail = companyProfile.contactEmail || `info@${sanitizedCompanyName}.com`;
          logAndSend(`Using fallback email based on company name: ${genericEmail}`, 'info');
        }
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
      console.error('[DEBUG] Error in cold email generation (cold outreach):', error);
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
        changeSummary: generatedDocuments.cv.changeSummary,
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
    await handleSessionFailure(sessionId, sessionService, error);
    
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
