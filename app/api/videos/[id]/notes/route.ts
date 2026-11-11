import { NextRequest, NextResponse } from "next/server";
import { addNote, getVideo, listNotes } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";

type Params = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    return NextResponse.json({ success: true, notes: await listNotes(id) });
  } catch (error) {
    return errorResponse(error, "Failed to fetch notes");
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  try {
    const { id } = await params;
    const { content, videoTimestamp } = await request.json();

    if (typeof content !== "string" || !content.trim()) {
      return NextResponse.json({ success: false, error: "Content is required" }, { status: 400 });
    }
    if (!(await getVideo(id))) {
      return NextResponse.json({ success: false, error: "Video not found" }, { status: 404 });
    }

    const note = await addNote(id, content.trim(), typeof videoTimestamp === "number" ? videoTimestamp : null);
    return NextResponse.json({ success: true, note });
  } catch (error) {
    return errorResponse(error, "Failed to save note");
  }
}
