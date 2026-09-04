"use client";

import Component from "@/components/ui/ai-response";

export default function DemoOne() {
  return (
    <div className="flex min-h-[440px] w-full items-center justify-center bg-background p-10">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-sm">
        <Component
          citations={[
            { id: "1", index: 1, title: "Transitions — Motion", url: "https://motion.dev" },
            { id: "2", index: 2, title: "Animations guide — web.dev", url: "https://web.dev" },
          ]}
          text={`Use spring animations for interface motion rather than fixed-duration tweens [1]. A spring keeps its momentum when the target changes mid-flight, so an interrupted animation never snaps.

Animate only transform and opacity [2] — those are the two properties the browser can run on the compositor, off the main thread.`}
        />
      </div>
    </div>
  );
}