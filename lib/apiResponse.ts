import { NextResponse } from "next/server";
import { FirebaseNotConfiguredError } from "./firebaseAdmin";

/** Logs the error and returns a JSON error response the UI can show. */
export function errorResponse(error: unknown, fallback: string, status = 500) {
  console.error(`${fallback}:`, error);
  if (error instanceof FirebaseNotConfiguredError) {
    return NextResponse.json({ success: false, error: error.message }, { status: 503 });
  }
  const message = error instanceof Error && error.message ? error.message : fallback;
  return NextResponse.json({ success: false, error: message }, { status });
}
