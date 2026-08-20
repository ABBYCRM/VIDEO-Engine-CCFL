import presets from '@/data/campaign-presets.json';
import backgrounds from '@/data/backgrounds.json';
import tones from '@/data/tones.json';
import avatars from '@/data/avatar-presets.json';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

export default function CampaignsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Campaigns</h1>
            <p className="max-w-3xl text-slate-400">
              Build a campaign intent: website, category, avatar, tone, platform, background, mission. The planner
              compiles the user-supplied fields into a single 8-second shot prompt that respects the project's
              <span className="mx-1 rounded bg-slate-800 px-1.5 py-0.5 text-xs font-medium text-cyan-300">ONE CONTINUOUS SHOT ONLY</span>
              contract.
            </p>
          </div>
          <div className="grid gap-6 xl:grid-cols-[2fr_1fr]">
            <Card title="Campaign Builder" actions={<Button>Plan one-shot</Button>}>
              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Website</span>
                  <input className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" placeholder="https://caseclosedfl.com" />
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Category</span>
                  <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm">
                    {presets.map((preset) => <option key={preset.id}>{preset.label}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Avatar</span>
                  <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm">
                    {avatars.map((avatar) => <option key={avatar.id}>{avatar.name}</option>)}
                  </select>
                </label>
                <label className="space-y-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Tone</span>
                  <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm">
                    {tones.map((tone) => <option key={tone}>{tone}</option>)}
                  </select>
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mission</span>
                  <textarea className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" defaultValue="Create a direct-response PI campaign for rideshare passengers who were injured and need a case review." />
                </label>
                <label className="space-y-2 md:col-span-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Background</span>
                  <select className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm">
                    {backgrounds.map((bg) => <option key={bg.id}>{bg.name}</option>)}
                  </select>
                </label>
              </div>
            </Card>

            <Card title="Provider Stack">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                <li>Video generation: Gemini Veo · xAI Grok Imagine · A2E AI router (single 8-second shot)</li>
                <li>Avatar animation / lip sync: Hedra Character 3 / Omnia (provider slot, not yet wired)</li>
                <li>Image generation providers: Gemini, Grok, A2E, Hedra slot</li>
                <li>Search and research: DuckDuckGo adapter + provider abstraction</li>
                <li>Monitor AI: NVIDIA Nemotron / NeMo Evaluator routing (dormant by default)</li>
                <li>Composio orchestration for Meta / Google / LinkedIn / X / TikTok publishing</li>
              </ul>
            </Card>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
