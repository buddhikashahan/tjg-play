import { initializeApp, getApps, cert, App } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
const privateKey = process.env.FIREBASE_PRIVATE_KEY
  ? process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  : undefined;
const storageBucket =
  process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;

export const isFirebaseAdminConfigured = Boolean(
  projectId && (clientEmail || process.env.FIREBASE_CONFIG)
);

let adminApp: App | null = null;
let adminDb: Firestore | null = null;
let adminStorageBucket: any = null;

if (isFirebaseAdminConfigured) {
  try {
    if (!getApps().length) {
      if (clientEmail && privateKey) {
        adminApp = initializeApp({
          credential: cert({
            projectId,
            clientEmail,
            privateKey,
          }),
          storageBucket,
        });
      } else {
        adminApp = initializeApp({
          projectId,
          storageBucket,
        });
      }
    } else {
      adminApp = getApps()[0];
    }

    adminDb = getFirestore(adminApp);
    if (storageBucket) {
      adminStorageBucket = getStorage(adminApp).bucket(storageBucket);
    }
  } catch (err) {
    console.warn("Firebase Admin initialization skipped or error:", err);
  }
}

export { adminApp, adminDb, adminStorageBucket as adminStorage };
