import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  // Same-origin check (CSRF): only our own pages may sign the user out.
  const origin = request.headers.get("origin");
  if (origin && origin !== request.nextUrl.origin) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  const u = request.nextUrl.clone();
  u.pathname = "/login";
  u.search = "";
  return NextResponse.redirect(u, { status: 303 });
}
