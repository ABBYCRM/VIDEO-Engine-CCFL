import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { MktnConsole } from "@/components/mktn-console";
import { PageHeader } from "@/components/ui/page-header";
import { Megaphone } from "lucide-react";

export default function MktnPage() {
  return <AuthGuard><AppShell><div className="mx-auto w-full max-w-4xl px-3 sm:px-4"><PageHeader eyebrow="Claw workspace" eyebrowIcon={<Megaphone size={16} />} title="MKTN" description="Marketing terminology, campaign planning, creative generation, and Composio distribution in one tab." /><MktnConsole /></div></AppShell></AuthGuard>;
}
