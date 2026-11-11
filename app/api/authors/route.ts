import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET /api/authors - List all authors with video count + optional auto-sync from videos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shouldSync = searchParams.get("sync") === "true";

    // Check count of authors
    const existingCount = await prisma.author.count();

    // Auto-sync if requested or if Author table is currently empty
    if (shouldSync || existingCount === 0) {
      const distinctVideoAuthors = await prisma.video.findMany({
        select: {
          author: true,
          authorImageUrl: true,
        },
        distinct: ["author"],
      });

      for (const item of distinctVideoAuthors) {
        if (!item.author || !item.author.trim()) continue;
        const trimmed = item.author.trim();
        
        const found = await prisma.author.findUnique({
          where: { name: trimmed },
        });

        if (!found) {
          await prisma.author.create({
            data: {
              name: trimmed,
              imageUrl: item.authorImageUrl || null,
            },
          });
        } else if (!found.imageUrl && item.authorImageUrl) {
          await prisma.author.update({
            where: { id: found.id },
            data: { imageUrl: item.authorImageUrl },
          });
        }
      }
    }

    // Get all authors ordered alphabetically
    const authors = await prisma.author.findMany({
      orderBy: { name: "asc" },
    });

    // Get video counts per author
    const videoCounts = await prisma.video.groupBy({
      by: ["author"],
      _count: {
        id: true,
      },
    });

    const countMap = new Map<string, number>();
    for (const vc of videoCounts) {
      countMap.set(vc.author.toLowerCase(), vc._count.id);
    }

    const result = authors.map((author) => ({
      ...author,
      videoCount: countMap.get(author.name.toLowerCase()) || 0,
    }));

    return NextResponse.json({
      success: true,
      authors: result,
      total: result.length,
    });
  } catch (error) {
    console.error("GET /api/authors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch authors" },
      { status: 500 }
    );
  }
}

// POST /api/authors - Create new author
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, imageUrl, bio } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Author name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check if author name already exists
    const existing = await prisma.author.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Author "${trimmedName}" already exists` },
        { status: 409 }
      );
    }

    const author = await prisma.author.create({
      data: {
        name: trimmedName,
        imageUrl: imageUrl?.trim() || null,
        bio: bio?.trim() || null,
      },
    });

    // If there are existing videos matching this author name, sync the image
    if (author.imageUrl) {
      await prisma.video.updateMany({
        where: { author: trimmedName },
        data: { authorImageUrl: author.imageUrl },
      });
    }

    return NextResponse.json({
      success: true,
      author: { ...author, videoCount: 0 },
      message: `Author "${trimmedName}" created successfully`,
    });
  } catch (error) {
    console.error("POST /api/authors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create author" },
      { status: 500 }
    );
  }
}

// PATCH /api/authors - Update author
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, imageUrl, bio, updateVideos = true } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Author ID is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.author.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Author not found" },
        { status: 404 }
      );
    }

    const newName = name ? name.trim() : existing.name;
    const newImageUrl = imageUrl !== undefined ? (imageUrl ? imageUrl.trim() : null) : existing.imageUrl;
    const newBio = bio !== undefined ? (bio ? bio.trim() : null) : existing.bio;

    // If name changed, check uniqueness
    if (newName !== existing.name) {
      const conflict = await prisma.author.findUnique({
        where: { name: newName },
      });
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { success: false, error: `Another author named "${newName}" already exists` },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.author.update({
      where: { id },
      data: {
        name: newName,
        imageUrl: newImageUrl,
        bio: newBio,
      },
    });

    // Cascade to videos if requested
    if (updateVideos) {
      const updateData: { author?: string; authorImageUrl?: string | null } = {};
      if (newName !== existing.name) updateData.author = newName;
      if (newImageUrl !== existing.imageUrl) updateData.authorImageUrl = newImageUrl;

      if (Object.keys(updateData).length > 0) {
        await prisma.video.updateMany({
          where: { author: existing.name },
          data: updateData,
        });
      }
    }

    return NextResponse.json({
      success: true,
      author: updated,
      message: `Author "${updated.name}" updated successfully`,
    });
  } catch (error) {
    console.error("PATCH /api/authors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update author" },
      { status: 500 }
    );
  }
}

// DELETE /api/authors - Delete author
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    let id = searchParams.get("id");
    let deleteVideos = searchParams.get("deleteVideos") === "true";
    let reassignTo = searchParams.get("reassignTo");

    if (!id) {
      const body = await req.json().catch(() => ({}));
      id = body.id;
      if (body.deleteVideos !== undefined) deleteVideos = !!body.deleteVideos;
      if (body.reassignTo) reassignTo = body.reassignTo;
    }

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Author ID is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.author.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Author not found" },
        { status: 404 }
      );
    }

    // Handle existing videos by this author
    if (deleteVideos) {
      await prisma.video.deleteMany({
        where: { author: existing.name },
      });
    } else if (reassignTo && reassignTo.trim()) {
      await prisma.video.updateMany({
        where: { author: existing.name },
        data: { author: reassignTo.trim() },
      });
    }

    await prisma.author.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Author "${existing.name}" removed successfully`,
    });
  } catch (error) {
    console.error("DELETE /api/authors error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete author" },
      { status: 500 }
    );
  }
}

