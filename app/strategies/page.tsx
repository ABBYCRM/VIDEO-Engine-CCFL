import { StrategiesConsole } from "@/components/strategies-console";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { BrainCircuit } from "lucide-react";

export default function StrategiesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Cross-channel planning"
          eyebrowIcon={<BrainCircuit size={16} />}
          title="Strategies"
          description="AI drafts a goals/channel-mix/content-pillar plan grounded in your connected channels and website context. Review and approve before it guides scheduling."
        />
        <StrategiesConsole />
      </AppShell>
    </AuthGuard>
  );
}
