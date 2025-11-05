// Authentication helper functions for API routes
import { NextRequest } from 'next/server';
import { adminAuth } from './firebase-admin';

export interface AuthenticatedRequest extends NextRequest {
  userId?: string;
}

/**
 * Verify Firebase ID token from request headers
 * @param request NextRequest object
 * @returns userId if authenticated, null otherwise
 */
export async function verifyAuth(request: NextRequest): Promise<string | null> {
  try {
    const authHeader = request.headers.get('authorization');
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }
    
    const token = authHeader.split('Bearer ')[1];
    
    if (!token) {
      return null;
    }
    
    // Verify the ID token
    const decodedToken = await adminAuth().verifyIdToken(token);
    return decodedToken.uid;
  } catch (error) {
    console.error('Error verifying auth token:', error);
    return null;
  }
}

/**
 * Middleware wrapper to protect API routes
 * @param handler API route handler
 * @returns Protected handler that requires authentication
 */
export function withAuth<T>(
  handler: (request: NextRequest, context: { params: any }, userId: string) => Promise<T>
) {
  return async (request: NextRequest, context: { params: any }): Promise<T | Response> => {
    const userId = await verifyAuth(request);
    
    if (!userId) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized. Please sign in.' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    return handler(request, context, userId);
  };
}
