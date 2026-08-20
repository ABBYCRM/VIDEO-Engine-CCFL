import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
export async function GET() { return (await requireAdmin()) ? NextResponse.json({ authenticated: true }) : NextResponse.json({ authenticated: false }, { status: 401 }); }
