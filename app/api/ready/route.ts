import { NextResponse } from "next/server";

/**
 * Constant-time application readiness probe.
 *
 * Keep this endpoint free of database and third-party provider calls. It is
 * used by DigitalOcean's service health check and by the Creator upload
 * preflight, where the only requirement is that this Next.js process can
 * receive an HTTP request.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      service: "Honey Badger",
      check: "readiness"
    },
    {
      headers: {
        "Cache-Control": "no-store"
      }
    }
  );
}
