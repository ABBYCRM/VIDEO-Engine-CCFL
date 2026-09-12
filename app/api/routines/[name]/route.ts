import { aionRoutines } from "@/lib/claw/aion";
import { brainResponse, denyUnlessAdmin } from "@/lib/claw/brain-route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { name } = await ctx.params;
  const result = await aionRoutines({ op: "get", name });
  return brainResponse(result, result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 404);
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ name: string }> }) {
  const denied = await denyUnlessAdmin();
  if (denied) return denied;
  const { name } = await ctx.params;
  const result = await aionRoutines({ op: "delete", name });
  return brainResponse(result, result.ok ? 200 : result.code === "AION_UNCONFIGURED" ? 503 : 404);
}
