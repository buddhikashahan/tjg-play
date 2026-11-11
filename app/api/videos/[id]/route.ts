import { NextRequest, NextResponse } from "next/server";
import { deleteVideo, getVideo, updateVideo } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";
import type { VideoItem } from "@/lib/types";

type Params = { params: Promise<{ id: string }> };

/** Fields that only track playback; saving them doesn't make TVs reload the library. */
const PROGRESS_FIELDS = new Set(["watchProgress", "lastPosition", "duration", "lastWatchedAt"]);

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const video = await getVideo(id);
    if (!video) return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    return NextResponse.json({ success: true, video });
  } catch (error) {
    return errorResponse(error, "Failed to fetch video");
  }
}

export async function PATCH(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const body = await request.json();

    const patch: Partial<VideoItem> = {};
    if (body.rating !== undefined) patch.rating = Number(body.rating) || 0;
    if (body.isArchived !== undefined) patch.isArchived = Boolean(body.isArchived);
    if (body.title !== undefined) patch.title = body.title;
    if (body.author !== undefined) patch.author = body.author;
    if (body.authorImageUrl !== undefined) patch.authorImageUrl = body.authorImageUrl;
    if (body.subject !== undefined) patch.subject = body.subject;
    if (body.watchProgress !== undefined) patch.watchProgress = Number(body.watchProgress);
    if (body.lastPosition !== undefined) patch.lastPosition = Number(body.lastPosition);
    if (body.duration !== undefined) patch.duration = Number(body.duration);
    if (body.lastWatchedAt !== undefined) patch.lastWatchedAt = body.lastWatchedAt || new Date().toISOString();
    if (body.tags !== undefined) patch.tags = Array.isArray(body.tags) ? body.tags : [];

    const keys = Object.keys(patch);
    if (keys.length === 0) return NextResponse.json({ success: false, error: "Nothing to update" }, { status: 400 });

    const quiet = keys.every((k) => PROGRESS_FIELDS.has(k));
    const video = await updateVideo(id, patch, { quiet });
    if (!video) return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    return NextResponse.json({ success: true, video });
  } catch (error) {
    return errorResponse(error, "Failed to update video");
  }
}

export async function DELETE(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const existed = await deleteVideo(id);
    return NextResponse.json({
      success: true,
      message: existed ? "Video deleted" : "Video already removed",
      deletedCount: existed ? 1 : 0,
    });
  } catch (error) {
    return errorResponse(error, "Failed to delete video");
  }
}
