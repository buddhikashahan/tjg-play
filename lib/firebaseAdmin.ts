import fs from "fs";
import path from "path";
import { cert, getApps, initializeApp, App, ServiceAccount } from "firebase-admin/app";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Server-side Firebase (Firestore + Cloud Storage).
 *
 * Credentials, in order of preference:
 *  1. FIREBASE_CLIENT_EMAIL + FIREBASE_PRIVATE_KEY in .env
 *  2. A service-account JSON file: FIREBASE_SERVICE_ACCOUNT_FILE, or ./firebase-service-account.json
 *
 * Initialised lazily so the app still builds without credentials.
 */

const DEFAULT_KEY_FILE = "firebase-service-account.json";

export class FirebaseNotConfiguredError extends Error {
  constructor() {
    super(
      "Firebase is not configured. Download a service-account key (Firebase console → Project settings → " +
        `Service accounts → Generate new private key) and save it as ${DEFAULT_KEY_FILE} in the project folder.`
    );
    this.name = "FirebaseNotConfiguredError";
  }
}

function loadServiceAccount(): ServiceAccount | null {
  // The downloaded JSON file is the least error-prone option, so it wins when present.
  const keyFile = path.resolve(process.cwd(), process.env.FIREBASE_SERVICE_ACCOUNT_FILE || DEFAULT_KEY_FILE);
  if (fs.existsSync(keyFile)) {
    const json = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    return { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  const rawKey = process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  if (!clientEmail || !rawKey) return null;
  // Take just the PEM block, ignoring anything pasted around it (e.g. the private_key_id).
  const privateKey = rawKey.match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0];
  if (!privateKey) {
    throw new Error(
      "FIREBASE_PRIVATE_KEY in .env is not a private key (it must contain -----BEGIN PRIVATE KEY-----; " +
        `"private_key_id" is a different field). Easiest fix: save the downloaded key file as ${DEFAULT_KEY_FILE}.`
    );
  }
  return { projectId, clientEmail, privateKey: `${privateKey}\n` };
}

export function getStorageBucketName(): string | undefined {
  return process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
}

let adminApp: App | null = null;
let adminDb: Firestore | null = null;

function getAdminApp(): App {
  if (adminApp) return adminApp;
  if (getApps().length) return (adminApp = getApps()[0]);

  const serviceAccount = loadServiceAccount();
  if (!serviceAccount) throw new FirebaseNotConfiguredError();
  adminApp = initializeApp({ credential: cert(serviceAccount), storageBucket: getStorageBucketName() });
  return adminApp;
}

export function getAdminDb(): Firestore {
  if (adminDb) return adminDb;
  adminDb = getFirestore(getAdminApp());
  try {
    adminDb.settings({ ignoreUndefinedProperties: true });
  } catch {
    // Already configured (dev hot reload reuses the same Firestore instance).
  }
  return adminDb;
}

export function getAdminBucket() {
  const bucketName = getStorageBucketName();
  if (!bucketName) throw new Error("FIREBASE_STORAGE_BUCKET is not set in .env");
  return getStorage(getAdminApp()).bucket(bucketName);
}
