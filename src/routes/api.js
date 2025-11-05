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

  /**
   * POST /api/generate
   * Generate CV, cover letter, and cold email for a job application
   */
  router.post('/generate', upload.single('cvFile'), async (req, res) => {
    try {
      const { jobDescription, companyInfo, sessionId } = req.body;
      
      // Validate required fields
      if (!jobDescription || !companyInfo) {
        return res.status(400).json({
          error: 'Missing required fields: jobDescription and companyInfo are required'
        });
      }

      // Get or create session
      let session;
      if (sessionId) {
        session = await sessionService.getSession(sessionId);
        if (!session) {
          return res.status(404).json({ error: 'Session not found' });
        }
      } else {
        session = await sessionService.createSession({
          jobDescription,
          companyInfo
        });
      }

      const sessionDir = sessionService.getSessionDirectory(session.id);

      // Read CV context from uploaded file or use default
      let cvContext = '';
      if (req.file) {
        try {
          cvContext = await fileService.readFile(req.file.path);
          // Save uploaded file to session directory
          const savedPath = path.join(sessionDir, 'source_cv' + path.extname(req.file.originalname));
          await fileService.writeFile(savedPath, cvContext);
          // Clean up temp file
          const fs = require('fs').promises;
          await fs.unlink(req.file.path);
        } catch (error) {
          console.error('Error reading uploaded file:', error);
          cvContext = 'Professional with diverse experience in software development and project management.';
        }
      } else {
        cvContext = 'Professional with diverse experience in software development and project management.';
      }

      // Add generation request to chat history
      await sessionService.addChatMessage(session.id, {
        role: 'user',
        content: `Generate application documents for: ${companyInfo}`
      });

      console.log(`\nStarting document generation for session ${session.id}...`);

      // Generate CV with retry logic
      const cvResult = await documentService.generateCVWithRetry(aiService, {
        jobDescription,
        companyInfo,
        cvContext,
        outputDir: sessionDir
      });

      // Generate cover letter
      console.log('\nGenerating cover letter...');
      const coverLetterContent = await aiService.generateCoverLetter({
        jobDescription,
        companyInfo,
        cvContext
      });
      const coverLetterPath = await documentService.saveCoverLetter(coverLetterContent, sessionDir);

      // Generate cold email
      console.log('\nGenerating cold email...');
      const coldEmailContent = await aiService.generateColdEmail({
        jobDescription,
        companyInfo,
        cvContext
      });
      const coldEmailPath = await documentService.saveColdEmail(coldEmailContent, sessionDir);

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

      // Add response to chat history
      await sessionService.addChatMessage(session.id, {
        role: 'assistant',
        content: `Documents generated successfully. CV: ${cvResult.success ? 'Success' : 'Generated with warnings'}, Cover Letter: Complete, Cold Email: Complete`
      });

      console.log('\n✓ All documents generated successfully');

      // Return response
      res.json({
        success: true,
        sessionId: session.id,
        message: 'Documents generated successfully',
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

      res.json({
        success: true,
        session
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
   * Refine generated content based on user feedback (placeholder)
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

      // Add feedback to chat history
      await sessionService.addChatMessage(sessionId, {
        role: 'user',
        content: `Refine ${contentType}: ${feedback}`
      });

      // Placeholder response - actual refinement would be implemented here
      res.json({
        success: true,
        message: 'Refinement request received. This feature is currently in development.',
        sessionId,
        contentType,
        feedback
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
   * Approve a session
   */
  router.post('/approve/:session_id', async (req, res) => {
    try {
      const { session_id } = req.params;
      const session = await sessionService.approveSession(session_id);
      
      res.json({
        success: true,
        message: 'Session approved',
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
