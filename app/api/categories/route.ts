import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// Predefined palette colors for categories if not specified
const DEFAULT_COLORS = [
  "#ef4444", // red
  "#f97316", // orange
  "#f59e0b", // amber
  "#10b981", // emerald
  "#06b6d4", // cyan
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
];

// GET /api/categories - List all categories with video count + optional auto-sync from videos
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const shouldSync = searchParams.get("sync") === "true";

    // Check count of categories
    const existingCount = await prisma.category.count();

    // Auto-sync if requested or if Category table is currently empty
    if (shouldSync || existingCount === 0) {
      const distinctVideoSubjects = await prisma.video.findMany({
        select: {
          subject: true,
        },
        distinct: ["subject"],
      });

      let colorIndex = 0;
      for (const item of distinctVideoSubjects) {
        if (!item.subject || !item.subject.trim()) continue;
        const trimmed = item.subject.trim();

        const found = await prisma.category.findUnique({
          where: { name: trimmed },
        });

        if (!found) {
          const color = DEFAULT_COLORS[colorIndex % DEFAULT_COLORS.length];
          colorIndex++;
          await prisma.category.create({
            data: {
              name: trimmed,
              color,
            },
          });
        }
      }
    }

    // Get all categories ordered alphabetically
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });

    // Get video counts per category (subject)
    const videoCounts = await prisma.video.groupBy({
      by: ["subject"],
      _count: {
        id: true,
      },
    });

    const countMap = new Map<string, number>();
    for (const vc of videoCounts) {
      countMap.set(vc.subject.toLowerCase(), vc._count.id);
    }

    const result = categories.map((cat) => ({
      ...cat,
      videoCount: countMap.get(cat.name.toLowerCase()) || 0,
    }));

    return NextResponse.json({
      success: true,
      categories: result,
      total: result.length,
    });
  } catch (error) {
    console.error("GET /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch categories" },
      { status: 500 }
    );
  }
}

// POST /api/categories - Create new category
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, description, color } = body;

    if (!name || !name.trim()) {
      return NextResponse.json(
        { success: false, error: "Category name is required" },
        { status: 400 }
      );
    }

    const trimmedName = name.trim();

    // Check if category name already exists
    const existing = await prisma.category.findUnique({
      where: { name: trimmedName },
    });

    if (existing) {
      return NextResponse.json(
        { success: false, error: `Category "${trimmedName}" already exists` },
        { status: 409 }
      );
    }

    const assignedColor =
      color?.trim() || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)];

    const category = await prisma.category.create({
      data: {
        name: trimmedName,
        description: description?.trim() || null,
        color: assignedColor,
      },
    });

    return NextResponse.json({
      success: true,
      category: { ...category, videoCount: 0 },
      message: `Category "${trimmedName}" created successfully`,
    });
  } catch (error) {
    console.error("POST /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to create category" },
      { status: 500 }
    );
  }
}

// PATCH /api/categories - Update category
export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, name, description, color, updateVideos = true } = body;

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Category ID is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    const newName = name ? name.trim() : existing.name;
    const newDescription = description !== undefined ? (description ? description.trim() : null) : existing.description;
    const newColor = color !== undefined ? (color ? color.trim() : null) : existing.color;

    // If name changed, check uniqueness
    if (newName !== existing.name) {
      const conflict = await prisma.category.findUnique({
        where: { name: newName },
      });
      if (conflict && conflict.id !== id) {
        return NextResponse.json(
          { success: false, error: `Another category named "${newName}" already exists` },
          { status: 409 }
        );
      }
    }

    const updated = await prisma.category.update({
      where: { id },
      data: {
        name: newName,
        description: newDescription,
        color: newColor,
      },
    });

    // Cascade rename to videos if requested
    if (updateVideos && newName !== existing.name) {
      await prisma.video.updateMany({
        where: { subject: existing.name },
        data: { subject: newName },
      });
    }

    return NextResponse.json({
      success: true,
      category: updated,
      message: `Category "${updated.name}" updated successfully`,
    });
  } catch (error) {
    console.error("PATCH /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to update category" },
      { status: 500 }
    );
  }
}

// DELETE /api/categories - Delete category
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
        { success: false, error: "Category ID is required" },
        { status: 400 }
      );
    }

    const existing = await prisma.category.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json(
        { success: false, error: "Category not found" },
        { status: 404 }
      );
    }

    // Handle existing videos under this category/subject
    if (deleteVideos) {
      await prisma.video.deleteMany({
        where: { subject: existing.name },
      });
    } else if (reassignTo && reassignTo.trim()) {
      await prisma.video.updateMany({
        where: { subject: existing.name },
        data: { subject: reassignTo.trim() },
      });
    }

    await prisma.category.delete({
      where: { id },
    });

    return NextResponse.json({
      success: true,
      message: `Category "${existing.name}" removed successfully`,
    });
  } catch (error) {
    console.error("DELETE /api/categories error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to delete category" },
      { status: 500 }
    );
  }
}

