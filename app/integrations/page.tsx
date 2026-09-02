import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Plug } from "lucide-react";
import { IntegrationsConsole } from "@/components/integrations-console";

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <AppShell>
        {/* Match the Claw console's contained layout: centered, max-w-3xl,
            consistent horizontal padding so the header and the cards below
            share one left edge instead of drifting apart. */}
        <div className="mx-auto w-full max-w-3xl px-4 py-6">
          <PageHeader
            eyebrow="Connectors"
            eyebrowIcon={<Plug size={16} />}
            title="Integrations"
            description="Connect toolkits through Composio."
          />
          {/* IntegrationsConsole calls useSearchParams(); a Suspense boundary
              is required or the /integrations route fails to prerender at
              build time (missing-suspense-with-csr-bailout), which was
              breaking every DigitalOcean deploy. */}
          <Suspense fallback={<div className="text-sm text-muted-foreground">Loading integrations…</div>}>
            <IntegrationsConsole />
          </Suspense>
        </div>
      </AppShell>
    </AuthGuard>
  );
}
