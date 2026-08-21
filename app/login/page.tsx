"use client";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { DuckMark } from "@/components/duck-mark";

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
      <Card className="w-full max-w-sm glass-card p-7">
        <div className="mb-6 grid place-items-center">
          <DuckMark size={64} />
          <h1 className="mt-4 text-2xl font-semibold bg-gradient-to-r from-slate-900 via-slate-700 to-slate-900 bg-clip-text text-transparent">VIDEO-Engine</h1>
          <p className="mt-1 text-sm text-slate-500">Admin console</p>
        </div>
        <form onSubmit={submit} className="grid gap-3">
          <div className="relative">
            <Lock className="absolute left-3 top-3.5 text-slate-600" size={16} />
            <Input
              className="pl-9 bg-white/80 border-slate-200 focus-visible:ring-cyan-400"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Admin password"
              autoFocus
            />
          </div>
          {error && <div className="text-sm text-rose-600">{error}</div>}
          <Button type="submit" className="bg-slate-100 text-white hover:bg-slate-100">
            Sign in
          </Button>
        </form>
      </Card>
    </main>
  );
}
