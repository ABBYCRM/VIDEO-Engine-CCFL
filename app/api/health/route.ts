import { NextResponse } from "next/server";
export async function GET() { return NextResponse.json({ ok: true, service: "VIDEO-Engine", oneShot: true, durationSeconds: 8 }); }
