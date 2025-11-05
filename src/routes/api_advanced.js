const express = require('express');
const multer = require('multer');
const path = require('path');

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

function createApiRoutes(services) {
  const router = express.Router();
  const { aiService, fileService, documentService, sessionService } = services;

  // Source files paths
  const SOURCE_FILES = {
    originalCV: path.join(process.cwd(), 'source_files', 'original_cv.tex'),
    extensiveCV: path.join(process.cwd(), 'source_files', 'extensive_cv.doc'),
    cvStrategy: path.join(process.cwd(), 'source_files', 'cv_strat.pdf'),
    coverLetterStrategy: path.join(process.cwd(), 'source_files', 'cover_letter.pdf'),
    coldEmailStrategy: path.join(process.cwd(), 'source_files', 'cold_mail.pdf')
  };

  /**
   * Load all source files
   */
  async function loadSourceFiles() {
    try {
      const [originalCV, extensiveCV, cvStrategy, coverLetterStrategy, coldEmailStrategy] = await Promise.all([
        fileService.readFile(SOURCE_FILES.originalCV),
        fileService.readFile(SOURCE_FILES.extensiveCV),
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
   */
  router.post('/generate', upload.single('cvFile'), async (req, res) => {
    try {
      const { jobDescription, sessionId } = req.body;
      
      // Validate required fields
      if (!jobDescription) {
        return res.status(400).json({
          error: 'Missing required field: jobDescription is required'
        });
      }

      // Check if session exists and is locked
      if (sessionId) {
        const existingSession = await sessionService.getSession(sessionId);
        if (existingSession && await sessionService.isSessionLocked(sessionId)) {
          return res.status(403).json({
            error: 'Session is locked (approved). Cannot modify approved sessions.'
          });
        }
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

      // Create or get session
      let session;
      if (sessionId) {
        session = await sessionService.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
        // Update with new job details
        await sessionService.updateSession(sessionId, {
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`
        });
      } else {
        console.log('\nStep 3: Creating session directory...');
        session = await sessionService.createSession({
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`
        });
        console.log(`✓ Created session: ${session.id}`);
      }

      const sessionDir = sessionService.getSessionDirectory(session.id);

      // Log to chat history
      await sessionService.logToChatHistory(session.id, `Starting document generation for ${jobDetails.companyName} - ${jobDetails.jobTitle}`);
      await sessionService.logToChatHistory(session.id, 'Loading source files...');
      await sessionService.logToChatHistory(session.id, '✓ Source files loaded successfully');

      // Add user message to session chat history
      await sessionService.addChatMessage(session.id, {
        role: 'user',
        content: `Generate application documents for ${jobDetails.companyName} - ${jobDetails.jobTitle}\n\nJob Description:\n${jobDescription}`
      });

      console.log('\nStep 4: Generating CV with advanced prompts and retry logic...');
      await sessionService.logToChatHistory(session.id, 'Starting CV generation with page validation...');

      // Generate CV using advanced method with retry logic
      const cvResult = await documentService.generateCVWithAdvancedRetry(aiService, {
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
      } else {
        await sessionService.logToChatHistory(session.id, `⚠ CV generated with warnings: ${cvResult.error}`, 'error');
      }

      // Extract text from generated CV PDF for use in cover letter and email
      let validatedCVText = '';
      if (cvResult.pdfPath) {
        try {
          validatedCVText = await documentService.extractPdfText(cvResult.pdfPath);
        } catch (error) {
          console.error('Error extracting PDF text:', error);
          // Fallback to using the LaTeX content
          validatedCVText = cvResult.cvContent;
        }
      } else {
        validatedCVText = cvResult.cvContent;
      }

      console.log('\nStep 5: Generating cover letter...');
      await sessionService.logToChatHistory(session.id, 'Generating cover letter...');

      const coverLetterContent = await aiService.generateCoverLetterAdvanced({
        jobDescription,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        validatedCVText,
        coverLetterStrategy: sourceFiles.coverLetterStrategy
      });
      
      const coverLetterPath = await documentService.saveCoverLetter(coverLetterContent, sessionDir);
      await sessionService.logToChatHistory(session.id, '✓ Cover letter generated', 'success');

      console.log('\nStep 6: Generating cold email...');
      await sessionService.logToChatHistory(session.id, 'Generating cold email...');

      const coldEmailContent = await aiService.generateColdEmailAdvanced({
        jobDescription,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        validatedCVText,
        coldEmailStrategy: sourceFiles.coldEmailStrategy
      });
      
      const coldEmailPath = await documentService.saveColdEmail(coldEmailContent, sessionDir);
      await sessionService.logToChatHistory(session.id, '✓ Cold email generated', 'success');

      // Update session with generated files
      const generatedFiles = {
        cv: {
          texPath: cvResult.texPath,
          pdfPath: cvResult.pdfPath,
          pageCount: cvResult.pageCount,
          attempts: cvResult.attempts,
          success: cvResult.success
        },
        coverLetter: {
          path: coverLetterPath
        },
        coldEmail: {
          path: coldEmailPath
        }
      };

      await sessionService.completeSession(session.id, generatedFiles);
      await sessionService.logToChatHistory(session.id, '✓ All documents generated successfully', 'success');

      // Add assistant response to chat history
      await sessionService.addChatMessage(session.id, {
        role: 'assistant',
        content: `Documents generated successfully!\n\n**CV**: ${cvResult.success ? 'Generated successfully' : 'Generated with warnings'} (${cvResult.pageCount || 'unknown'} pages, ${cvResult.attempts} attempt(s))\n\n**Cover Letter**:\n${coverLetterContent}\n\n**Cold Email**:\n${coldEmailContent}`
      });

      console.log('\n=== Generation Complete ===\n');

      // Return response
      res.json({
        success: true,
        sessionId: session.id,
        message: 'Documents generated successfully',
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        results: {
          cv: {
            content: cvResult.cvContent,
            success: cvResult.success,
            pageCount: cvResult.pageCount,
            attempts: cvResult.attempts,
            error: cvResult.error
          },
          coverLetter: {
            content: coverLetterContent
          },
          coldEmail: {
            content: coldEmailContent
          }
        }
      });

    } catch (error) {
      console.error('Error in /api/generate:', error);
      res.status(500).json({
        error: 'Failed to generate documents',
        message: error.message
      });
    }
  });

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

  return router;
}

module.exports = createApiRoutes;
