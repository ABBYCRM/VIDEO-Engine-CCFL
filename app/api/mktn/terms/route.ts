import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { explainAllTerms, explainTerm, findTerms } from "@/lib/mktn/usage";

export async function GET(request: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  const terms = query ? findTerms(query).map(explainTerm) : explainAllTerms();
  return NextResponse.json({ terms, count: terms.length });
}
