import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { CreatorConsole } from "@/components/creator-console";
import { Film } from "lucide-react";

export default function CreatorPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Upload · Schedule · Auto-publish"
          eyebrowIcon={<Film size={16} />}
          title="Creator"
          description="Upload your own videos, pick one or more formats (Reel, Story, or Post), pick the date and time, choose the subject, and let the system post on schedule. Captions are AI-written on demand."
        />
        <CreatorConsole />
      </AppShell>
    </AuthGuard>
  );
}
