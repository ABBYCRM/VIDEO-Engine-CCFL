"use client";
import { AppShell } from "@/components/app-shell";
import { ForgeConsole } from "@/components/forge-console";

export default function ForgePage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-3 sm:p-4">
        <ForgeConsole />
      </div>
    </AppShell>
  );
}
