import type { Metadata } from "next";
import { LineChart } from "lucide-react";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const ERRORS: Record<string, string> = {
  not_authorized: "This account is not authorized for this workspace.",
  link_invalid: "That sign-in link is invalid or has expired. Request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main className="flex min-h-screen items-center justify-center bg-sidebar px-4">
      <div className="w-full max-w-sm rounded-xl border border-white/10 bg-card p-8 shadow-xl">
        <div className="mb-6 flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <LineChart className="size-4" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-tight">Stock Intel</div>
            <div className="text-xs text-muted-foreground">Personal investment intelligence</div>
          </div>
        </div>
        {error && ERRORS[error] && <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">{ERRORS[error]}</p>}
        <LoginForm />
        <p className="mt-6 text-[11px] leading-relaxed text-muted-foreground">
          Research and decision support only. This application never places trades.
        </p>
      </div>
    </main>
  );
}
