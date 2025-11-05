// Firebase Admin SDK configuration (runs on server only)
import { initializeApp, getApps, cert, App } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';

let app: App;

export function getAdminApp(): App {
  if (getApps().length === 0) {
    // Initialize with service account credentials
    app = initializeApp({
      credential: cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    });
  } else {
    app = getApps()[0];
  }
  
  return app;
}

export const adminAuth = () => getAuth(getAdminApp());
export const adminStorage = () => getStorage(getAdminApp());

export default getAdminApp;
