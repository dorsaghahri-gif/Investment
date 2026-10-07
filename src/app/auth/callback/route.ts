import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Magic-link landing. Supports both the PKCE `code` flow and the
 * `token_hash` email-template flow. Enforces the invite list after login.
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const flowId = url.searchParams.get("sb_flow_id");
  const supabase = await createSupabaseServerClient();

  let ok = false;
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
    ok = !error;
  } else if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type });
    ok = !error;
  }

  const to = (path: string) => {
    const u = request.nextUrl.clone();
    u.pathname = path;
    u.search = "";
    return u;
  };
  if (!ok) {
    const u = to("/login");
    u.searchParams.set("error", "link_invalid");
    return NextResponse.redirect(u);
  }

  const { data: role } = await supabase.rpc("current_access_role");
  if (role !== "owner" && role !== "member") {
    await supabase.auth.signOut();
    const u = to("/login");
    u.searchParams.set("error", "not_authorized");
    return NextResponse.redirect(u);
  }
  return NextResponse.redirect(to("/"));
}
