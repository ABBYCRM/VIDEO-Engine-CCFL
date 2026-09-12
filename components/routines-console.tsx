"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";

type Routine = { name: string; trigger?: string; steps?: unknown[]; success?: string; status?: string };

export function RoutinesConsole() {
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [trigger, setTrigger] = useState("");

  const reload = useCallback(async () => {
    const r = await fetch("/api/routines", { cache: "no-store", credentials: "same-origin" });
    const json = await r.json().catch(() => null);
    if (!r.ok || !json?.ok) {
      setError(json?.error || json?.hint || `HTTP ${r.status}`);
      setRoutines([]);
      return;
    }
    setError(null);
    setRoutines(Array.isArray(json.routines) ? json.routines : json.routine ? [json.routine] : []);
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  async function act(path: string, init?: RequestInit) {
    setBusy(true);
    try {
      const r = await fetch(path, { credentials: "same-origin", ...init });
      const json = await r.json().catch(() => null);
      if (!r.ok || json?.ok === false) setError(json?.error || `HTTP ${r.status}`);
      await reload();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4">
      <Card className="p-4">
        <h2 className="mb-2 text-[15px] font-semibold">Create routine</h2>
        <p className="mb-3 text-[12px] text-muted-foreground">Persists on Aion-Brain `routines.sqlite` via `/api/routines`. Not a local throwaway.</p>
        <form
          className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]"
          onSubmit={(e) => {
            e.preventDefault();
            void act("/api/routines", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, trigger, steps: [{ note: trigger || name }], success: "operator-defined" }),
            }).then(() => { setName(""); setTrigger(""); });
          }}
        >
          <Input aria-label="Routine name" placeholder="name" value={name} onChange={(e) => setName(e.target.value)} required />
          <Input aria-label="Routine trigger" placeholder="trigger" value={trigger} onChange={(e) => setTrigger(e.target.value)} required />
          <Button type="submit" disabled={busy || !name.trim()}>Create</Button>
        </form>
        {error && <p className="mt-2 text-[12px] text-destructive">{error}</p>}
      </Card>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-semibold">Brain routines</h2>
          <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={busy}>Refresh</Button>
        </div>
        {!routines.length && <p className="text-[13px] text-muted-foreground">No routines loaded. Brain HOLD if AION is unconfigured.</p>}
        <ul className="grid gap-2">
          {routines.map((row) => (
            <li key={row.name} className="rounded-lg border border-border px-3 py-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{row.name} · {row.status || "active"}</div>
                  <p className="text-[12px] text-muted-foreground">{row.trigger}</p>
                </div>
                <div className="flex gap-1">
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(`/api/routines/${encodeURIComponent(row.name)}/run`, { method: "POST" })}>Run</Button>
                  {row.status === "paused"
                    ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(`/api/routines/${encodeURIComponent(row.name)}/resume`, { method: "POST" })}>Resume</Button>
                    : <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(`/api/routines/${encodeURIComponent(row.name)}/pause`, { method: "POST" })}>Pause</Button>}
                  <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void act(`/api/routines/${encodeURIComponent(row.name)}`, { method: "DELETE" })}>Delete</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
