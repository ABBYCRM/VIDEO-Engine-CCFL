import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { SettingsConsole } from "@/components/settings-console";
export default function SettingsPage(){return <AuthGuard><AppShell><SettingsConsole/></AppShell></AuthGuard>}
