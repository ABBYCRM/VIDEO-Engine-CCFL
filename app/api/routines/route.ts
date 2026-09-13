import { aionRoutines } from "@/lib/claw/aion";
import { brainResponse } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Proxy → Aion-Brain RoutineStore. Persist is Brain routines.sqlite. */
export async function GET() {
  const result = await aionRoutines({ op: "list" });
  return brainResponse(result);
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const result = await aionRoutines({
    op: "create",
    name: body.name,
    trigger: body.trigger || body.text,
    text: body.text,
    steps: body.steps,
    success: body.success,
  });
  return brainResponse(result, result.ok ? 201 : 400);
}
