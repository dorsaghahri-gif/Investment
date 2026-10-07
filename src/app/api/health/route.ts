import { NextResponse } from "next/server";

/** Liveness only — reveals nothing about data or configuration. */
export function GET() {
  return NextResponse.json({ ok: true, time: new Date().toISOString() });
}
