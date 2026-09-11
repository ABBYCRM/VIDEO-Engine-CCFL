"use client";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { ComputerDock } from "@/components/computer-dock";

export default function ComputerPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-4">
        <div className="mb-3 rounded-xl border border-border px-4 py-3 text-sm text-muted-foreground dark:border-[rgba(180,180,255,0.12)]">
          This is the live Chrome Claw is driving — not a console you operate.{" "}
          <Link href="/claw" className="text-foreground underline dark:text-[var(--claw-accent)]">
            Talk to Claw
          </Link>
          . Take over only if Claw hands you a CAPTCHA or password.
        </div>
        <ComputerDock variant="page" />
      </div>
    </AppShell>
  );
}
