import { NextRequest, NextResponse } from "next/server";
import { adminStorage } from "@/lib/firebaseAdmin";
import prisma from "@/lib/prisma";
import fs from "fs";
import path from "path";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    const authorName = (formData.get("authorName") as string) || "author";

    if (!file) {
      return NextResponse.json(
        { success: false, error: "No file provided" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const ext = file.name.split(".").pop() || "jpg";
    const cleanAuthor = authorName.replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const filename = `${cleanAuthor}_${Date.now()}.${ext}`;

    let publicUrl = "";

    // 1. Try Firebase Storage via Admin SDK if bucket is configured
    if (adminStorage) {
      try {
        const fileUpload = adminStorage.file(`authors/${filename}`);
        await fileUpload.save(buffer, {
          metadata: {
            contentType: file.type || "image/jpeg",
          },
          public: true,
        });
        publicUrl = `https://storage.googleapis.com/${adminStorage.name}/authors/${filename}`;
      } catch (fbErr) {
        console.warn("Firebase Admin storage upload failed, using local disk:", fbErr);
      }
    }

    // 2. Fallback to local /public/uploads/authors/ if Firebase is not active
    if (!publicUrl) {
      const uploadDir = path.join(process.cwd(), "public", "uploads", "authors");
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const filePath = path.join(uploadDir, filename);
      fs.writeFileSync(filePath, buffer);
      publicUrl = `/uploads/authors/${filename}`;
    }

    // 3. Update existing videos and author table for this author so their avatar shows up everywhere
    if (authorName && authorName.trim()) {
      const cleanName = authorName.trim();
      await prisma.video.updateMany({
        where: {
          author: {
            equals: cleanName,
          },
        },
        data: {
          authorImageUrl: publicUrl,
        },
      });

      // Also update Author table record if present or create if not
      try {
        await prisma.author.upsert({
          where: { name: cleanName },
          update: { imageUrl: publicUrl },
          create: { name: cleanName, imageUrl: publicUrl },
        });
      } catch (upsertErr) {
        console.warn("Could not upsert Author record:", upsertErr);
      }
    }

    return NextResponse.json({
      success: true,
      url: publicUrl,
      authorName,
    });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { success: false, error: error.message || "Failed to upload image" },
      { status: 500 }
    );
  }
}

