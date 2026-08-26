import { NextResponse } from "next/server";
import { handleYouTubeCallback } from "@/lib/youtube";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = (process.env.PUBLIC_BASE_URL || url.origin).replace(/\/$/, "");
  const oauthError = url.searchParams.get("error");
  if (oauthError) return NextResponse.redirect(`${base}/settings?youtube=${encodeURIComponent(oauthError)}`);
  const code = url.searchParams.get("code") || "";
  const state = url.searchParams.get("state") || "";
  if (!code) return NextResponse.redirect(`${base}/settings?youtube=missing_code`);
  try {
    await handleYouTubeCallback(code, state);
    return NextResponse.redirect(`${base}/settings?youtube=connected`);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return NextResponse.redirect(`${base}/settings?youtube=${encodeURIComponent(message.slice(0, 180))}`);
  }
}
