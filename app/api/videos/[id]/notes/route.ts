import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const notes = await prisma.note.findMany({
      where: { videoId: id },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ success: true, notes });
  } catch (error: any) {
    console.error("GET notes error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const { content, videoTimestamp } = body;

    if (!content || !content.trim()) {
      return NextResponse.json(
        { success: false, error: "Content is required" },
        { status: 400 }
      );
    }

    const note = await prisma.note.create({
      data: {
        videoId: id,
        content: content.trim(),
        videoTimestamp: typeof videoTimestamp === "number" ? videoTimestamp : null,
      },
    });

    return NextResponse.json({ success: true, note });
  } catch (error: any) {
    console.error("POST note error:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}

