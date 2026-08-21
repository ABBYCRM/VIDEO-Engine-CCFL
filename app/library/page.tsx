import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { Card } from '@/components/ui/card';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

const files = [
  'lib/prompt-rag/system/ugc-cinema-engine.md',
  'lib/prompt-rag/avatars/avatar-turnaround.md',
  'lib/prompt-rag/styles/podcast-interview-style.md',
  'lib/prompt-rag/pi/vehicle-accident.md',
  'lib/prompt-rag/pi/rideshare-accident.md',
  'lib/prompt-rag/pi/trucking-accident.md',
  'lib/prompt-rag/pi/slip-fall.md'
] as const;

export default function LibraryPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Prompt RAG Library</h1>
            <p className="max-w-3xl text-slate-600">
              Reusable prompt sets the planner, compiler, and NVIDIA monitor model can score and select.
              The library is versioned — published prompts are never overwritten.
            </p>
          </div>
          <Card title="Library overview">
            <p className="text-sm text-slate-600">
              These are the read-only source prompts loaded into the campaign planner. New versions are added
              to this directory; the planner always picks the latest <code>status = active</code> record.
            </p>
          </Card>
          <div className="mt-4 space-y-4">
            {files.map((file) => {
              const content = readFileSync(join(process.cwd(), file), 'utf8');
              return (
                <Card key={file} title={file}>
                  <pre className="max-h-96 overflow-x-auto whitespace-pre-wrap rounded-xl bg-white p-4 text-xs text-slate-100">{content}</pre>
                </Card>
              );
            })}
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
