import { randomUUID } from "crypto";
import { DocumentData, DocumentReference, FieldValue, Timestamp, WriteBatch } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import type { AuthorItem, CategoryItem, NoteItem, VideoItem } from "./types";

/**
 * Firestore data layer.
 *
 * Collections: videos, notes (with videoId), authors, categories, meta/sync.
 * All writes go through this module, so a small in-process cache is kept and
 * invalidated on every write. This keeps the TV fast and Firestore reads low.
 */

const VIDEOS = "videos";
const NOTES = "notes";
const SYNC_DOC = "meta/sync";
/** Picks up edits made outside the app (e.g. in the Firebase console) within this time. */
const CACHE_TTL_MS = 60_000;
/** How long the sync version read is reused; bounds staleness between server instances. */
const SYNC_TTL_MS = 2_000;
const BATCH_LIMIT = 450;

interface Cached<T> {
  at: number;
  value: T;
  /** Sync version the data was loaded at; data is reloaded once the version moves on. */
  version?: string;
}
interface Cache {
  videos?: Cached<VideoItem[]>;
  authors?: Cached<AuthorItem[]>;
  categories?: Cached<CategoryItem[]>;
  sync?: Cached<string>;
}

// globalThis so every route module and dev hot reloads share one cache.
const globalCache = globalThis as unknown as { __tsjDbCache?: Cache };
const cache: Cache = (globalCache.__tsjDbCache ??= {});

const isFresh = (entry: Cached<unknown> | undefined, ttl = CACHE_TTL_MS) => !!entry && Date.now() - entry.at < ttl;
const db = () => getAdminDb();

// -----------------------------------------------------------------------------
// Conversions
// -----------------------------------------------------------------------------

function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string" || typeof value === "number") return new Date(value).toISOString();
  return null;
}

function toTimestamp(value: unknown): Timestamp | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value;
  const date = new Date(value as string | number | Date);
  return isNaN(date.getTime()) ? null : Timestamp.fromDate(date);
}

function videoFromDoc(id: string, d: DocumentData): VideoItem {
  return {
    id,
    youtubeUrl: d.youtubeUrl ?? `https://www.youtube.com/watch?v=${d.youtubeId}`,
    youtubeId: d.youtubeId ?? "",
    title: d.title ?? "",
    thumbnailUrl: d.thumbnailUrl ?? "",
    author: d.author ?? "",
    authorImageUrl: d.authorImageUrl ?? null,
    subject: d.subject ?? "",
    tags: Array.isArray(d.tags) ? d.tags : [],
    rating: Number(d.rating) || 0,
    isArchived: Boolean(d.isArchived),
    watchProgress: d.watchProgress ?? 0,
    lastPosition: d.lastPosition ?? 0,
    duration: d.duration ?? 0,
    lastWatchedAt: toIso(d.lastWatchedAt),
    createdAt: toIso(d.createdAt) ?? new Date(0).toISOString(),
    updatedAt: toIso(d.updatedAt) ?? undefined,
    notes: [],
  };
}

function noteFromDoc(id: string, d: DocumentData): NoteItem {
  return {
    id,
    videoId: d.videoId,
    content: d.content ?? "",
    videoTimestamp: d.videoTimestamp ?? null,
    createdAt: toIso(d.createdAt) ?? new Date(0).toISOString(),
  };
}

/** Video fields as stored in Firestore (dates as Timestamps, no derived fields). */
function videoToDoc(video: Partial<VideoItem>): DocumentData {
  const { id: _id, notes: _notes, createdAt, updatedAt: _updatedAt, lastWatchedAt, ...rest } = video;
  const doc: DocumentData = { ...rest };
  if (createdAt !== undefined) doc.createdAt = toTimestamp(createdAt);
  if (lastWatchedAt !== undefined) doc.lastWatchedAt = toTimestamp(lastWatchedAt);
  return doc;
}

async function commitInBatches(refs: DocumentReference[], apply: (b: WriteBatch, ref: DocumentReference) => void) {
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = db().batch();
    refs.slice(i, i + BATCH_LIMIT).forEach((ref) => apply(batch, ref));
    await batch.commit();
  }
}

// -----------------------------------------------------------------------------
// Sync version (lets the TV notice library changes made from the admin page)
// -----------------------------------------------------------------------------

