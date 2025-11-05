import { NextRequest, NextResponse } from 'next/server';
import { withAuth } from '@/lib/auth-helpers';
import { FileService } from '@/lib/services/fileService';
import { SessionService } from '@/lib/services/sessionService';
import { adminAuth } from '@/lib/firebase-admin';

const fileService = new FileService();
const sessionService = new SessionService(fileService);

/**
 * GET /api/user/export-data
 * Export all user data in JSON format (GDPR Right to Data Portability)
 * Protected by Firebase authentication
 */
export const GET = withAuth(async (request: NextRequest, context: any, userId: string) => {
  try {
    // Get user profile from Firebase Auth
    const userRecord = await adminAuth().getUser(userId);
    
    const userData: any = {
      exportDate: new Date().toISOString(),
      user: {
        uid: userRecord.uid,
        email: userRecord.email,
        displayName: userRecord.displayName || null,
        createdAt: userRecord.metadata.creationTime,
        lastSignIn: userRecord.metadata.lastSignInTime,
      },
      sourceFiles: {},
      sessions: []
    };

    // Export source files
    const sourceFilesPrefix = `users/${userId}/source_files/`;
    const sourceFilesList = await fileService.listFilesInStorage(sourceFilesPrefix);
    
    for (const filePath of sourceFilesList) {
      try {
        const fileName = filePath.replace(sourceFilesPrefix, '');
        const content = await fileService.readFileFromStorage(filePath);
        userData.sourceFiles[fileName] = {
          path: filePath,
          contentLength: content.length,
          // For text files, include content; for binary, just metadata
          content: fileName.match(/\.(tex|txt)$/i) ? content : '[Binary file - not included in export]'
        };
      } catch (error) {
        console.error(`Error reading source file ${filePath}:`, error);
        userData.sourceFiles[filePath] = { error: 'Failed to read file' };
      }
    }

    // Export all sessions
    const sessions = await sessionService.listSessions(userId);
    
    for (const sessionSummary of sessions) {
      try {
        const session = await sessionService.getSession(userId, sessionSummary.id);
        const chatHistory = await sessionService.getChatHistoryFromFile(userId, sessionSummary.id);
        
        if (session) {
          // Get generated file contents
          const generatedFiles: any = {};
          
          if (session.generatedFiles?.cv?.texPath) {
            try {
              const texContent = await fileService.readFileFromStorage(session.generatedFiles.cv.texPath);
              generatedFiles.cv = {
                texPath: session.generatedFiles.cv.texPath,
                pdfPath: session.generatedFiles.cv.pdfPath,
                texContent: texContent,
                pageCount: session.generatedFiles.cv.pageCount,
                success: session.generatedFiles.cv.success
              };
            } catch (error) {
              generatedFiles.cv = { error: 'Failed to read CV file' };
            }
          }
          
          if (session.generatedFiles?.coverLetter?.path) {
            try {
              const content = await fileService.readFileFromStorage(session.generatedFiles.coverLetter.path);
              generatedFiles.coverLetter = {
                path: session.generatedFiles.coverLetter.path,
                content: content
              };
            } catch (error) {
              generatedFiles.coverLetter = { error: 'Failed to read cover letter file' };
            }
          }
          
          if (session.generatedFiles?.coldEmail?.path) {
            try {
              const content = await fileService.readFileFromStorage(session.generatedFiles.coldEmail.path);
              generatedFiles.coldEmail = {
                path: session.generatedFiles.coldEmail.path,
                content: content
              };
            } catch (error) {
              generatedFiles.coldEmail = { error: 'Failed to read cold email file' };
            }
          }
          
          userData.sessions.push({
            id: session.id,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            status: session.status,
            approved: session.approved,
            locked: session.locked,
            jobDescription: session.jobDescription,
            companyName: session.companyName,
            jobTitle: session.jobTitle,
            chatHistory: chatHistory,
            generatedFiles: generatedFiles
          });
        }
      } catch (error) {
        console.error(`Error exporting session ${sessionSummary.id}:`, error);
        userData.sessions.push({
          id: sessionSummary.id,
          error: 'Failed to export session'
        });
      }
    }

    // Return as downloadable JSON file
    const fileName = `cv-customiser-data-export-${userId}-${Date.now()}.json`;
    
    return new NextResponse(JSON.stringify(userData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${fileName}"`,
      },
    });

  } catch (error: any) {
    console.error('Error in /api/user/export-data:', error);
    return NextResponse.json(
      { error: 'Failed to export user data', message: error.message },
      { status: 500 }
    );
  }
});
