import { randomUUID } from "crypto";
import { getAdminBucket } from "./firebaseAdmin";

/**
 * Uploads a file to Firebase Storage and returns a permanent download URL.
 * Uses a download token, so it works regardless of bucket ACLs or Storage rules.
 */
export async function uploadToStorage(data: Buffer, objectPath: string, contentType: string): Promise<string> {
  const bucket = getAdminBucket();
  const token = randomUUID();
  await bucket.file(objectPath).save(data, {
    resumable: false,
    metadata: {
      contentType,
      cacheControl: "public, max-age=31536000",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
}
