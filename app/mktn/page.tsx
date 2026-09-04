import { AuthGuard } from "@/components/auth-guard";
import { AppShell } from "@/components/app-shell";
import { MktnConsole } from "@/components/mktn-console";
import { PageHeader } from "@/components/ui/page-header";
import { Megaphone } from "lucide-react";

export default function MktnPage() {
  return <AuthGuard><AppShell><div className="mx-auto w-full max-w-[1240px] px-4 sm:px-7 lg:px-10"><PageHeader eyebrow="Campaign intelligence" eyebrowIcon={<Megaphone size={14} />} title="MKTN" description="One operational surface for market language, strategy, creative generation, and Composio distribution—with resilient provider routing built in." /><MktnConsole /></div></AppShell></AuthGuard>;
}
