import { getFirebaseApp } from './firebase.config';
import { getStorage } from 'firebase-admin/storage';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';

const app = getFirebaseApp();

export const firebaseApp = app;
export const firebaseStorage = app ? getStorage(app) : null;
export const firebaseAuth = app ? getAuth(app) : null;
export const firebaseFirestore = app ? getFirestore(app) : null;
