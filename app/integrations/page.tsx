import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Plug } from "lucide-react";
import { IntegrationsConsole } from "@/components/integrations-console";

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Connectors"
          eyebrowIcon={<Plug size={16} />}
          title="Integrations"
          description="Connect toolkits through Composio."
        />
        <IntegrationsConsole />
      </AppShell>
    </AuthGuard>
  );
}
