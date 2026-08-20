import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

export default function PodcastInterviewPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-5xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Podcast Interview Style</h1>
            <p className="max-w-3xl text-slate-400">
              VIRAL_VERTICAL_COMMENTARY_COLLAGE — upload a top video and generate the lower talking-head layer
              as one continuous 8-second shot. See <code>lib/prompt-rag/styles/podcast-interview-style.md</code>.
            </p>
          </div>
          <Card title="Composition">
            <form className="grid gap-4">
              <label className="grid gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top video (optional)</span>
                <input type="file" accept="video/*" className="w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Top / bottom relationship</span>
                <select defaultValue="mixed" className="h-11 rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm">
                  <option value="related">Related</option>
                  <option value="unrelated">Unrelated</option>
                  <option value="ironic">Ironic contrast</option>
                  <option value="mixed">Mixed</option>
                </select>
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Editorial hook (3–8 words)</span>
                <input placeholder="3–8 word hook" className="h-11 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 text-sm" />
              </label>
              <label className="grid gap-2 text-sm">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Bottom-speaker mission</span>
                <textarea rows={6} className="min-h-32 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-sm" />
              </label>
              <div className="flex items-center justify-end">
                <Button type="submit">Generate Podcast Interview Style</Button>
              </div>
            </form>
          </Card>
          <Card title="Style defaults">
            <pre className="overflow-x-auto whitespace-pre-wrap rounded-xl bg-slate-950 p-4 text-xs text-slate-100">
{`HOOK_TEXT_INTENSITY=85
CAPTION_DENSITY=65
EDIT_FREQUENCY=55
PUNCH_IN_FREQUENCY=40
BROLL_FREQUENCY=75
MEME_INTENSITY=55
VISUAL_CONTEXT_RELEVANCE=90
SOCIAL_COMPRESSION=20
CAMERA_MOTION=20
MUSIC_INTENSITY=15
SFX_INTENSITY=10
SOURCE_AUTHENTICITY=90
CONTEXT_MODE=mixed`}
            </pre>
          </Card>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
