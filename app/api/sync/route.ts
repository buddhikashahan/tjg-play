import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Force dynamic so Next.js never caches this check
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [videoCount, authorCount, categoryCount, noteCount] = await Promise.all([
      prisma.video.count(),
      prisma.author.count(),
      prisma.category.count(),
      prisma.note.count(),
    ]);

    const [latestVideo, latestAuthor, latestCategory] = await Promise.all([
      prisma.video.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.author.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
      prisma.category.findFirst({
        orderBy: { updatedAt: "desc" },
        select: { updatedAt: true },
      }),
    ]);

    const versionToken = [
      videoCount,
      authorCount,
      categoryCount,
      noteCount,
      latestVideo?.updatedAt ? new Date(latestVideo.updatedAt).getTime() : 0,
      latestAuthor?.updatedAt ? new Date(latestAuthor.updatedAt).getTime() : 0,
      latestCategory?.updatedAt ? new Date(latestCategory.updatedAt).getTime() : 0,
    ].join(":");

    return NextResponse.json(
      {
        success: true,
        version: versionToken,
        counts: { videoCount, authorCount, categoryCount, noteCount },
        timestamp: Date.now(),
      },
      {
        headers: {
          "Cache-Control": "no-store, max-age=0",
        },
      }
    );
  } catch (error) {
    console.error("GET /api/sync error:", error);
    return NextResponse.json(
      { success: false, error: "Sync check failed" },
      { status: 500 }
    );
  }
}

