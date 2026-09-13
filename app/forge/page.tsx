"use client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ForgeConsole } from "@/components/forge-console";

export default function ForgePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-3 sm:p-4">
        <div className="mb-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground dark:border-[rgba(180,180,255,0.12)]">
          Forge is a tool Claw builds and tasks.{" "}
          <Link href="/claw" className="text-foreground underline dark:text-[var(--claw-accent)]">
            Talk to Claw
          </Link>
          {" "}— do not click New session or Probe.
        </div>
        <ForgeConsole drivenByClaw />
      </div>
    </AppShell>
  );
}
