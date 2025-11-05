import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/download/cv/:sessionId
 * Generate signed URL for CV PDF download
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

    // Get the PDF file path from session.generatedFiles
    if (!session.generatedFiles?.cv?.pdfPath) {
      return NextResponse.json(
        { error: 'CV PDF not found in session' },
        { status: 404 }
      );
    }

    const pdfPath = session.generatedFiles.cv.pdfPath;
    
    // Check if file exists in Firebase Storage
    const exists = await fileService.fileExistsInStorage(pdfPath);
    if (!exists) {
      return NextResponse.json(
        { error: 'CV PDF file not found in storage' },
        { status: 404 }
      );
    }

    // Generate signed URL (15 minutes expiry)
    const signedUrl = await fileService.getSignedUrl(pdfPath, 15);
    
    // Return signed URL for direct download
    return NextResponse.json({
      success: true,
      downloadUrl: signedUrl
    });

  } catch (error: any) {
    console.error('Error in /api/download/cv:', error);
    return NextResponse.json(
      { error: 'Failed to generate download URL', message: error.message },
      { status: 500 }
    );
  }
});
