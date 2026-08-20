import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { composioConnectors } from '@/lib/integrations/composio';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

export default function IntegrationsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Integrations</h1>
            <p className="max-w-3xl text-slate-400">
              Use Composio to connect publishing channels, ad accounts, and team systems through a unified
              connected-account layer. No raw credentials are stored in this app — only the connected-account
              ID returned by Composio.
            </p>
          </div>
          <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Composio-connected Apps" actions={<Button>Connect account</Button>}>
              <p className="mb-3 text-sm text-slate-400">
                Catalog of every connector the app is ready to drive. The actual OAuth dance happens on the
                Composio dashboard — this page only manages enable/disable per workspace.
              </p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {composioConnectors.map((connector) => (
                  <div key={connector} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <p className="font-medium text-slate-100">{connector}</p>
                    <div className="mt-3 flex gap-2">
                      <Button variant="secondary" className="flex-1">Add</Button>
                      <Button variant="danger" className="flex-1">Delete</Button>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Ad Networks">
              <p className="mb-3 text-sm text-slate-400">First-class connector surface for the channels the marketing team uses.</p>
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                <li>Facebook / Instagram Ads</li>
                <li>Google Ads</li>
                <li>YouTube</li>
                <li>LinkedIn</li>
                <li>X / social publishing</li>
              </ul>
            </Card>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
