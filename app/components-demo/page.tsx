"use client";
import { useState } from "react";
import { Bell, Home, HelpCircle, Settings, Shield, Mail, User, FileText, Lock, Sparkles } from "lucide-react";
import { ExpandableTabs } from "@/components/ui/expandable-tabs";
import { Card } from "@/components/ui/card";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { ModelSelectorKit, type AiModelSelection } from "@/components/ui/ai-model-select";

export default function ComponentsDemoPage() {
  const dashboardTabs = [
    { title: "Dashboard", icon: Home },
    { title: "Notifications", icon: Bell },
    { type: "separator" as const },
    { title: "Settings", icon: Settings },
    { title: "Support", icon: HelpCircle },
    { title: "Security", icon: Shield },
  ];

  const profileTabs = [
    { title: "Profile", icon: User },
    { title: "Messages", icon: Mail },
    { type: "separator" as const },
    { title: "Documents", icon: FileText },
    { title: "Privacy", icon: Lock },
  ];

  const [aiSelection, setAiSelection] = useState<AiModelSelection>({
    id: "opus-4.5",
    effort: "high",
    context: "200K",
    fast: true,
    thinking: false,
  });

  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="flex items-center gap-2 text-3xl font-semibold tracking-tight">
              <Sparkles size={22} className="text-cyan-300" />
              Component demo
            </h1>
            <p className="max-w-3xl text-slate-400">
              The <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300">ExpandableTabs</code> and <code className="rounded bg-slate-800 px-1.5 py-0.5 text-cyan-300">ModelSelector</code> components
              in action. Click a tab to expand the label; click the model chip to open the picker.
            </p>
          </div>

          <Card title="Default theme">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-slate-400">Default active color: <code>text-primary</code> (cyan in the project's dark theme).</p>
              <ExpandableTabs tabs={dashboardTabs} />
            </div>
          </Card>

          <div className="mt-6">
            <Card title="Custom active color">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-400">Override the active tab color via the <code>activeColor</code> prop.</p>
                <ExpandableTabs
                  tabs={profileTabs}
                  activeColor="text-blue-400"
                  className="border-blue-500/30"
                />
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="AI Model selector">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-slate-400">
                  Cursor-style AI model picker. Click the chip to open the menu; hover an option for the
                  detail panel; click the pencil to edit effort / context / fast / thinking.
                </p>
                <div className="flex items-center gap-3">
                  <ModelSelectorKit value={aiSelection} onValueChange={setAiSelection} />
                  <code className="rounded bg-slate-900 px-2 py-1 text-xs text-slate-300">
                    {JSON.stringify(aiSelection)}
                  </code>
                </div>
              </div>
            </Card>
          </div>

          <div className="mt-6">
            <Card title="Integration notes">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                <li>Project must be a shadcn-style Next.js app with TypeScript + Tailwind — already satisfied.</li>
                <li>CSS variables for <code>--background</code>, <code>--foreground</code>, <code>--border</code>, <code>--muted</code>, <code>--primary</code> are defined in <code>app/globals.css</code>.</li>
                <li>Required runtime deps: <code>framer-motion</code>, <code>usehooks-ts</code>, <code>lucide-react</code> — all installed.</li>
                <li><code>ExpandableTabs</code> lives at <code>components/ui/expandable-tabs.tsx</code>.</li>
                <li><code>ModelSelector</code> lives at <code>components/ui/ai-model-select.tsx</code>. Use <code>ModelSelectorKit</code> for the full trigger + content combo, or compose <code>ModelSelector / Trigger / Value / Content</code> manually.</li>
                <li>Demo entry point: <code>app/components-demo/page.tsx</code>.</li>
              </ul>
            </Card>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
