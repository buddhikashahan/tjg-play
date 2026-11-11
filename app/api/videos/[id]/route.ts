import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const video = await prisma.video.findUnique({
      where: { id },
      include: {
        notes: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!video) {
      return NextResponse.json(
        { success: false, error: "Video not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      video: {
        ...video,
        tags: (() => {
          try {
            return JSON.parse(video.tags);
          } catch {
            return [];
          }
        })(),
      },
    });
  } catch (error: any) {
    console.error("GET /api/videos/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();

    const dataToUpdate: any = {};
    if (body.rating !== undefined) {
      dataToUpdate.rating = typeof body.rating === "number" ? body.rating : parseInt(body.rating, 10) || 0;
    }
    if (body.isArchived !== undefined) dataToUpdate.isArchived = Boolean(body.isArchived);
    if (body.title !== undefined) dataToUpdate.title = body.title;
    if (body.author !== undefined) dataToUpdate.author = body.author;
    if (body.authorImageUrl !== undefined) dataToUpdate.authorImageUrl = body.authorImageUrl;
    if (body.subject !== undefined) dataToUpdate.subject = body.subject;
    if (body.watchProgress !== undefined) dataToUpdate.watchProgress = Number(body.watchProgress);
    if (body.lastPosition !== undefined) dataToUpdate.lastPosition = Number(body.lastPosition);
    if (body.duration !== undefined) dataToUpdate.duration = Number(body.duration);
    if (body.lastWatchedAt !== undefined) {
      dataToUpdate.lastWatchedAt = body.lastWatchedAt ? new Date(body.lastWatchedAt) : new Date();
    }
    if (body.tags !== undefined) {
      dataToUpdate.tags = Array.isArray(body.tags) ? JSON.stringify(body.tags) : body.tags;
    }

    const updated = await prisma.video.update({
      where: { id },
      data: dataToUpdate,
      include: {
        notes: {
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      video: {
        ...updated,
        tags: (() => {
          try {
            return JSON.parse(updated.tags);
          } catch {
            return [];
          }
        })(),
      },
    });
  } catch (error: any) {
    console.error("PATCH /api/videos/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { success: false, error: "Video ID is required" },
        { status: 400 }
      );
    }

    const result = await prisma.video.deleteMany({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: result.count > 0 ? "Video deleted" : "Video already removed",
      deletedCount: result.count,
    });
  } catch (error: any) {
    if (error?.code === "P2025") {
      return NextResponse.json({
        success: true,
        message: "Video already removed",
        deletedCount: 0,
      });
    }

    console.error("DELETE /api/videos/[id] error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to delete video" },
      { status: 500 }
    );
  }
}
