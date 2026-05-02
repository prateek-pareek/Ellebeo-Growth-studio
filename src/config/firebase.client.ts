// ============================================================================
// firebase.client.ts — Firebase Admin SDK Initialization
// ============================================================================

import * as admin from 'firebase-admin';
import { aiConfig } from './ai.config';

/**
 * Initialize Firebase Admin SDK using service account credentials
 * from environment variables.
 */
function initializeFirebase(): admin.app.App {
  // Check if already initialized to prevent errors during hot-reloading
  if (admin.apps.length \u003e 0) {
    return admin.apps[0]!;
  }

  const { firebase } = aiConfig;

  // Handle private key formatting (newlines in env vars)
  const privateKey = firebase.privateKey.replace(/\\\\n/g, '\\n');

  return admin.initializeApp({
    credential: admin.credential.cert({
      projectId: firebase.projectId,
      clientEmail: firebase.clientEmail,
      privateKey: privateKey,
    }),
    storageBucket: firebase.storageBucket,
  });
}

export const firebaseApp = initializeFirebase();
export const firebaseStorage = firebaseApp.storage();
export const firebaseAuth = firebaseApp.auth();
export const firebaseFirestore = firebaseApp.firestore();
