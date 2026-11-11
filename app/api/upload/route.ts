import { NextRequest, NextResponse } from "next/server";
import { authors, updateVideosWhere } from "@/lib/db";
import { uploadToStorage } from "@/lib/storage";
import { errorResponse } from "@/lib/apiResponse";

const MAX_BYTES = 5 * 1024 * 1024;

// POST /api/upload (multipart: file, authorName) - stores an author photo in Firebase Storage
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const authorName = String(formData.get("authorName") || "").trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, error: "No file provided" }, { status: 400 });
    }
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ success: false, error: "Please choose an image file" }, { status: 400 });
    }
    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: "Image is larger than 5 MB" }, { status: 400 });
    }

    const ext = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
    const slug = (authorName || "author").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const url = await uploadToStorage(Buffer.from(await file.arrayBuffer()), `authors/${slug}_${Date.now()}.${ext}`, file.type);

    // If the author already exists, apply the photo everywhere right away.
    // (New authors get it when they are created, so nothing is created here.)
    const existing = authorName ? await authors.getByName(authorName) : null;
    if (existing) {
      await authors.update(existing.id, { imageUrl: url });
      await updateVideosWhere("author", existing.name, { authorImageUrl: url });
    }

    return NextResponse.json({ success: true, url, authorName });
  } catch (error) {
    return errorResponse(error, "Failed to upload image");
  }
}
