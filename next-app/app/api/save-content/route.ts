import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * POST /api/save-content
 * Save edited content (cover letter or cold email)
 * Protected by Firebase authentication
 */
export const POST = withAuth(async (request: NextRequest, context: any, userId: string) => {
  try {
    const body = await request.json();
    const { sessionId, contentType, content } = body;
    
    if (!sessionId || !contentType || content === undefined) {
      return NextResponse.json(
        { error: 'Missing required fields: sessionId, contentType, and content are required' },
        { status: 400 }
      );
    }

    // Get session
    const session = await sessionService.getSession(userId, sessionId);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }
    
    // Determine file path based on content type
    let filePath: string;
    if (contentType === 'coverLetter') {
      if (!session.generatedFiles?.coverLetter?.path) {
        return NextResponse.json(
          { error: 'Cover letter not found in session' },
          { status: 404 }
        );
      }
      filePath = session.generatedFiles.coverLetter.path;
    } else if (contentType === 'coldEmail') {
      if (!session.generatedFiles?.coldEmail?.path) {
        return NextResponse.json(
          { error: 'Cold email not found in session' },
          { status: 404 }
        );
      }
      filePath = session.generatedFiles.coldEmail.path;
    } else {
      return NextResponse.json(
        { error: 'Invalid contentType. Must be "coverLetter" or "coldEmail"' },
        { status: 400 }
      );
    }

    // Save the content to Firebase Storage
    await fileService.writeFileToStorage(filePath, content);
    
    return NextResponse.json({
      success: true,
      message: `${contentType} saved successfully`
    });

  } catch (error: any) {
    console.error('Error in /api/save-content:', error);
    return NextResponse.json(
      { error: 'Failed to save content', message: error.message },
      { status: 500 }
    );
  }
});
