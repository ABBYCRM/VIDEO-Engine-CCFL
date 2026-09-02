// GET /api/integrations/composio/catalog?q=slack
//   -> { configured, items: [{ slug, name, logo, description, categories, toolsCount }] }
//
// Powers the "Add a toolkit" searchable dropdown in Settings. The full
// Composio app catalog is fetched once and cached (see getComposioCatalog);
// we filter it server-side by the operator's query so the client only ever
// receives the top matches.

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import {
  ComposioAuthError,
  isComposioConfigured,
  searchComposioCatalog
} from "@/lib/composio/client";

export async function GET(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!isComposioConfigured()) {
    return NextResponse.json({ configured: false, items: [] });
  }
  const url = new URL(req.url);
  const q = url.searchParams.get("q") || "";
  try {
    const items = await searchComposioCatalog(q, 40);
    return NextResponse.json({ configured: true, items });
  } catch (e) {
    if (e instanceof ComposioAuthError) {
      return NextResponse.json({ configured: false, items: [], error: e.message }, { status: 400 });
    }
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ configured: true, items: [], error: `Composio catalog fetch failed: ${msg}` }, { status: 502 });
  }
}
