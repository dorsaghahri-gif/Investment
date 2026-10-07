/**
 * Per-request Supabase client for Server Components, Server Actions and
 * Route Handlers. Uses the publishable key + the user's session cookie,
 * so every query is subject to Row-Level Security.
 */
import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { publicEnv } from "@/lib/public-env";

export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(publicEnv.supabaseUrl, publicEnv.supabasePublishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // Called from a Server Component (read-only cookies). proxy.ts refreshes
          // the session on every request, so this is safe to ignore.
        }
      },
    },
  });
}
