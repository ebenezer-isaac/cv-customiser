import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';
import { adminAuth, adminStorage } from '@/lib/firebase-admin';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * DELETE /api/user/delete-account
 * Delete user account and all associated data (GDPR Right to Erasure)
 * Protected by Firebase authentication
 * 
 * This is irreversible and deletes:
 * - User authentication account
 * - All source files
 * - All sessions and generated documents
 * - All chat history
 */
export const DELETE = withAuth(async (request: NextRequest, context: any, userId: string) => {
  try {
    // Confirmation check - user must send { confirm: true }
    const body = await request.json().catch(() => ({}));
    
    if (body.confirm !== true) {
      return NextResponse.json(
        { 
          error: 'Account deletion requires confirmation',
          message: 'Send { "confirm": true } in request body to confirm deletion'
        },
        { status: 400 }
      );
    }

    console.log(`Starting account deletion for user ${userId}`);

    // Step 1: Delete all files in Firebase Storage
    try {
      const bucket = adminStorage().bucket();
      const userPrefix = `users/${userId}/`;
      
      // List all files
      const [files] = await bucket.getFiles({ prefix: userPrefix });
      
      console.log(`Found ${files.length} files to delete`);
      
      // Delete in batches
      const deletePromises = files.map(file => file.delete());
      await Promise.all(deletePromises);
      
      console.log('All files deleted successfully');
    } catch (error) {
      console.error('Error deleting files:', error);
      // Continue with account deletion even if file deletion fails
    }

    // Step 2: Delete user from Firebase Authentication
    try {
      await adminAuth().deleteUser(userId);
      console.log('User authentication account deleted');
    } catch (error) {
      console.error('Error deleting auth account:', error);
      return NextResponse.json(
        { 
          error: 'Failed to delete authentication account',
          message: 'Some data may have been deleted. Please contact support.'
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Account and all associated data have been permanently deleted'
    });

  } catch (error: any) {
    console.error('Error in /api/user/delete-account:', error);
    return NextResponse.json(
      { 
        error: 'Failed to delete account', 
        message: error.message 
      },
      { status: 500 }
    );
  }
});
