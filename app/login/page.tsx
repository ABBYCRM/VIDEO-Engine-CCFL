"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ClawLogo } from "@/components/claw-logo";

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (r.ok) {
        router.replace("/create");
        return;
      }
      const body = await r.json().catch(() => ({}));
      setError(typeof body.error === "string" ? body.error : "Invalid password");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-[hsl(var(--claw-elevated))] p-7">
        <div className="mb-6 grid place-items-center">
          <ClawLogo size={56} className="rounded-xl" alt="" />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-foreground">VIDEO-Engine</h1>
          <p className="mt-1 text-sm text-muted-foreground">Admin console</p>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-muted-foreground" size={16} />
            <Input
              className="pl-9"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
              autoComplete="current-password"
            />
          </div>
          {error && <div className="text-sm text-rose-500">{error}</div>}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </div>
    </main>
  );
}
