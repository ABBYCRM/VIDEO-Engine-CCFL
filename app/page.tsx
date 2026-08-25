import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { StudioTabs } from "@/components/studio-tabs";

export default function Home(){
  return <AuthGuard><AppShell><StudioTabs/></AppShell></AuthGuard>;
}
