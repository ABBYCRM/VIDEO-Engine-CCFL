import { SitesConsole } from "@/components/sites-console";
import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { PageHeader } from "@/components/ui/page-header";
import { Globe2 } from "lucide-react";

export default function SitesPage() {
  return (
    <AuthGuard>
      <AppShell>
        <PageHeader
          eyebrow="Connected websites"
          eyebrowIcon={<Globe2 size={16} />}
          title="Sites"
          description="Add a website and the AI will research it, propose an editorial strategy, and fill the blog Calendar on cadence. Phone number, brand voice, and image style are auto-extracted."
        />
        <SitesConsole />
      </AppShell>
    </AuthGuard>
  );
}
