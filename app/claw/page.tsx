import { ClawConsole } from "@/components/claw-console";
import { AuthGuard } from "@/components/auth-guard";

export default function ClawPage() {
  return (
    <AuthGuard>
      <ClawConsole />
    </AuthGuard>
  );
}
