import { NextRequest, NextResponse } from "next/server";
import { parseVoiceCommandWithGemini } from "@/lib/gemini";

export async function POST(request: NextRequest) {
  try {
    const { transcript, context } = await request.json();

    if (!transcript || typeof transcript !== "string") {
      return NextResponse.json(
        { success: false, error: "Transcript is required" },
        { status: 400 }
      );
    }

    const aiResult = await parseVoiceCommandWithGemini(
      transcript,
      context || {}
    );

    return NextResponse.json({
      success: true,
      result: aiResult,
    });
  } catch (error: any) {
    console.error("POST /api/ai-command error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || "Failed to process voice command",
        result: {
          action: "UNKNOWN",
          feedbackMessage: "Sorry, I had trouble processing that command.",
        },
      },
      { status: 500 }
    );
  }
}

