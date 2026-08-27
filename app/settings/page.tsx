import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Cog } from "lucide-react";
import { SettingsConsole } from "@/components/settings-console";

export default function SettingsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="API keys & defaults"
          eyebrowIcon={<Cog size={16} />}
          title="Settings"
          description="All provider keys are encrypted server-side with AES-256-GCM. Generated VIDEO-Engine tokens are stored only as SHA-256 hashes."
        />
        <SettingsConsole />
      </AppShell>
    </AuthGuard>
  );
}
