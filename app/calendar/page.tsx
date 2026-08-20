import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { AppShell } from '@/components/app-shell';
import { AuthGuard } from '@/components/auth-guard';

const events = [
  { day: 'Mon', status: 'Approved', item: 'Vehicle accident hook video', network: 'Instagram' },
  { day: 'Tue', status: 'Pending', item: 'Newsroom rideshare explainer', network: 'Facebook' },
  { day: 'Wed', status: 'Auto-post', item: 'Truck crash legal checklist', network: 'YouTube Shorts' }
];

export default function CalendarPage() {
  return (
    <AuthGuard>
      <AppShell>
        <main className="mx-auto max-w-7xl px-4 py-8">
          <div className="mb-6 flex flex-col gap-2">
            <h1 className="text-3xl font-semibold tracking-tight">Publishing Calendar</h1>
            <p className="max-w-3xl text-slate-400">
              Every completed video can be queued here with approval, auto-post, or dormant monitoring status.
              The auto-post worker is idempotent — retries never produce duplicate social posts.
            </p>
          </div>
          <Card title="Schedule" actions={<div className="flex gap-2"><Button>Add post</Button><Button variant="secondary">Toggle auto-post</Button></div>}>
            <p className="text-sm text-slate-400">
              Approve → schedule → publish. Use drag-and-drop on desktop; on mobile the agenda list is
              primary. Unapproved items never auto-post.
            </p>
          </Card>
          <div className="mt-6 grid gap-6 lg:grid-cols-[1.6fr_1fr]">
            <Card title="Weekly Queue">
              <div className="grid gap-3">
                {events.map((event) => (
                  <div key={event.item} className="rounded-xl border border-slate-800 bg-slate-950/40 p-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <p className="font-medium text-slate-100">{event.item}</p>
                        <p className="text-xs text-slate-500">{event.day} · {event.network}</p>
                      </div>
                      <span className="rounded-full bg-slate-800 px-3 py-1 text-xs font-medium text-slate-200">{event.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            <Card title="Approval States">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-300">
                <li>Draft</li>
                <li>Pending approval</li>
                <li>Approved</li>
                <li>Auto-post enabled</li>
                <li>Dormant monitor-only</li>
              </ul>
            </Card>
          </div>
        </main>
      </AppShell>
    </AuthGuard>
  );
}
