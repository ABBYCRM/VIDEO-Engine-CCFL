"use client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { SwarmConsole } from "@/components/swarm-console";

export default function SwarmPage() {
  return (
    <AuthGuard>
    <AppShell>
      <div className="mx-auto max-w-6xl p-3 sm:p-4">
        <div className="mb-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground dark:border-[rgba(180,180,255,0.12)]">
          Spawn ephemeral workers on the spot (goal + context + criteria). Planner swarm is optional.{" "}
          <Link href="/claw" className="text-foreground underline dark:text-[var(--claw-accent)]">
            Talk to Claw
          </Link>
          {" "}to spawn from chat.
        </div>
        <SwarmConsole drivenByClaw />
      </div>
    </AppShell>
    </AuthGuard>
  );
}
