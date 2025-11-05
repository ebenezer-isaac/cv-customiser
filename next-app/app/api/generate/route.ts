import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { AIService } from '@/lib/services/aiService';
import { FileService } from '@/lib/services/fileService';
import { DocumentService } from '@/lib/services/documentService';
import { SessionService } from '@/lib/services/sessionService';
import { isURL, scrapeURL } from '@/lib/utils/urlUtils';
import { loadSourceFiles } from '@/lib/utils/sourceFiles';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs/promises';

const aiService = new AIService();
const fileService = new FileService();
const documentService = new DocumentService(fileService);
const sessionService = new SessionService(fileService);

/**
 * POST /api/generate
 * Generate CV, cover letter, and cold email using sophisticated AI prompts
 * Protected by Firebase authentication
 */
export const POST = withAuth(async (request: NextRequest, context: any, userId: string) => {
  let tempDir: string | null = null;
  
  try {
    const body = await request.json();
    const { input, sessionId: requestSessionId, preferences } = body;
    
    if (!input) {
      return NextResponse.json(
        { error: 'Missing required field: input is required' },
        { status: 400 }
      );
    }

    // Parse generation preferences (default all true except apollo)
    const generateCoverLetter = preferences?.coverLetter !== false;
    const generateColdEmail = preferences?.coldEmail !== false;

    // Check if session exists and is locked
    if (requestSessionId) {
      const existingSession = await sessionService.getSession(userId, requestSessionId);
      if (existingSession && await sessionService.isSessionLocked(userId, requestSessionId)) {
        return NextResponse.json(
          { error: 'Session is locked (approved)' },
          { status: 403 }
        );
      }
    }

    // Store the original input for display
    const originalInput = input;
    
    // Detect if input is a URL and scrape if needed
    let jobDescription: string;
    let isURLInput = false;
    
    if (isURL(input)) {
      isURLInput = true;
      try {
        const scrapedContent = await scrapeURL(input);
        
        // Use AI to extract clean job description from scraped HTML
        jobDescription = await aiService.extractJobDescriptionContent(scrapedContent);
      } catch (error: any) {
        return NextResponse.json(
          { error: 'Failed to scrape URL', message: error.message },
          { status: 400 }
        );
      }
    } else {
      jobDescription = input;
    }

    // Load source files from Firebase Storage
    const sourceFiles = await loadSourceFiles(userId, fileService);

    // Extract job details
    const jobDetails = await aiService.extractJobDetails(jobDescription);

    // Extract email addresses from job description
    const emailAddresses = await aiService.extractEmailAddresses(jobDescription);

    // Create or get session
    let session;
    if (requestSessionId) {
      session = await sessionService.getSession(userId, requestSessionId);
      if (!session) {
        return NextResponse.json(
          { error: 'Session not found' },
          { status: 404 }
        );
      }
      await sessionService.updateSession(userId, requestSessionId, {
        jobDescription,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
      });
    } else {
      session = await sessionService.createSession(userId, {
        jobDescription,
        companyName: jobDetails.companyName,
        jobTitle: jobDetails.jobTitle,
        companyInfo: `${jobDetails.companyName} - ${jobDetails.jobTitle}`,
      });
    }

    const sessionId = session.id;
    const sessionStoragePath = sessionService.getSessionStoragePath(userId, sessionId);

    // Add user message to session chat history
    await sessionService.addChatMessage(userId, sessionId, {
      role: 'user',
      content: originalInput
    });

    // Create temporary directory for LaTeX compilation
    tempDir = path.join(os.tmpdir(), `cv-gen-${Date.now()}`);
    await fs.mkdir(tempDir, { recursive: true });

    // Generate CV
    const cvResult = await documentService.generateCVWithAdvancedRetry(aiService, {
      jobDescription,
      companyName: jobDetails.companyName,
      jobTitle: jobDetails.jobTitle,
      originalCV: sourceFiles.originalCV,
      extensiveCV: sourceFiles.extensiveCV,
      cvStrategy: sourceFiles.cvStrategy,
      outputDir: tempDir
    });

    let cvChangeSummary: string | null = null;
    if (cvResult.success) {
      // Generate CV change summary
      try {
        cvChangeSummary = await aiService.generateCVChangeSummary({
          originalCV: sourceFiles.originalCV,
          newCV: cvResult.cvContent
        });
      } catch (summaryError) {
        cvChangeSummary = 'Unable to generate change summary.';
      }
    }

    // Upload generated CV files to Firebase Storage
    const cvTexStoragePath = `${sessionStoragePath}/generated_files/${path.basename(cvResult.texPath)}`;
    await fileService.writeFileToStorage(cvTexStoragePath, cvResult.cvContent);

    let cvPdfStoragePath: string | null = null;
    if (cvResult.pdfPath) {
      const pdfBuffer = await fs.readFile(cvResult.pdfPath);
      cvPdfStoragePath = `${sessionStoragePath}/generated_files/${path.basename(cvResult.pdfPath)}`;
      await fileService.writeFileToStorage(cvPdfStoragePath, pdfBuffer);
    }

    // Extract text from generated CV PDF
    let validatedCVText = '';
    if (cvResult.pdfPath) {
      try {
        validatedCVText = await documentService.extractPdfText(cvResult.pdfPath);
      } catch (error) {
        validatedCVText = cvResult.cvContent || '';
      }
    }

    // Generate cover letter (conditional)
    let coverLetterContent: string | null = null;
    let coverLetterStoragePath: string | null = null;
    
    if (generateCoverLetter) {
      try {
        coverLetterContent = await aiService.generateCoverLetterAdvanced({
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          validatedCVText,
          extensiveCV: sourceFiles.extensiveCV,
          coverLetterStrategy: sourceFiles.coverLetterStrategy
        });
        
        const coverLetterFilename = documentService.createDescriptiveFilename({
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          documentType: 'CoverLetter',
          extension: 'txt'
        });
        
        coverLetterStoragePath = `${sessionStoragePath}/generated_files/${coverLetterFilename}`;
        await fileService.writeFileToStorage(coverLetterStoragePath, coverLetterContent);
      } catch (error: any) {
        console.error('Cover letter generation failed:', error);
      }
    }

    // Generate cold email (conditional)
    let coldEmailContent: string | null = null;
    let coldEmailStoragePath: string | null = null;
    
    if (generateColdEmail) {
      try {
        coldEmailContent = await aiService.generateColdEmailAdvanced({
          jobDescription,
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          validatedCVText,
          extensiveCV: sourceFiles.extensiveCV,
          coldEmailStrategy: sourceFiles.coldEmailStrategy
        });
        
        const coldEmailFilename = documentService.createDescriptiveFilename({
          companyName: jobDetails.companyName,
          jobTitle: jobDetails.jobTitle,
          documentType: 'ColdEmail',
          extension: 'txt'
        });
        
        coldEmailStoragePath = `${sessionStoragePath}/generated_files/${coldEmailFilename}`;
        await fileService.writeFileToStorage(coldEmailStoragePath, coldEmailContent);
      } catch (error: any) {
        console.error('Cold email generation failed:', error);
      }
    }

    // Update session with generated files
    const generatedFiles: any = {};
    if (cvResult) {
      generatedFiles.cv = {
        texPath: cvTexStoragePath,
        pdfPath: cvPdfStoragePath,
        pageCount: cvResult.pageCount,
        attempts: cvResult.attempts,
        success: cvResult.success
      };
    }
    if (coverLetterStoragePath) {
      generatedFiles.coverLetter = { path: coverLetterStoragePath };
    }
    if (coldEmailStoragePath) {
      generatedFiles.coldEmail = { path: coldEmailStoragePath };
    }

    await sessionService.completeSession(userId, sessionId, generatedFiles);

    // Build results
    const results = {
      cv: {
        content: cvResult.cvContent,
        success: cvResult.success,
        pageCount: cvResult.pageCount,
        attempts: cvResult.attempts,
        error: cvResult.error,
        changeSummary: cvChangeSummary
      },
      coverLetter: coverLetterContent ? {
        content: coverLetterContent
      } : null,
      coldEmail: coldEmailContent ? {
        content: coldEmailContent,
        emailAddresses: emailAddresses
      } : null,
      emailAddresses: emailAddresses,
      companyName: jobDetails.companyName,
      jobTitle: jobDetails.jobTitle
    };

    // Add assistant response to chat history
    await sessionService.addChatMessage(userId, sessionId, {
      role: 'assistant',
      content: 'Documents generated successfully'
    });

    // Clean up temporary directory
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }

    return NextResponse.json({
      success: true,
      sessionId,
      companyName: jobDetails.companyName,
      jobTitle: jobDetails.jobTitle,
      results
    });

  } catch (error: any) {
    console.error('Error in /api/generate:', error);
    
    // Clean up temporary directory on error
    if (tempDir) {
      try {
        await fs.rm(tempDir, { recursive: true, force: true });
      } catch (cleanupError) {
        console.error('Error cleaning up temp directory:', cleanupError);
      }
    }
    
    return NextResponse.json(
      { error: 'Failed to generate documents', message: error.message },
      { status: 500 }
    );
  }
});
