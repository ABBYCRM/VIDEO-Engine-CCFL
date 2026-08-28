import { InfluencersConsole } from "@/components/influencers-console";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Users } from "lucide-react";

export default function InfluencersPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Discovery + outreach"
          eyebrowIcon={<Users size={16} />}
          title="Influencers"
          description="Discover creators via Instagram's public business-discovery lookup or one page you paste in. Track pipeline status and draft/send outreach."
        />
        <InfluencersConsole />
      </AppShell>
    </AuthGuard>
  );
}
