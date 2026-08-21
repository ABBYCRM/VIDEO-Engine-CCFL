import avatars from '@/data/avatar-presets.json';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

const views = ['front', 'left', 'right', 'back'] as const;

type Avatar = (typeof avatars)[number];

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
              The reference identity photo is what the canonical turnaround is generated from.
            </p>
            <p className="max-w-3xl text-xs text-amber-300/80">
              <strong>Wardrobe rule</strong>: The default female spokesperson never uses beachwear. The canonical
              campaign turnaround must use a tailored blazer / professional top / slacks. If a beach or swimwear
              photo is supplied as identity reference, treat it as identity-only and regenerate the campaign
              wardrobe in professional attire.
            </p>
          </div>

          <Card title="Avatar Library" actions={<div className="flex gap-2"><Button>Add avatar</Button><Button variant="secondary">Delete selected</Button></div>}>
            <p className="text-sm text-slate-400">
              See <code>lib/prompt-rag/avatars/avatar-turnaround.md</code> for the full wardrobe + fidelity contract.
            </p>
          </Card>

          <div className="mt-6 grid gap-6 lg:grid-cols-2">
            {avatars.map((avatar) => (
              <AvatarCard key={avatar.id} avatar={avatar} />
            ))}
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}

function AvatarCard({ avatar }: { avatar: Avatar }) {
  return (
    <Card
      title={avatar.name}
      actions={<Button variant="secondary">Generate 4-view render</Button>}
    >
      <div className="grid gap-4 md:grid-cols-[140px_1fr]">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Reference identity</div>
          {avatar.referenceImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatar.referenceImage}
              alt={`${avatar.name} identity reference`}
              className="mt-1 aspect-[3/4] w-full rounded-xl border border-slate-800 object-cover"
            />
          ) : (
            <div className="mt-1 grid aspect-[3/4] w-full place-items-center rounded-xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 text-center text-xs text-amber-200">
              <div>
                <div className="font-semibold">Missing</div>
                <div className="mt-1 text-amber-200/70">
                  Professional wardrobe identity required
                </div>
              </div>
            </div>
          )}
        </div>
        <div>
          <p className="text-sm">
            <strong className="text-slate-300">Archetype:</strong>{" "}
            <span className="text-slate-400">{avatar.archetype}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-300">Gender:</strong>{" "}
            <span className="text-slate-400">{avatar.gender}</span>
          </p>
          <p className="text-sm">
            <strong className="text-slate-300">Wardrobe standard:</strong>{" "}
            <span className="text-slate-400">{avatar.wardrobeStandard}</span>
          </p>
          <p className="mt-2 text-sm text-slate-400">{avatar.notes}</p>
          {('referenceImageNote' in avatar && avatar.referenceImageNote) && (
            <p className="mt-1 text-xs italic text-slate-500">{avatar.referenceImageNote}</p>
          )}
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">4-view turnaround</div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {views.map((view) => (
            <div
              key={view}
              className="rounded-xl border border-dashed border-slate-700 bg-slate-950/40 p-4 text-center text-xs text-slate-500"
            >
              <div className="mb-2 font-semibold uppercase tracking-wide text-slate-300">{view}</div>
              <div className="aspect-[3/4] rounded-lg bg-slate-900" />
              <div className="mt-2">{avatar.views[view] ? 'Ready' : 'Missing'}</div>
            </div>
          ))}
        </div>
      </div>
    </Card>
  );
}
