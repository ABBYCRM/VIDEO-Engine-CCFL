import { NextResponse } from "next/server";
import { verifyApiToken } from "@/lib/tokens";
import { listAvatars } from "@/lib/avatars";
function bearer(req: Request) { const h = req.headers.get("authorization") || ""; return h.startsWith("Bearer ") ? h.slice(7) : ""; }
export async function GET(req: Request) {
  if (!verifyApiToken(bearer(req))) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ avatars: listAvatars() });
}
