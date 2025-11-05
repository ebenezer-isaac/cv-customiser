import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { AIService } from '@/lib/services/aiService';
import { FileService } from '@/lib/services/fileService';
import { DocumentService } from '@/lib/services/documentService';
import { SessionService } from '@/lib/services/sessionService';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

const aiService = new AIService();
const fileService = new FileService();
const documentService = new DocumentService(fileService);
const sessionService = new SessionService(fileService);

/**
 * POST /api/refine
 * Refine generated content based on user feedback
 * Protected by Firebase authentication
 */
export const POST = withAuth(async (request: NextRequest, context: any, userId: string) => {
  let tempDir: string | null = null;
  
  try {
    const body = await request.json();
    const { sessionId, contentType, feedback } = body;

    if (!sessionId || !contentType || !feedback) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, contentType, and feedback are required' },
        { status: 400 }
      );
    }

    const session = await sessionService.getSession(userId, sessionId);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Check if session is locked
    if (await sessionService.isSessionLocked(userId, sessionId)) {
      return NextResponse.json(
        { error: 'Session is locked (approved). Cannot modify approved sessions.' },
        { status: 403 }
      );
    }

    // Get the current content based on type
    let currentContent = '';
    let filePath = '';

    if (contentType === 'cv') {
      if (!session.generatedFiles?.cv?.texPath) {
        return NextResponse.json(
          { error: 'CV not found in session' },
          { status: 404 }
        );
      }
      filePath = session.generatedFiles.cv.texPath;
    } else if (contentType === 'cover_letter') {
      if (!session.generatedFiles?.coverLetter?.path) {
        return NextResponse.json(
          { error: 'Cover letter not found in session' },
          { status: 404 }
        );
      }
      filePath = session.generatedFiles.coverLetter.path;
    } else if (contentType === 'cold_email') {
      if (!session.generatedFiles?.coldEmail?.path) {
        return NextResponse.json(
          { error: 'Cold email not found in session' },
          { status: 404 }
        );
      }
      filePath = session.generatedFiles.coldEmail.path;
    } else {
      return NextResponse.json(
        { error: 'Invalid contentType. Must be one of: cv, cover_letter, cold_email' },
        { status: 400 }
      );
    }

    try {
      currentContent = await fileService.readFileFromStorage(filePath);
    } catch (error) {
      return NextResponse.json(
        { error: 'Content file not found for this session' },
        { status: 404 }
      );
    }

    // Add feedback to chat history
    await sessionService.addChatMessage(userId, sessionId, {
      role: 'user',
      content: `Refine ${contentType}: ${feedback}`
    });

    await sessionService.logToChatHistory(userId, sessionId, `Refining ${contentType}: ${feedback}`);

    // Get chat history for context
    const chatHistory = session.chatHistory || [];

    // Refine using advanced prompt
    const refinedContent = await aiService.refineContentAdvanced({
      content: currentContent,
      feedback,
      contentType,
      chatHistory
    });

    // Save refined content back to Firebase Storage
    await fileService.writeFileToStorage(filePath, refinedContent);

    await sessionService.logToChatHistory(userId, sessionId, `✓ ${contentType} refined successfully`, 'success');

    // If refining CV, recompile and validate
    if (contentType === 'cv') {
      await sessionService.logToChatHistory(userId, sessionId, 'Recompiling CV...');
      
      // Create temporary directory for LaTeX compilation
      tempDir = path.join(os.tmpdir(), `cv-refine-${Date.now()}`);
      await fs.mkdir(tempDir, { recursive: true });
      
      // Write LaTeX content to temp file
      const tempTexPath = path.join(tempDir, 'cv.tex');
      await fs.writeFile(tempTexPath, refinedContent);
      
      const compileResult = await documentService.compileLatexToPdf(tempTexPath, tempDir, 1);
      
      if (compileResult.success) {
        // Upload recompiled PDF to Firebase Storage
        if (compileResult.pdfPath) {
          const pdfBuffer = await fs.readFile(compileResult.pdfPath);
          const pdfStoragePath = session.generatedFiles.cv.pdfPath;
          if (pdfStoragePath) {
            await fileService.writeFileToStorage(pdfStoragePath, pdfBuffer);
          }
        }
        
        await sessionService.logToChatHistory(userId, sessionId, `✓ CV recompiled (${compileResult.pageCount} pages)`, 'success');
      } else {
        await sessionService.logToChatHistory(userId, sessionId, `⚠ CV compilation warning: ${compileResult.message}`, 'error');
      }
      
      // Clean up temp directory
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }

    // Add assistant response to chat history
    await sessionService.addChatMessage(userId, sessionId, {
      role: 'assistant',
      content: `${contentType} has been refined based on your feedback`
    });

    return NextResponse.json({
      success: true,
      message: 'Content refined successfully',
      sessionId,
      contentType,
      refinedContent
    });

  } catch (error: any) {
    console.error('Error in /api/refine:', error);
    
    // Clean up temp directory on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to refine content', message: error.message },
      { status: 500 }
    );
  }
});
