import avatars from '@/data/avatar-presets.json';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

const views = ['front', 'left', 'right', 'back'] as const;

export default function AvatarsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Avatars</h1>
            <p className="max-w-3xl text-slate-400">
              All campaign categories reuse the same canonical avatar identity. Before an avatar can be used,
              generate and store the required 4-view turnaround render: front, left side, right side, back.
            </p>
          </div>

          <Card title="Avatar Library" actions={<div className="flex gap-2"><Button>Add avatar</Button><Button variant="secondary">Delete selected</Button></div>}>
            <p className="text-sm text-slate-400">
              Avatars are tied to a wardrobe standard. The default female spokesperson never uses beachwear —
              always a tailored blazer / professional top / slacks. See <code>lib/prompt-rag/avatars/avatar-turnaround.md</code>.
            </p>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {avatars.map((avatar) => (
              <Card key={avatar.id} title={avatar.name} actions={<Button variant="secondary">Generate 4-view render</Button>}>
                <p className="text-sm"><strong className="text-slate-300">Archetype:</strong> <span className="text-slate-400">{avatar.archetype}</span></p>
                <p className="text-sm"><strong className="text-slate-300">Wardrobe standard:</strong> <span className="text-slate-400">{avatar.wardrobeStandard}</span></p>
                <p className="text-sm"><strong className="text-slate-300">Notes:</strong> <span className="text-slate-400">{avatar.notes}</span></p>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  {views.map((view) => (
                    <div key={view} className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center text-xs text-slate-500">
                      <div className="mb-2 font-semibold uppercase tracking-wide text-slate-300">{view}</div>
                      <div className="aspect-[3/4] rounded-lg bg-slate-900" />
                      <div className="mt-2">{avatar.views[view] ? 'Ready' : 'Missing'}</div>
                    </div>
                  ))}
                </div>
              </Card>
            ))}
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
