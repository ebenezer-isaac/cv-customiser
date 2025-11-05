import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { SessionService } from '@/lib/services/sessionService';
import { FileService } from '@/lib/services/fileService';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/history
 * Get list of all sessions for the authenticated user
 */
export const GET = withAuth(async (request: NextRequest, context: any, userId: string) => {
  try {
    const sessions = await sessionService.listSessions(userId);
    
    return NextResponse.json({
      success: true,
      sessions
    });
  } catch (error: any) {
    console.error('Error in /api/history:', error);
    return NextResponse.json(
      { error: 'Failed to retrieve history', message: error.message },
      { status: 500 }
    );
  }
});
