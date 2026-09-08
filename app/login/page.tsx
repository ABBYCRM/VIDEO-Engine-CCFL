"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ClawLogo } from "@/components/claw-logo";

export default function LoginPage() {
  const router = useRouter();
  const search = useSearchParams();
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/admin/session", { cache: "no-store", signal: controller.signal })
      .then((response) => {
        if (response.ok) router.replace("/claw");
      })
      .catch(() => {});
    return () => controller.abort();
  }, [router]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!password || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ password })
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error || "Login failed");
      }
      const requested = search.get("next");
      const next = requested?.startsWith("/") && !requested.startsWith("//") ? requested : "/claw";
      router.replace(next);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-10">
      <section className="w-full max-w-sm rounded-2xl border border-border bg-[hsl(var(--claw-elevated))] p-6 shadow-xl" aria-labelledby="login-title">
        <div className="mb-6 flex items-center gap-3">
          <ClawLogo className="h-10 w-10" />
          <div>
            <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">Operator console</p>
            <h1 id="login-title" className="text-xl font-semibold text-foreground">Sign in to Claw</h1>
          </div>
        </div>

        <form className="space-y-4" onSubmit={submit}>
          <div>
            <label htmlFor="admin-password" className="mb-1.5 block text-sm font-medium text-foreground">Admin password</label>
            <input
              id="admin-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none ring-offset-background focus:ring-2 focus:ring-ring"
            />
          </div>

          {error ? <p role="alert" className="text-sm text-rose-400">{error}</p> : null}

          <button
            type="submit"
            disabled={submitting || !password}
            className="w-full rounded-xl bg-foreground px-4 py-2.5 text-sm font-semibold text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </section>
    </main>
  );
}
