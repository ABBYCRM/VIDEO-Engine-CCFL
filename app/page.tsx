import { AppShell } from "@/components/app-shell";
import { AuthGuard } from "@/components/auth-guard";
import { GeneratorConsole } from "@/components/generator-console";

export default function Home(){
  return <AuthGuard><AppShell><GeneratorConsole/></AppShell></AuthGuard>;
}
