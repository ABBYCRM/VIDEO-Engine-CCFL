"use client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { SwarmConsole } from "@/components/swarm-console";

export default function SwarmPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-3 sm:p-4">
        <div className="mb-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground dark:border-[rgba(180,180,255,0.12)]">
          Swarm is planner + workers + leader that Claw tasks from chat.{" "}
          <Link href="/claw" className="text-foreground underline dark:text-[var(--claw-accent)]">
            Talk to Claw
          </Link>
          {" "}— do not click Run swarm.
        </div>
        <SwarmConsole drivenByClaw />
      </div>
    </AppShell>
  );
}
