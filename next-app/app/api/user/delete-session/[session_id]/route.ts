import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';
import { adminStorage } from '@/lib/firebase-admin';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * DELETE /api/user/delete-session/:session_id
 * Delete a specific session and all its files
 * Protected by Firebase authentication
 */
export const DELETE = withAuth(async (
  request: NextRequest,
  context: { params: { session_id: string } },
  userId: string
) => {
  try {
    const { session_id } = context.params;

    // Check if session exists and belongs to user
    const session = await sessionService.getSession(userId, session_id);
    if (!session) {
      return NextResponse.json(
        { error: 'Session not found' },
        { status: 404 }
      );
    }

    // Delete all files in the session directory
    try {
      const bucket = adminStorage().bucket();
      const sessionPrefix = `users/${userId}/sessions/${session_id}/`;
      
      const [files] = await bucket.getFiles({ prefix: sessionPrefix });
      
      console.log(`Deleting ${files.length} files from session ${session_id}`);
      
      // Delete all files
      const deletePromises = files.map(file => file.delete());
      await Promise.all(deletePromises);
      
      console.log(`Session ${session_id} deleted successfully`);
    } catch (error) {
      console.error('Error deleting session files:', error);
      return NextResponse.json(
        { error: 'Failed to delete session files', message: (error as Error).message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Session and all associated files deleted successfully',
      sessionId: session_id
    });

  } catch (error: any) {
    console.error('Error in /api/user/delete-session:', error);
    return NextResponse.json(
      { error: 'Failed to delete session', message: error.message },
      { status: 500 }
    );
  }
});
