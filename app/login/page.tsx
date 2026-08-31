"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
// 2026-08-30: DuckMark stripped with the rest of the pre-Claw build

export default function Login() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();
  async function submit(e: FormEvent) {
    e.preventDefault();
    const r = await fetch("/api/admin/login", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password }) });
    if (r.ok) router.replace("/"); else setError("Invalid password");
  }
  return (
    <main className="grid min-h-screen place-items-center px-4">
      <div className="soro-card w-full max-w-sm p-7">
        <div className="mb-6 grid place-items-center">
          <Lock size={64} />
          <h1 className="mt-4 text-2xl font-semibold tracking-tight text-slate-900">VIDEO-Engine</h1>
          <p className="mt-1 text-sm text-slate-500">Admin console</p>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-slate-400" size={16} />
            <Input
              className="soro-ring pl-9 border-slate-200 bg-white"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
            />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <Button type="submit" className="w-full bg-violet-600 text-white hover:bg-violet-700">
            Sign in
          </Button>
        </form>
      </div>
    </main>
  );
}