let pendingSyncRead: Promise<string> | null = null;

export async function getSyncVersion(): Promise<string> {
  if (isFresh(cache.sync, SYNC_TTL_MS)) return cache.sync!.value;
  // Concurrent requests share one Firestore read.
  pendingSyncRead ??= db()
    .doc(SYNC_DOC)
    .get()
    .then((snap) => {
      const version = String(snap.get("version") ?? 0);
      cache.sync = { at: Date.now(), value: version };
      return version;
    })
    .finally(() => (pendingSyncRead = null));
  return pendingSyncRead;
}

/**
 * Cached data is valid while it is younger than the TTL and was loaded at the current
 * sync version. Every content edit bumps the version in Firestore, so all server
 * instances (e.g. several Vercel functions) drop stale data after any edit.
 */
async function isCurrent(entry: Cached<unknown> | undefined, version: string) {
  return isFresh(entry) && entry!.version === version;
}

async function bumpSync() {
  await db().doc(SYNC_DOC).set({ version: FieldValue.increment(1), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  cache.sync = undefined;
}

/** Call after content changes: clears cached data and tells TVs to refresh. */
async function contentChanged(...parts: Array<"videos" | "authors" | "categories">) {
  parts.forEach((p) => (cache[p] = undefined));
  await bumpSync();
}

// -----------------------------------------------------------------------------
// Videos & notes
// -----------------------------------------------------------------------------

/** All videos (newest first), each with its notes (newest first). */
export async function listVideos(): Promise<VideoItem[]> {
  const version = await getSyncVersion();
  if (!(await isCurrent(cache.videos, version))) {
    const [videoSnap, noteSnap] = await Promise.all([db().collection(VIDEOS).get(), db().collection(NOTES).get()]);

    const notesByVideo = new Map<string, NoteItem[]>();
    noteSnap.docs.forEach((doc) => {
      const note = noteFromDoc(doc.id, doc.data());
      const list = notesByVideo.get(note.videoId) ?? [];
      list.push(note);
      notesByVideo.set(note.videoId, list);
    });

    const byNewest = (a: { createdAt: string | Date }, b: { createdAt: string | Date }) =>
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

    const videos = videoSnap.docs.map((doc) => {
      const video = videoFromDoc(doc.id, doc.data());
      video.notes = (notesByVideo.get(doc.id) ?? []).sort(byNewest);
      return video;
    });
    cache.videos = { at: Date.now(), value: videos.sort(byNewest), version };
  }
  return [...cache.videos!.value];
}

export async function getVideo(id: string): Promise<VideoItem | null> {
  return (await listVideos()).find((v) => v.id === id) ?? null;
}

export async function createVideo(input: Omit<VideoItem, "id" | "createdAt" | "notes">): Promise<VideoItem> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await db()
    .collection(VIDEOS)
    .doc(id)
    .set({ ...videoToDoc(input), createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
  await contentChanged("videos");
  return { ...input, id, createdAt: now, updatedAt: now, notes: [] };
}

/**
 * Updates a video. `quiet` (used for watch progress) skips the TV refresh signal
 * and patches the cache in place instead of reloading.
 */
export async function updateVideo(id: string, patch: Partial<VideoItem>, { quiet = false } = {}): Promise<VideoItem | null> {
  const ref = db().collection(VIDEOS).doc(id);
  try {
    await ref.update({ ...videoToDoc(patch), updatedAt: Timestamp.now() });
  } catch (err: any) {
    if (err?.code === 5) return null; // NOT_FOUND
    throw err;
  }

  if (quiet && cache.videos) {
    cache.videos.value = cache.videos.value.map((v) => (v.id === id ? { ...v, ...patch } : v));
  } else {
    await contentChanged("videos");
  }
  return getVideo(id);
}

export async function deleteVideo(id: string): Promise<boolean> {
  const ref = db().collection(VIDEOS).doc(id);
  const exists = (await ref.get()).exists;
  const notes = await db().collection(NOTES).where("videoId", "==", id).get();
  await commitInBatches([ref, ...notes.docs.map((d) => d.ref)], (b, r) => b.delete(r));
  await contentChanged("videos");
  return exists;
}

export async function updateVideosWhere(field: "author" | "subject", value: string, patch: Partial<VideoItem>) {
  const snap = await db().collection(VIDEOS).where(field, "==", value).get();
  const data = { ...videoToDoc(patch), updatedAt: Timestamp.now() };
  await commitInBatches(snap.docs.map((d) => d.ref), (b, r) => b.update(r, data));
  if (snap.size) await contentChanged("videos");
  return snap.size;
}

export async function deleteVideosWhere(field: "author" | "subject", value: string) {
  const snap = await db().collection(VIDEOS).where(field, "==", value).get();
  for (const doc of snap.docs) await deleteVideo(doc.id);
  return snap.size;
}

export async function listNotes(videoId: string): Promise<NoteItem[]> {
  return (await getVideo(videoId))?.notes ?? [];
}

export async function addNote(videoId: string, content: string, videoTimestamp: number | null): Promise<NoteItem> {
  const ref = db().collection(NOTES).doc(randomUUID());
  await ref.set({ videoId, content, videoTimestamp, createdAt: Timestamp.now() });
  await contentChanged("videos");
  return { id: ref.id, videoId, content, videoTimestamp, createdAt: new Date().toISOString() };
}

// -----------------------------------------------------------------------------
// Authors & categories (unique by name)
// -----------------------------------------------------------------------------

type Named = { id: string; name: string };

function namedCollection<T extends Named>(collection: "authors" | "categories", fromDoc: (id: string, d: DocumentData) => T) {
  const ref = () => db().collection(collection);

  async function list(): Promise<T[]> {
    const version = await getSyncVersion();
    const entry = cache[collection] as Cached<T[]> | undefined;
    if (!(await isCurrent(entry, version))) {
      const snap = await ref().get();
      const items = snap.docs.map((d) => fromDoc(d.id, d.data())).sort((a, b) => a.name.localeCompare(b.name));
      (cache[collection] as Cached<T[]>) = { at: Date.now(), value: items, version };
    }
    return [...(cache[collection] as Cached<T[]>).value];
  }

  const getById = async (id: string) => (await list()).find((item) => item.id === id) ?? null;
  const getByName = async (name: string) => (await list()).find((item) => item.name === name) ?? null;

  async function create(data: Omit<T, "id" | "createdAt" | "updatedAt">): Promise<T> {
    const id = randomUUID();
    await ref()
      .doc(id)
      .set({ ...data, createdAt: Timestamp.now(), updatedAt: Timestamp.now() });
    await contentChanged(collection);
    return (await getById(id))!;
  }

  async function update(id: string, data: Partial<Omit<T, "id">>): Promise<T | null> {
    const { createdAt: _c, updatedAt: _u, ...fields } = data as Record<string, unknown>;
    await ref()
      .doc(id)
      .update({ ...fields, updatedAt: Timestamp.now() });
    await contentChanged(collection);
    return getById(id);
  }

  async function remove(id: string) {
    await ref().doc(id).delete();
    await contentChanged(collection);
  }

  /** Creates the record if no record with this exact name exists. */
  async function ensure(name: string, data: Partial<Omit<T, "id" | "name">> = {}): Promise<T> {
    return (await getByName(name)) ?? create({ name, ...data } as Omit<T, "id" | "createdAt" | "updatedAt">);
  }

  return { list, getById, getByName, create, update, remove, ensure };
}

export const authors = namedCollection<AuthorItem>("authors", (id, d) => ({
  id,
  name: d.name ?? "",
  imageUrl: d.imageUrl ?? null,
  bio: d.bio ?? null,
  createdAt: toIso(d.createdAt) ?? undefined,
  updatedAt: toIso(d.updatedAt) ?? undefined,
}));

export const categories = namedCollection<CategoryItem>("categories", (id, d) => ({
  id,
  name: d.name ?? "",
  description: d.description ?? null,
  color: d.color ?? null,
  createdAt: toIso(d.createdAt) ?? undefined,
  updatedAt: toIso(d.updatedAt) ?? undefined,
}));

/** Video count per author/subject name (case-insensitive). */
export async function countVideosBy(field: "author" | "subject"): Promise<Map<string, number>> {
  const counts = new Map<string, number>();
  for (const v of await listVideos()) {
    const key = (v[field] || "").toLowerCase();
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return counts;
}
