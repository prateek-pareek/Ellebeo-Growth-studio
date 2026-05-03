// ============================================================================
// firebase.client.ts — Firebase Admin SDK Initialization
// ============================================================================

import { getFirebaseApp } from './firebase.config';

export const firebaseApp = getFirebaseApp();
export const firebaseStorage = firebaseApp.storage();
export const firebaseAuth = firebaseApp.auth();
export const firebaseFirestore = firebaseApp.firestore();
