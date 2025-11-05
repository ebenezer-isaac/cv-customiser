import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { SessionService } from '@/lib/services/sessionService';
import { FileService } from '@/lib/services/fileService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/history/:session_id
 * Get detailed information for a specific session
 */
export const GET = withAuth(async (
  request: NextRequest,
  context: { params: { session_id: string } },
  userId: string
) => {
  try {
    const { session_id } = context.params;
    const session = await sessionService.getSession(userId, session_id);
    
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Also get the chat history from file
    const fileHistory = await sessionService.getChatHistoryFromFile(userId, session_id);

    return NextResponse.json({
      success: true,
      session: {
        ...session,
        fileHistory
      }
    });
  } catch (error: any) {
    console.error('Error in /api/history/:session_id:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve session', message: error.message },
      { status: 500 }
    );
  }
});
