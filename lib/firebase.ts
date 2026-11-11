import { initializeApp, getApps, getApp, FirebaseApp } from "firebase/app";
import { getFirestore, Firestore } from "firebase/firestore";
import { getStorage, FirebaseStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "",
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN || "",
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID || "",
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET || "",
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || "",
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID || "",
};

export const isFirebaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID &&
  process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
);

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let storage: FirebaseStorage | null = null;

if (typeof window !== "undefined" && isFirebaseConfigured) {
  try {
    app = !getApps().length ? initializeApp(firebaseConfig) : getApp();
    db = getFirestore(app);
    storage = getStorage(app);
  } catch (err) {
    console.warn("Firebase initialization skipped or failed:", err);
  }
}

export { app, db, storage };

/**
 * Uploads an author image to Firebase Storage if configured,
 * otherwise delegates to local upload endpoint.
 */
export async function uploadAuthorAvatar(
  file: File,
  authorName: string
): Promise<string> {
  const sanitized = authorName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
  const ext = file.name.split(".").pop() || "jpg";
  const filename = `${sanitized}_${Date.now()}.${ext}`;

  // If Firebase Storage is available in client
  if (storage && isFirebaseConfigured) {
    try {
      const storageRef = ref(storage, `authors/${filename}`);
      const snapshot = await uploadBytes(storageRef, file, {
        contentType: file.type || "image/jpeg",
      });
      const downloadUrl = await getDownloadURL(snapshot.ref);
      return downloadUrl;
    } catch (err) {
      console.warn("Firebase Storage client upload failed, using server fallback:", err);
    }
  }

  // Fallback to server endpoint (which handles Firebase Admin or local disk)
  const formData = new FormData();
  formData.append("file", file);
  formData.append("authorName", authorName);

  const res = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  const data = await res.json();
  if (!data.success) {
    throw new Error(data.error || "Image upload failed");
  }

  return data.url;
}

