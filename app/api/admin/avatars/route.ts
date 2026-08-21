import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { listAvatars, createAvatar, type Avatar } from "@/lib/avatars";

export async function GET() {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({ avatars: listAvatars() });
}

export async function POST(req: Request) {
  if (!(await requireAdmin())) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const body = await req.json();
    const id = String(body.id || "").trim();
    const name = String(body.name || "").trim();
    const gender = String(body.gender || "female") as Avatar["gender"];
    const archetype = String(body.archetype || "").trim();
    const wardrobeStandard = String(body.wardrobeStandard || "").trim();
    if (!id || !name || !archetype || !wardrobeStandard) {
      return NextResponse.json({ error: "id, name, archetype, wardrobeStandard are required" }, { status: 400 });
    }
    if (!["male", "female", "non-binary"].includes(gender)) {
      return NextResponse.json({ error: "gender must be male, female, or non-binary" }, { status: 400 });
    }
    const avatar = createAvatar({ id, name, gender, archetype, wardrobeStandard, notes: String(body.notes || "") });
    return NextResponse.json({ avatar }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
