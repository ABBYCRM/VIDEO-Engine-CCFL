import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { CalendarClock } from "lucide-react";
import { RoutinesConsole } from "@/components/routines-console";

export default function RoutinesPage() {
  return (
    <AppShell>
      <div className="mx-auto w-full max-w-3xl px-3 sm:px-4">
        <PageHeader
          eyebrow="Brain"
          eyebrowIcon={<CalendarClock size={16} />}
          title="Routines"
          description="Durable Aion-Brain RoutineStore. List, create, pause, resume, delete. Persist is routines.sqlite on Brain."
        />
        <RoutinesConsole />
      </div>
    </AppShell>
  );
}
