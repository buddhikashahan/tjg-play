import { NextResponse } from "next/server";
import { getSyncVersion } from "@/lib/db";
import { errorResponse } from "@/lib/apiResponse";

// Never cached: the TV polls this to notice library changes.
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    return NextResponse.json(
      { success: true, version: await getSyncVersion(), timestamp: Date.now() },
      { headers: { "Cache-Control": "no-store, max-age=0" } }
    );
  } catch (error) {
    return errorResponse(error, "Sync check failed");
  }
}
