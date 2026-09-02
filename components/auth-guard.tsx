// This deployment is private, so the console is open to anyone who can reach
// it — there is no login gate. AuthGuard is kept as a transparent wrapper so
// existing callers keep working; it simply renders its children.
export function AuthGuard({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
