/**
 * Session refresh + auth gate used by src/proxy.ts.
 * Follows @supabase/ssr guidance: getAll/setAll on the request+response pair.
 */
import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PUBLIC_PATHS = ["/login", "/auth/", "/api/cron/", "/api/health"];

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.some((p) => (p.endsWith("/") ? pathname.startsWith(p) : pathname === p));
}

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    // Misconfiguration: fail closed for app routes.
    if (isPublicPath(request.nextUrl.pathname)) return response;
    return new NextResponse("Server misconfigured: Supabase env vars missing.", { status: 500 });
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        for (const [k, v] of Object.entries(headers ?? {})) response.headers.set(k, v);
      },
    },
  });

  // Verifies the JWT (do not run code between client creation and this call).
  const { data } = await supabase.auth.getClaims();
  // Proxy only requires a verified session. Invite-list membership is enforced
  // by the DAL (every page) and by restrictive RLS on every table.
  const authed = !!data?.claims?.sub;

  const { pathname } = request.nextUrl;
  if (!authed && !isPublicPath(pathname)) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    const redirect = NextResponse.redirect(loginUrl);
    for (const c of response.cookies.getAll()) redirect.cookies.set(c);
    return redirect;
  }
  if (authed && pathname === "/login" && !request.nextUrl.searchParams.has("error")) {
    const home = request.nextUrl.clone();
    home.pathname = "/";
    home.search = "";
    return NextResponse.redirect(home);
  }
  return response;
}
