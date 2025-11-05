import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/download/cold-email/:sessionId
 * Download cold email as .txt
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
    if (!session.generatedFiles?.coldEmail?.path) {
      return NextResponse.json(
        { error: 'Cold email not found in session' },
        { status: 404 }
      );
    }

    const coldEmailPath = session.generatedFiles.coldEmail.path;
    
    // Check if file exists
    const exists = await fileService.fileExistsInStorage(coldEmailPath);
    if (!exists) {
      return NextResponse.json(
        { error: 'Cold email file not found in storage' },
        { status: 404 }
      );
    }

    // Read content from Firebase Storage
    const content = await fileService.readFileFromStorage(coldEmailPath);
    
    const fileName = `${sessionId}_ColdEmail.txt`;
    
    // Return the file directly
    return new NextResponse(content, {
      status: 200,
      headers: {
        'Content-Type': 'text/plain',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error('Error in /api/download/cold-email:', error);
    return NextResponse.json(
      { error: 'Failed to download cold email', message: error.message },
      { status: 500 }
    );
  }
});
