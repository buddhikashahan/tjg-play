// One-time migration: copies the old SQLite library (prisma/dev.db) into Firestore,
// and uploads locally stored author photos (public/uploads/...) to Firebase Storage.
//
//   npm run migrate:sqlite -- --dry-run   preview only
//   npm run migrate:sqlite                migrate (refuses if Firestore already has videos)
//   npm run migrate:sqlite -- --force     migrate even if Firestore already has videos
//
// Document IDs are kept, so running it twice does not create duplicates.
import fs from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp, FieldValue } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";
import nextEnv from "@next/env";

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has("--dry-run");
const FORCE = args.has("--force");
const ROOT = process.cwd();
const SQLITE_FILE = path.join(ROOT, "prisma", "dev.db");

// Load .env exactly the way Next.js does, so the script and the app agree.
nextEnv.loadEnvConfig(ROOT, false, { info() {}, error: console.error });

function fail(message) {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

// Same order as lib/firebaseAdmin.ts: the JSON key file wins, then .env variables.
function loadServiceAccount() {
  const keyFile = path.resolve(ROOT, process.env.FIREBASE_SERVICE_ACCOUNT_FILE || "firebase-service-account.json");
  if (fs.existsSync(keyFile)) {
    const json = JSON.parse(fs.readFileSync(keyFile, "utf8"));
    return { projectId: json.project_id, clientEmail: json.client_email, privateKey: json.private_key };
  }

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  const { FIREBASE_CLIENT_EMAIL: clientEmail, FIREBASE_PRIVATE_KEY } = process.env;
  if (!clientEmail || !FIREBASE_PRIVATE_KEY) {
    fail(
      "No Firebase service-account credentials found.\n" +
        "  Firebase console → Project settings → Service accounts → Generate new private key,\n" +
        "  then save the file as firebase-service-account.json in the project folder."
    );
  }
  // Take just the PEM block, ignoring anything pasted around it (e.g. the private_key_id).
  const privateKey = FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n").match(/-----BEGIN PRIVATE KEY-----[\s\S]+?-----END PRIVATE KEY-----/)?.[0];
  if (!privateKey) {
    fail(
      "FIREBASE_PRIVATE_KEY in .env is not a private key. It must contain -----BEGIN PRIVATE KEY-----\n" +
        '  ("private_key_id" is a different field). Easiest fix: save the downloaded key file as\n' +
        "  firebase-service-account.json in the project folder."
    );
  }
  return { projectId, clientEmail, privateKey: `${privateKey}\n` };
}

const ts = (value) => (value === null || value === undefined ? null : Timestamp.fromMillis(new Date(value).getTime()));
const parseTags = (raw) => {
  try {
    const tags = JSON.parse(raw || "[]");
    return Array.isArray(tags) ? tags : [];
  } catch {
    return [];
  }
};
const CONTENT_TYPES = { ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif" };

// --- Read SQLite -------------------------------------------------------------
if (!fs.existsSync(SQLITE_FILE)) fail(`SQLite database not found at ${SQLITE_FILE}`);
const sqlite = new DatabaseSync(SQLITE_FILE, { readOnly: true });
const rows = {
  videos: sqlite.prepare("SELECT * FROM Video").all(),
  notes: sqlite.prepare("SELECT * FROM Note").all(),
  authors: sqlite.prepare("SELECT * FROM Author").all(),
  categories: sqlite.prepare("SELECT * FROM Category").all(),
};
sqlite.close();

const localImages = new Set(
  [...rows.videos.map((v) => v.authorImageUrl), ...rows.authors.map((a) => a.imageUrl)].filter((u) => u?.startsWith("/"))
);

console.log("SQLite library:");
for (const [name, list] of Object.entries(rows)) console.log(`  ${name.padEnd(11)} ${list.length}`);
console.log(`  local photos ${localImages.size}`);

// --- Connect to Firebase -----------------------------------------------------
const serviceAccount = loadServiceAccount();
const bucketName = process.env.FIREBASE_STORAGE_BUCKET || process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET;
if (!bucketName) fail("FIREBASE_STORAGE_BUCKET is not set in .env");

const app = initializeApp({ credential: cert(serviceAccount), storageBucket: bucketName });
const db = getFirestore(app);
const bucket = getStorage(app).bucket(bucketName);
console.log(`\nFirebase project: ${serviceAccount.projectId}   bucket: ${bucketName}`);

let existingVideos;
try {
  existingVideos = (await db.collection("videos").limit(1).get()).size;
} catch (err) {
  if (err.code === 5) fail("Firestore database not found. Create it first: Firebase console → Firestore Database → Create database.");
  if (err.code === 7) fail(`Permission denied for ${serviceAccount.clientEmail}. Use a key from the project's Firebase Admin SDK service account.`);
  throw err;
}
if (existingVideos && !FORCE) {
  fail("Firestore already contains videos, so nothing was changed (this prevents overwriting newer edits).\n  Re-run with --force to copy the SQLite data over anyway.");
}

if (DRY_RUN) {
  console.log("\nDry run: credentials and Firestore access OK. Nothing was written.");
  process.exit(0);
}

// --- Upload photos -----------------------------------------------------------
const imageUrlMap = new Map();
for (const localUrl of localImages) {
  const file = path.join(ROOT, "public", localUrl);
  if (!fs.existsSync(file)) {
    console.warn(`  ! photo missing on disk, link left unchanged: ${localUrl}`);
    continue;
  }
  const objectPath = `authors/${path.basename(file)}`;
  const token = randomUUID();
  try {
    await bucket.upload(file, {
      destination: objectPath,
      resumable: false,
      metadata: {
        contentType: CONTENT_TYPES[path.extname(file).toLowerCase()] || "application/octet-stream",
        cacheControl: "public, max-age=31536000",
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
  } catch (err) {
    if (err.code === 404) fail(`Storage bucket "${bucketName}" not found. Enable it: Firebase console → Storage → Get started.`);
    throw err;
  }
  const url = `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(objectPath)}?alt=media&token=${token}`;
  imageUrlMap.set(localUrl, url);
  console.log(`  ↑ ${localUrl}`);
}
const image = (url) => (url ? imageUrlMap.get(url) ?? url : null);

// --- Write Firestore ---------------------------------------------------------
const writes = [];
for (const v of rows.videos) {
  writes.push([
    db.collection("videos").doc(v.id),
    {
      youtubeUrl: v.youtubeUrl,
      youtubeId: v.youtubeId,
      title: v.title,
      thumbnailUrl: v.thumbnailUrl,
      author: v.author,
      authorImageUrl: image(v.authorImageUrl),
      subject: v.subject,
      tags: parseTags(v.tags),
      rating: Number(v.rating) || 0,
      isArchived: Boolean(v.isArchived),
      watchProgress: v.watchProgress ?? 0,
      lastPosition: v.lastPosition ?? 0,
      duration: v.duration ?? 0,
      lastWatchedAt: ts(v.lastWatchedAt),
      createdAt: ts(v.createdAt),
      updatedAt: ts(v.updatedAt),
    },
  ]);
}
for (const n of rows.notes) {
  writes.push([
    db.collection("notes").doc(n.id),
    { videoId: n.videoId, content: n.content, videoTimestamp: n.videoTimestamp ?? null, createdAt: ts(n.createdAt) },
  ]);
}
for (const a of rows.authors) {
  writes.push([
    db.collection("authors").doc(a.id),
    { name: a.name, imageUrl: image(a.imageUrl), bio: a.bio ?? null, createdAt: ts(a.createdAt), updatedAt: ts(a.updatedAt) },
  ]);
}
for (const c of rows.categories) {
  writes.push([
    db.collection("categories").doc(c.id),
    { name: c.name, description: c.description ?? null, color: c.color ?? null, createdAt: ts(c.createdAt), updatedAt: ts(c.updatedAt) },
  ]);
}

for (let i = 0; i < writes.length; i += 400) {
  const batch = db.batch();
  writes.slice(i, i + 400).forEach(([ref, data]) => batch.set(ref, data));
  await batch.commit();
}
await db.doc("meta/sync").set({ version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

console.log(`\n✔ Migrated ${rows.videos.length} videos, ${rows.notes.length} notes, ${rows.authors.length} authors, ${rows.categories.length} categories, ${imageUrlMap.size} photos.`);
console.log("  prisma/dev.db and public/uploads were left untouched as a backup.");
