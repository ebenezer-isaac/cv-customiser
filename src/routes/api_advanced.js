const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const { Document, Paragraph, TextRun, AlignmentType, Packer } = require('docx');
const { handleStreamingGeneration, handleNonStreamingGeneration, handleColdOutreachPath, EXTENSIVE_CV_EXTENSIONS } = require('../controllers/apiController');

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

function createApiRoutes(services) {
  const router = express.Router();
  const { aiService, fileService, documentService, sessionService } = services;

  /**
   * POST /api/generate
   * Generate CV, cover letter, and cold email using sophisticated AI prompts
   * Supports Server-Sent Events for real-time progress streaming
   * Supports cold outreach mode when mode='cold_outreach' is set
   */
  router.post('/generate', upload.single('cvFile'), async (req, res) => {
    // Check if this is a cold outreach request
    const mode = req.body.mode;
    
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
      
      // Route to appropriate handler based on mode
      if (mode === 'cold_outreach') {
        return handleColdOutreachPath(req, res, sendEvent, services);
      } else {
        return handleStreamingGeneration(req, res, sendEvent, services);
      }
    }
    
    // Non-streaming fallback
    if (mode === 'cold_outreach') {
      return handleColdOutreachPath(req, res, null, services);
    } else {
      return handleNonStreamingGeneration(req, res, services);
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
    const { session_id } = req.params;
    try {
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
   * GET /api/history/:session_id/logs
   * Get logs (chat_history.json) for a specific session
   */
  router.get('/history/:session_id/logs', async (req, res) => {
    const { session_id } = req.params;
    try {
      // Check if session exists
      const session = await sessionService.getSession(session_id);
      if (!session) {
        return res.status(404).json({
          error: 'Session not found'
        });
      }

      // Get the chat history from file
      const logs = await sessionService.getChatHistoryFromFile(session_id);

      res.json({
        success: true,
        logs
      });
    } catch (error) {
      console.error('Error in /api/history/:session_id/logs:', error);
      res.status(500).json({
        error: 'Failed to retrieve logs',
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
      let currentContent = '';
      let filePath = '';

      if (contentType === 'cv') {
        if (!session.generatedFiles?.cv?.texPath) {
          return res.status(404).json({
            error: 'CV not found in session'
          });
        }
        filePath = session.generatedFiles.cv.texPath;
      } else if (contentType === 'cover_letter') {
        if (!session.generatedFiles?.coverLetter?.path) {
          return res.status(404).json({
            error: 'Cover letter not found in session'
          });
        }
        filePath = session.generatedFiles.coverLetter.path;
      } else if (contentType === 'cold_email') {
        if (!session.generatedFiles?.coldEmail?.path) {
          return res.status(404).json({
            error: 'Cold email not found in session'
          });
        }
        filePath = session.generatedFiles.coldEmail.path;
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
        
        const sessionDir = sessionService.getSessionDirectory(sessionId);
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
   * Upload and replace source documents (original_cv.txt or extensive_cv.doc)
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
        targetFilename = 'original_cv.txt';
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
   * POST /save-source-cv
   * Save CV content directly from text area as .txt file
   */
  router.post('/save-source-cv', async (req, res) => {
    try {
      const { docType, content } = req.body;
      
      if (!docType || !['original_cv', 'extensive_cv'].includes(docType)) {
        return res.status(400).json({
          error: 'Invalid docType. Must be either "original_cv" or "extensive_cv"'
        });
      }

      if (content === undefined || content === null) {
        return res.status(400).json({
          error: 'Content is required'
        });
      }

      // Determine target filename and path - always save as .txt
      const targetFilename = `${docType}.txt`;
      const sourceDir = path.join(process.cwd(), 'source_files');
      const targetPath = path.join(sourceDir, targetFilename);

      // Ensure source_files directory exists
      await fileService.ensureDirectory(sourceDir);

      // For extensive_cv, clean up old files with different extensions
      if (docType === 'extensive_cv') {
        for (const checkExt of EXTENSIVE_CV_EXTENSIONS) {
          if (checkExt !== '.txt') {
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

      // For original_cv, also clean up old .tex file if switching to .txt
      if (docType === 'original_cv') {
        const oldTexPath = path.join(sourceDir, 'original_cv.txt');
        try {
          if (await fileService.fileExists(oldTexPath)) {
            await fs.unlink(oldTexPath);
            console.log('✓ Removed old original_cv.txt file');
          }
        } catch (error) {
          console.warn('Could not remove old original_cv.txt:', error.message);
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
      await fs.writeFile(targetPath, content, 'utf8');
      console.log(`✓ Saved ${docType} to ${targetPath}`);

      res.json({
        success: true,
        message: `${docType} saved successfully`,
        filename: targetFilename,
        path: targetPath
      });

    } catch (error) {
      console.error('Error in /api/save-source-cv:', error);
      res.status(500).json({
        error: 'Failed to save CV content',
        message: error.message
      });
    }
  });

  /**
   * GET /load-source-cv/:docType
   * Load CV content from .txt file
   */
  router.get('/load-source-cv/:docType', async (req, res) => {
    try {
      const { docType } = req.params;
      
      if (!docType || !['original_cv', 'extensive_cv'].includes(docType)) {
        return res.status(400).json({
          error: 'Invalid docType. Must be either "original_cv" or "extensive_cv"'
        });
      }

      const sourceDir = path.join(process.cwd(), 'source_files');
      
      // Try to load .txt file first
      let filePath = path.join(sourceDir, `${docType}.txt`);
      let exists = await fileService.fileExists(filePath);
      
      // If .txt doesn't exist, try legacy formats for backward compatibility
      if (!exists) {
        if (docType === 'original_cv') {
          // Check for .tex file
          const texPath = path.join(sourceDir, 'original_cv.txt');
          if (await fileService.fileExists(texPath)) {
            filePath = texPath;
            exists = true;
          }
        } else if (docType === 'extensive_cv') {
          // Check for .doc, .docx, or .txt
          for (const ext of EXTENSIVE_CV_EXTENSIONS) {
            const legacyPath = path.join(sourceDir, `extensive_cv${ext}`);
            if (await fileService.fileExists(legacyPath)) {
              filePath = legacyPath;
              exists = true;
              break;
            }
          }
        }
      }
      
      if (!exists) {
        return res.json({
          success: true,
          content: '',
          message: 'No existing content found'
        });
      }

      // Read the file - use fileService for .doc/.docx, direct read for text files
      let content = '';
      const ext = path.extname(filePath).toLowerCase();
      
      if (ext === '.txt' || ext === '.tex') {
        content = await fs.readFile(filePath, 'utf8');
      } else if (ext === '.doc' || ext === '.docx') {
        // For Word documents, read and extract text
        content = await fileService.readFile(filePath);
      }
      
      res.json({
        success: true,
        content: content,
        message: `${docType} loaded successfully`
      });

    } catch (error) {
      console.error('Error in /load-source-cv:', error);
      res.status(500).json({
        error: 'Failed to load CV content',
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

      // Get session
      const session = await sessionService.getSession(sessionId);
      if (!session) {
        return res.status(404).json({ error: 'Session not found' });
      }
      
      // Determine file path based on content type
      let filePath;
      if (contentType === 'coverLetter') {
        if (!session.generatedFiles?.coverLetter?.path) {
          return res.status(404).json({
            error: 'Cover letter not found in session'
          });
        }
        filePath = session.generatedFiles.coverLetter.path;
      } else if (contentType === 'coldEmail') {
        if (!session.generatedFiles?.coldEmail?.path) {
          return res.status(404).json({
            error: 'Cold email not found in session'
          });
        }
        filePath = session.generatedFiles.coldEmail.path;
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

      // Get the actual file path from session.generatedFiles
      if (!session.generatedFiles?.coverLetter?.path) {
        return res.status(404).json({ error: 'Cover letter not found in session' });
      }

      const coverLetterPath = session.generatedFiles.coverLetter.path;
      
      // Check if file exists
      if (!await fileService.fileExists(coverLetterPath)) {
        return res.status(404).json({ error: 'Cover letter file not found' });
      }

      // Read content
      const content = await fileService.readFile(coverLetterPath);
      
      // Convert content to Word document
      // Split content into paragraphs (separated by blank lines)
      const paragraphs = content.split(/\n\n+/)
        .map(para => para.trim())
        .filter(para => para.length > 0)
        .map(para => {
          return new Paragraph({
            children: [new TextRun(para)],
            spacing: {
              after: 200, // Add spacing after each paragraph
            },
          });
        });

      // Create a new Word document
      const doc = new Document({
        sections: [{
          properties: {},
          children: paragraphs,
        }],
      });

      // Generate the .docx file as a buffer
      const buffer = await Packer.toBuffer(doc);
      
      const fileName = `${sessionId}_CoverLetter.docx`;
      
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);

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

      // Get the actual file path from session.generatedFiles
      if (!session.generatedFiles?.coldEmail?.path) {
        return res.status(404).json({ error: 'Cold email not found in session' });
      }

      const coldEmailPath = session.generatedFiles.coldEmail.path;
      
      // Check if file exists
      if (!await fileService.fileExists(coldEmailPath)) {
        return res.status(404).json({ error: 'Cold email file not found' });
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
