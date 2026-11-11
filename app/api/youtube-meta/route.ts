import { NextRequest, NextResponse } from "next/server";
import { fetchYouTubeMetadata } from "@/lib/youtube";
import { suggestClassificationWithGemini } from "@/lib/gemini";
import prisma from "@/lib/prisma";

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();
    if (!url) {
      return NextResponse.json(
        { success: false, error: "URL is required" },
        { status: 400 }
      );
    }

    // 1. Fetch raw YouTube metadata
    const metadata = await fetchYouTubeMetadata(url);

    // 2. Fetch existing authors from DB (registered authors + any distinct authors on videos)
    const [dbAuthors, distinctVideoAuthors] = await Promise.all([
      prisma.author.findMany({
        select: { name: true, imageUrl: true, bio: true },
        orderBy: { name: "asc" },
      }),
      prisma.video.findMany({
        select: { author: true, authorImageUrl: true },
        distinct: ["author"],
      }),
    ]);

    const authorsMap = new Map<string, { name: string; imageUrl?: string | null; bio?: string | null }>();
    dbAuthors.forEach((a) => {
      authorsMap.set(a.name.toLowerCase(), a);
    });
    distinctVideoAuthors.forEach((v) => {
      if (!v.author) return;
      const key = v.author.toLowerCase();
      if (!authorsMap.has(key)) {
        authorsMap.set(key, { name: v.author, imageUrl: v.authorImageUrl || null });
      } else if (!authorsMap.get(key)?.imageUrl && v.authorImageUrl) {
        const existing = authorsMap.get(key)!;
        existing.imageUrl = v.authorImageUrl;
      }
    });

    const existingAuthors = Array.from(authorsMap.values());

    // 3. Fetch existing categories from DB (registered categories + any distinct subjects on videos)
    const [dbCategories, distinctVideoSubjects] = await Promise.all([
      prisma.category.findMany({
        select: { name: true, description: true },
        orderBy: { name: "asc" },
      }),
      prisma.video.findMany({
        select: { subject: true },
        distinct: ["subject"],
      }),
    ]);

    const categoriesMap = new Map<string, { name: string; description?: string | null }>();
    dbCategories.forEach((c) => {
      categoriesMap.set(c.name.toLowerCase(), c);
    });
    distinctVideoSubjects.forEach((v) => {
      if (!v.subject) return;
      const key = v.subject.toLowerCase();
      if (!categoriesMap.has(key)) {
        categoriesMap.set(key, { name: v.subject });
      }
    });

    const existingCategories = Array.from(categoriesMap.values());

    // 4. Send to Gemini with full database context
    const classification = await suggestClassificationWithGemini(
      metadata.title,
      metadata.author,
      existingAuthors,
      existingCategories
    );

    return NextResponse.json({
      success: true,
      metadata: {
        ...metadata,
        suggestedAuthor: classification.author,
        suggestedAuthorImageUrl: classification.authorImageUrl,
        isExistingAuthor: classification.isExistingAuthor,
        suggestedSubject: classification.subject,
        isExistingCategory: classification.isExistingCategory,
        suggestedTags: classification.tags,
        explanation: classification.explanation,
      },
    });
  } catch (error: any) {
    console.error("POST /api/youtube-meta error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to fetch YouTube metadata" },
      { status: 500 }
    );
  }
}
