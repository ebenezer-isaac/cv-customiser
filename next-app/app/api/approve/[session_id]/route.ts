import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { SessionService } from '@/lib/services/sessionService';
import { FileService } from '@/lib/services/fileService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * POST /api/approve/:session_id
 * Approve and lock a session
 * Protected by Firebase authentication
 */
export const POST = withAuth(async (
  request: NextRequest,
  context: { params: { session_id: string } },
  userId: string
) => {
  try {
    const { session_id } = context.params;
    const session = await sessionService.approveSession(userId, session_id);
    
    await sessionService.logToChatHistory(userId, session_id, '✓ Session approved and locked', 'success');

    return NextResponse.json({
      success: true,
      message: 'Session approved and locked. No further changes can be made.',
      session
    });
  } catch (error: any) {
    console.error('Error in /api/approve/:session_id:', error);
    return NextResponse.json(
      { error: 'Failed to approve session', message: error.message },
      { status: 500 }
    );
  }
});
