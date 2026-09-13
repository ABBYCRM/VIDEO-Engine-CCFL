import { Suspense } from "react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Plug } from "lucide-react";
import { IntegrationsConsole } from "@/components/integrations-console";
import { ConnectorsPanel } from "@/components/connectors-panel";

// IntegrationsConsole calls useSearchParams() to surface the
// ?connected=success|failed flash from the OAuth callback. Next 15 requires
// any useSearchParams() consumer to be inside a <Suspense> boundary so the
// build can prerender the rest of the page without a CSR bailout. We split
// it into a Suspense fallback + the real client component so the build
// (and the /integrations prerender) goes through.
export default function IntegrationsPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
        <PageHeader
          eyebrow="Connectors"
          eyebrowIcon={<Plug size={16} />}
          title="Integrations"
          description="Connector / MCP registry plus Composio toolkits."
        />
        <div className="grid gap-4">
          <ConnectorsPanel />
          <Suspense fallback={<IntegrationsFallback />}>
            <IntegrationsConsole />
          </Suspense>
        </div>
      </div>
    </AppShell>
  );
}

function IntegrationsFallback() {
  return (
    <div className="grid gap-4 py-2">
      <div className="rounded-xl border border-border bg-[hsl(var(--claw-elevated))] p-4 text-sm text-muted-foreground">
        Loading integrations…
      </div>
    </div>
  );
}
