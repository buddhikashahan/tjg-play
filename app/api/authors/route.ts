import { NextRequest, NextResponse } from "next/server";
import { authors, countVideosBy, deleteVideosWhere, listVideos, updateVideosWhere } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

/** Registers any author that only exists on videos (and fills in missing photos). */
async function syncAuthorsFromVideos() {
  const seen = new Set<string>();
  for (const video of await listVideos()) {
    const name = video.author?.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    const existing = await authors.getByName(name);
    if (!existing) await authors.create({ name, imageUrl: video.authorImageUrl || null, bio: null });
    else if (!existing.imageUrl && video.authorImageUrl) await authors.update(existing.id, { imageUrl: video.authorImageUrl });
  }
}

// GET /api/authors[?sync=true] - list authors with video counts
export async function GET(req: NextRequest) {
  try {
    const shouldSync = req.nextUrl.searchParams.get("sync") === "true";
    if (shouldSync || (await authors.list()).length === 0) await syncAuthorsFromVideos();

    const counts = await countVideosBy("author");
    const result = (await authors.list()).map((a) => ({ ...a, videoCount: counts.get(a.name.toLowerCase()) || 0 }));
    return NextResponse.json({ success: true, authors: result, total: result.length });
  } catch (error) {
    return errorResponse(error, "Failed to fetch authors");
  }
}

// POST /api/authors - create author
export async function POST(req: NextRequest) {
  try {
    const { name, imageUrl, bio } = await req.json();
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ success: false, error: "Author name is required" }, { status: 400 });
    }
    if (await authors.getByName(trimmedName)) {
      return NextResponse.json({ success: false, error: `Author "${trimmedName}" already exists` }, { status: 409 });
    }

    const author = await authors.create({
      name: trimmedName,
      imageUrl: imageUrl?.trim() || null,
      bio: bio?.trim() || null,
    });
    // Existing videos by this author pick up the photo.
    if (author.imageUrl) await updateVideosWhere("author", trimmedName, { authorImageUrl: author.imageUrl });

    return NextResponse.json({
      success: true,
      author: { ...author, videoCount: 0 },
      message: `Author "${trimmedName}" created successfully`,
    });
  } catch (error) {
    return errorResponse(error, "Failed to create author");
  }
}

// PATCH /api/authors - update author (optionally cascading to videos)
export async function PATCH(req: NextRequest) {
  try {
    const { id, name, imageUrl, bio, updateVideos = true } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "Author ID is required" }, { status: 400 });

    const existing = await authors.getById(id);
    if (!existing) return NextResponse.json({ success: false, error: "Author not found" }, { status: 404 });

    const newName = name ? name.trim() : existing.name;
    const newImageUrl = imageUrl !== undefined ? imageUrl?.trim() || null : existing.imageUrl ?? null;
    const newBio = bio !== undefined ? bio?.trim() || null : existing.bio ?? null;

    if (newName !== existing.name) {
      const conflict = await authors.getByName(newName);
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ success: false, error: `Another author named "${newName}" already exists` }, { status: 409 });
      }
    }

    const updated = await authors.update(id, { name: newName, imageUrl: newImageUrl, bio: newBio });

    if (updateVideos) {
      const videoPatch: { author?: string; authorImageUrl?: string | null } = {};
      if (newName !== existing.name) videoPatch.author = newName;
      if (newImageUrl !== (existing.imageUrl ?? null)) videoPatch.authorImageUrl = newImageUrl;
      if (Object.keys(videoPatch).length) await updateVideosWhere("author", existing.name, videoPatch);
    }

    return NextResponse.json({ success: true, author: updated, message: `Author "${newName}" updated successfully` });
  } catch (error) {
    return errorResponse(error, "Failed to update author");
  }
}

// DELETE /api/authors?id=...&deleteVideos=true|&reassignTo=Name
export async function DELETE(req: NextRequest) {
  try {
    const params = req.nextUrl.searchParams;
    let id = params.get("id");
    let deleteVideos = params.get("deleteVideos") === "true";
    let reassignTo = params.get("reassignTo");

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
      if (body.deleteVideos !== undefined) deleteVideos = !!body.deleteVideos;
      if (body.reassignTo) reassignTo = body.reassignTo;
    }
    if (!id) return NextResponse.json({ success: false, error: "Author ID is required" }, { status: 400 });

    const existing = await authors.getById(id);
    if (!existing) return NextResponse.json({ success: false, error: "Author not found" }, { status: 404 });

    if (deleteVideos) await deleteVideosWhere("author", existing.name);
    else if (reassignTo?.trim()) await updateVideosWhere("author", existing.name, { author: reassignTo.trim() });

    await authors.remove(id);
    return NextResponse.json({ success: true, message: `Author "${existing.name}" removed successfully` });
  } catch (error) {
    return errorResponse(error, "Failed to delete author");
  }
}
