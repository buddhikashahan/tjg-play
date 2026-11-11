import { NextRequest, NextResponse } from "next/server";
import { authors, categories, createVideo, listVideos } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const subject = params.get("subject");
    const author = params.get("author");
    const tag = params.get("tag")?.toLowerCase();
    const rating = params.get("rating");
    const isArchived = params.get("isArchived");
    const history = params.get("history") === "true";
    const search = params.get("search")?.toLowerCase();

    let videos = await listVideos();

    if (subject && subject !== "all") videos = videos.filter((v) => v.subject === subject);
    if (author && author !== "all") videos = videos.filter((v) => v.author === author);
    if (rating && rating !== "all" && !isNaN(parseInt(rating, 10))) {
      videos = videos.filter((v) => v.rating === parseInt(rating, 10));
    }
    if (isArchived === "true") videos = videos.filter((v) => v.isArchived);
    if (isArchived === "false") videos = videos.filter((v) => !v.isArchived);
    if (tag && tag !== "all") videos = videos.filter((v) => v.tags.some((t) => t.toLowerCase() === tag));
    if (search) {
      videos = videos.filter((v) =>
        [v.title, v.author, v.subject].some((field) => field.toLowerCase().includes(search))
      );
    }
    if (history) {
      videos = videos
        .filter((v) => v.lastWatchedAt)
        .sort((a, b) => new Date(b.lastWatchedAt!).getTime() - new Date(a.lastWatchedAt!).getTime());
    }

    return NextResponse.json({ success: true, videos });
  } catch (error) {
    return errorResponse(error, "Failed to fetch videos");
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { youtubeUrl, youtubeId, title, thumbnailUrl, author, authorImageUrl, subject, tags, rating, isArchived, duration } = body;

    if (!youtubeUrl || !youtubeId || !title) {
      return NextResponse.json(
        { success: false, error: "Missing required fields (youtubeUrl, youtubeId, title)" },
        { status: 400 }
      );
    }

    const cleanAuthor = (author || "Unknown Author").trim();
    const cleanSubject = (subject || "General").trim();

    const video = await createVideo({
      youtubeUrl,
      youtubeId,
      title,
      thumbnailUrl: thumbnailUrl || `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`,
      author: cleanAuthor,
      authorImageUrl: authorImageUrl || null,
      subject: cleanSubject,
      tags: Array.isArray(tags) ? tags : [],
      rating: Number(rating) || 0,
      isArchived: Boolean(isArchived),
      duration: Number(duration) || 0,
      watchProgress: 0,
      lastPosition: 0,
      lastWatchedAt: null,
    });

    // Register the author and category so they appear in the admin pickers.
    const existingAuthor = await authors.getByName(cleanAuthor);
    if (!existingAuthor) await authors.create({ name: cleanAuthor, imageUrl: authorImageUrl || null, bio: null });
    else if (authorImageUrl && existingAuthor.imageUrl !== authorImageUrl) {
      await authors.update(existingAuthor.id, { imageUrl: authorImageUrl });
    }
    await categories.ensure(cleanSubject);

    return NextResponse.json({ success: true, video });
  } catch (error) {
    return errorResponse(error, "Failed to create video");
  }
}
