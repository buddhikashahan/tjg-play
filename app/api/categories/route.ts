import { NextRequest, NextResponse } from "next/server";
import { categories, countVideosBy, deleteVideosWhere, listVideos, updateVideosWhere } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";

export const dynamic = "force-dynamic";

// Palette for categories created without a colour
const DEFAULT_COLORS = ["#ef4444", "#f97316", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899"];

/** Registers any subject that only exists on videos. */
async function syncCategoriesFromVideos() {
  const subjects = new Set((await listVideos()).map((v) => v.subject?.trim()).filter(Boolean));
  let colorIndex = 0;
  for (const name of subjects) {
    if (await categories.getByName(name)) continue;
    await categories.create({ name, description: null, color: DEFAULT_COLORS[colorIndex++ % DEFAULT_COLORS.length] });
  }
}

// GET /api/categories[?sync=true] - list categories with video counts
export async function GET(req: NextRequest) {
  try {
    const shouldSync = req.nextUrl.searchParams.get("sync") === "true";
    if (shouldSync || (await categories.list()).length === 0) await syncCategoriesFromVideos();

    const counts = await countVideosBy("subject");
    const result = (await categories.list()).map((c) => ({ ...c, videoCount: counts.get(c.name.toLowerCase()) || 0 }));
    return NextResponse.json({ success: true, categories: result, total: result.length });
  } catch (error) {
    return errorResponse(error, "Failed to fetch categories");
  }
}

// POST /api/categories - create category
export async function POST(req: NextRequest) {
  try {
    const { name, description, color } = await req.json();
    const trimmedName = typeof name === "string" ? name.trim() : "";
    if (!trimmedName) {
      return NextResponse.json({ success: false, error: "Category name is required" }, { status: 400 });
    }
    if (await categories.getByName(trimmedName)) {
      return NextResponse.json({ success: false, error: `Category "${trimmedName}" already exists` }, { status: 409 });
    }

    const category = await categories.create({
      name: trimmedName,
      description: description?.trim() || null,
      color: color?.trim() || DEFAULT_COLORS[Math.floor(Math.random() * DEFAULT_COLORS.length)],
    });

    return NextResponse.json({
      success: true,
      category: { ...category, videoCount: 0 },
      message: `Category "${trimmedName}" created successfully`,
    });
  } catch (error) {
    return errorResponse(error, "Failed to create category");
  }
}

// PATCH /api/categories - update category (renames cascade to videos)
export async function PATCH(req: NextRequest) {
  try {
    const { id, name, description, color, updateVideos = true } = await req.json();
    if (!id) return NextResponse.json({ success: false, error: "Category ID is required" }, { status: 400 });

    const existing = await categories.getById(id);
    if (!existing) return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });

    const newName = name ? name.trim() : existing.name;
    if (newName !== existing.name) {
      const conflict = await categories.getByName(newName);
      if (conflict && conflict.id !== id) {
        return NextResponse.json({ success: false, error: `Another category named "${newName}" already exists` }, { status: 409 });
      }
    }

    const updated = await categories.update(id, {
      name: newName,
      description: description !== undefined ? description?.trim() || null : existing.description ?? null,
      color: color !== undefined ? color?.trim() || null : existing.color ?? null,
    });

    if (updateVideos && newName !== existing.name) {
      await updateVideosWhere("subject", existing.name, { subject: newName });
    }

    return NextResponse.json({ success: true, category: updated, message: `Category "${newName}" updated successfully` });
  } catch (error) {
    return errorResponse(error, "Failed to update category");
  }
}

// DELETE /api/categories?id=...&deleteVideos=true|&reassignTo=Name
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
    if (!id) return NextResponse.json({ success: false, error: "Category ID is required" }, { status: 400 });

    const existing = await categories.getById(id);
    if (!existing) return NextResponse.json({ success: false, error: "Category not found" }, { status: 404 });

    if (deleteVideos) await deleteVideosWhere("subject", existing.name);
    else if (reassignTo?.trim()) await updateVideosWhere("subject", existing.name, { subject: reassignTo.trim() });

    await categories.remove(id);
    return NextResponse.json({ success: true, message: `Category "${existing.name}" removed successfully` });
  } catch (error) {
    return errorResponse(error, "Failed to delete category");
  }
}
