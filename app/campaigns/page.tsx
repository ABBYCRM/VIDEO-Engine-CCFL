import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Megaphone } from "lucide-react";
import { CampaignsConsole } from "@/components/campaigns-console";

export default function CampaignsPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Saved campaign plans"
          eyebrowIcon={<Megaphone size={16} />}
          title="Campaigns"
          description="Saved campaign plans live here. New campaign setup and generation happen in Create; Calendar handles scheduling, approval, and posting."
        />
        <CampaignsConsole />
      </AppShell>
    </AuthGuard>
  );
}
