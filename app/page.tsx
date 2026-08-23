import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { GeneratorConsole } from "@/components/generator-console";
import { Mic2 } from "lucide-react";

export default function Home(){
  return <AuthGuard><AppShell>
    <div className="mb-4 rounded-2xl border border-violet-200 bg-violet-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-semibold text-violet-950"><Mic2 size={17}/>Podcast / split-screen</div>
          <p className="mt-1 text-sm text-violet-800">Use the two-lane composer when the campaign needs an uploaded or AI-generated upper video plus an independently generated lower host/reporter.</p>
        </div>
        <Link href="/podcast-interview" className="inline-flex h-10 items-center justify-center rounded-xl bg-violet-600 px-4 text-sm font-semibold text-white shadow-sm hover:bg-violet-700">Open split-screen composer</Link>
      </div>
    </div>
    <GeneratorConsole/>
  </AppShell></AuthGuard>
}
