"use client";

import { useCallback, useEffect, useState } from "react";
import { RefreshCcw, CircleCheck, CircleAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type Row = {
  id: string;
  kind: string;
  configured: boolean;
  missing: boolean;
  when: string;
  owner?: string;
  note?: string;
};

type Payload = {
  ok: boolean;
  refreshedAt?: string;
  connectors?: Row[];
  configured?: number;
  missing?: number;
  composio?: { configured: boolean; transport?: string };
};

export function ConnectorsPanel() {
  const [data, setData] = useState<Payload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const r = await fetch("/api/connectors", { cache: "no-store", credentials: "same-origin" });
      const json = await r.json().catch(() => null);
      if (!r.ok || !json?.ok) {
        setError(json?.error || `HTTP ${r.status}`);
        return;
      }
      setData(json);
    } catch (e) {
      setError(e instanceof Error ? e.message : "refresh failed");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => { void reload(); }, [reload]);

  const rows = data?.connectors || [];

  return (
    <Card className="p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div>
          <h2 className="text-[15px] font-semibold">Connector / MCP registry</h2>
          <p className="text-[12px] text-muted-foreground">
            Live status from `connector_status`. Composio MCP: {data?.composio?.transport || "https://connect.composio.dev/mcp"}.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => void reload()} disabled={busy} aria-label="Refresh connectors">
          <RefreshCcw size={13} className={busy ? "animate-spin" : ""} />
          Refresh
        </Button>
      </div>
      {error && <p className="mb-2 text-[12px] text-destructive">{error}</p>}
      <p className="mb-3 text-[12px] text-muted-foreground">
        {data ? `${data.configured ?? 0} configured · ${data.missing ?? 0} missing` : "Loading…"}
        {data?.refreshedAt ? ` · ${data.refreshedAt}` : ""}
      </p>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex items-start justify-between gap-3 rounded-lg border border-border px-3 py-2">
            <div>
              <div className="flex items-center gap-2 text-[13px] font-medium">
                {row.configured ? <CircleCheck size={14} className="text-emerald-500" /> : <CircleAlert size={14} className="text-amber-500" />}
                {row.id}
                <span className="text-[10px] uppercase text-muted-foreground">{row.kind}</span>
              </div>
              <p className="text-[12px] text-muted-foreground">{row.when}</p>
              {row.note && <p className="text-[11px] text-muted-foreground">{row.note}</p>}
            </div>
            <span className="shrink-0 text-[11px] font-medium">
              {row.configured ? "configured" : "missing"}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
