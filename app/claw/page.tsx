import { AuthGuard } from "@/components/auth-guard";
import { ClawConsole } from "@/components/claw-console";

export default function ClawPage() {
  return (
    <AuthGuard>
      <ClawConsole />
    </AuthGuard>
  );
}
