import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const subject = searchParams.get("subject");
    const author = searchParams.get("author");
    const tag = searchParams.get("tag");
    const rating = searchParams.get("rating");
    const isArchived = searchParams.get("isArchived");
    const history = searchParams.get("history");
    const search = searchParams.get("search");

    const where: any = {};

    if (subject && subject !== "all") {
      where.subject = subject;
    }
    if (author && author !== "all") {
      where.author = author;
    }
    if (rating && rating !== "all") {
      const parsedRating = parseInt(rating, 10);
      if (!isNaN(parsedRating)) {
        where.rating = parsedRating;
      }
    }
    if (isArchived !== null && isArchived !== undefined) {
      if (isArchived === "true") where.isArchived = true;
      if (isArchived === "false") where.isArchived = false;
    }

    if (history === "true") {
      where.lastWatchedAt = { not: null };
    }

    if (search) {
      where.OR = [
        { title: { contains: search } },
        { author: { contains: search } },
        { subject: { contains: search } },
      ];
    }

    let videos = await prisma.video.findMany({
      where,
      include: {
        notes: {
          orderBy: { createdAt: "desc" },
        },
      },
      orderBy: history === "true" ? { lastWatchedAt: "desc" } : { createdAt: "desc" },
    });

    // Tag filtering
    if (tag && tag !== "all") {
      videos = videos.filter((v) => {
        try {
          const tags: string[] = JSON.parse(v.tags);
          return tags.some((t) => t.toLowerCase() === tag.toLowerCase());
        } catch {
          return false;
        }
      });
    }

    const formatted = videos.map((v) => ({
      ...v,
      tags: (() => {
        try {
          return JSON.parse(v.tags);
        } catch {
          return [];
        }
      })(),
    }));

    return NextResponse.json({ success: true, videos: formatted });
  } catch (error: any) {
    console.error("GET /api/videos error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch videos" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      youtubeUrl,
      youtubeId,
      title,
      thumbnailUrl,
      author,
      authorImageUrl,
      subject,
      tags,
      rating,
      isArchived,
      duration,
    } = body;

    if (!youtubeUrl || !youtubeId || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (youtubeUrl, youtubeId, title)" },
        { status: 400 }
      );
    }

    const tagsJson = Array.isArray(tags) ? JSON.stringify(tags) : JSON.stringify([]);

    const newVideo = await prisma.video.create({
      data: {
        youtubeUrl,
        youtubeId,
        title,
        thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
        author: author || "Unknown Author",
        authorImageUrl: authorImageUrl || null,
        subject: subject || "General",
        tags: tagsJson,
        rating: typeof rating === "number" ? rating : parseInt(rating, 10) || 0,
        isArchived: Boolean(isArchived),
        duration: typeof duration === "number" ? duration : parseFloat(duration) || 0,
        watchProgress: 0,
        lastPosition: 0,
      },
      include: {
        notes: true,
      },
    });

    // Auto-register Author and Category in taxonomy tables if not already present
    try {
      const cleanAuthor = (author || "Unknown Author").trim();
      await prisma.author.upsert({
        where: { name: cleanAuthor },
        update: authorImageUrl ? { imageUrl: authorImageUrl } : {},
        create: { name: cleanAuthor, imageUrl: authorImageUrl || null },
      });
    } catch {}

    try {
      const cleanSubject = (subject || "General").trim();
      await prisma.category.upsert({
        where: { name: cleanSubject },
        update: {},
        create: { name: cleanSubject },
      });
    } catch {}

    return NextResponse.json({
      success: true,
      video: {
        ...newVideo,
        tags: Array.isArray(tags) ? tags : [],
      },
    });
  } catch (error: any) {
    console.error("POST /api/videos error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to create video" },
      { status: 500 }
    );
  }
}
