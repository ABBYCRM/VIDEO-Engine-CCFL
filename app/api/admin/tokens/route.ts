import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { issueApiToken, listApiTokens } from "@/lib/tokens";
export async function GET() { if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); return NextResponse.json({ tokens: listApiTokens() }); }
export async function POST(req: Request) { if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 }); const { name } = await req.json(); if (!String(name||"").trim()) return NextResponse.json({ error: "Name is required" }, { status: 400 }); return NextResponse.json(issueApiToken(String(name).trim()), { status: 201 }); }
