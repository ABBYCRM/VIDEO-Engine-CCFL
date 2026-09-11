"use client";
import { AppShell } from "@/components/app-shell";
import { SwarmConsole } from "@/components/swarm-console";

export default function SwarmPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-3 sm:p-4">
        <SwarmConsole />
      </div>
    </AppShell>
  );
}
