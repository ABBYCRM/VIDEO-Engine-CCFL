"use client";
import { AppShell } from "@/components/app-shell";
import { ComputerDock } from "@/components/computer-dock";

export default function ComputerPage() {
  return (
    <AppShell>
      <div className="mx-auto max-w-6xl p-4">
        <ComputerDock variant="page" />
      </div>
    </AppShell>
  );
}
