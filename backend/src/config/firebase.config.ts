import * as admin from 'firebase-admin';
import { App, initializeApp, getApps } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { Bucket } from '@google-cloud/storage';

let firebaseApp: App | null = null;

export function getFirebaseApp(): App | null {
  if (firebaseApp) {
    return firebaseApp;
  }

  const apps = getApps();
  if (apps.length > 0) {
    firebaseApp = apps[0]!;
    return firebaseApp;
  }

  const projectId = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey = process.env.FIREBASE_PRIVATE_KEY;

  if (!projectId || !clientEmail || !privateKey) {
    console.warn('[Firebase] Missing credentials. Firebase features will be disabled.');
    return null;
  }

  try {
    firebaseApp = initializeApp({
      credential: admin.credential.cert({
        projectId,
        clientEmail,
        privateKey: privateKey.replace(/\\n/g, '\n'),
      }),
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
    console.log('[Firebase] Initialized successfully.');
    return firebaseApp;
  } catch (error: any) {
    console.error('[Firebase] Failed to initialize:', error.message);
    return null;
  }
}

export function getStorageBucket(): Bucket | null {
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucketName) {
    console.warn('[Firebase] FIREBASE_STORAGE_BUCKET is not defined.');
    return null;
  }
  const app = getFirebaseApp();
  if (!app) return null;
  
  return getStorage(app).bucket(bucketName);
}
