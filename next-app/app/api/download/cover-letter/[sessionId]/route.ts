import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';
import { Document, Paragraph, TextRun, Packer } from 'docx';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/download/cover-letter/:sessionId
 * Download cover letter as .docx
 * Protected by Firebase authentication
 */
export const GET = withAuth(async (
  request: NextRequest,
  context: { params: { sessionId: string } },
  userId: string
) => {
  try {
    const { sessionId } = context.params;
    
    // Get session
    const session = await sessionService.getSession(userId, sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Get the file path from session.generatedFiles
    if (!session.generatedFiles?.coverLetter?.path) {
      return NextResponse.json(
        { error: 'Cover letter not found in session' },
        { status: 404 }
      );
    }

    const coverLetterPath = session.generatedFiles.coverLetter.path;
    
    // Check if file exists
    const exists = await fileService.fileExistsInStorage(coverLetterPath);
    if (!exists) {
      return NextResponse.json(
        { error: 'Cover letter file not found in storage' },
        { status: 404 }
      );
    }

    // Read content from Firebase Storage
    const content = await fileService.readFileFromStorage(coverLetterPath);
    
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
    
    // Return the file directly
    return new NextResponse(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error('Error in /api/download/cover-letter:', error);
    return NextResponse.json(
      { error: 'Failed to download cover letter', message: error.message },
      { status: 500 }
    );
  }
});
