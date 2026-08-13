import { Link, useRouter } from "@tanstack/react-router";
import { LogOut, Activity } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, useMe } from "@/hooks/useMe";
import { Button } from "@/components/ui/button";

type NavItem = { to: string; label: string; roles: string[] };

const NAV: NavItem[] = [
  { to: "/kpis", label: "My KPIs", roles: ["employee", "manager", "hr_admin", "executive"] },
  { to: "/summary", label: "Performance summary", roles: ["employee", "manager", "hr_admin", "executive"] },
  { to: "/review", label: "Review console", roles: ["manager", "hr_admin", "executive"] },
  { to: "/admin", label: "HR admin", roles: ["hr_admin"] },
  { to: "/dashboard", label: "Management dashboard", roles: ["executive", "hr_admin"] },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const router = useRouter();

  const signOut = async () => {
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-4 px-4 py-3">
          <Link to="/kpis" className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
              <Activity className="h-4 w-4" />
            </span>
            <span className="font-display text-base font-bold">Anwar KPIFlow</span>
          </Link>
          <nav className="flex flex-1 flex-wrap items-center gap-1">
            {NAV.filter((item) => !me || item.roles.includes(me.role)).map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-surface-alt hover:text-foreground"
                activeProps={{ className: "rounded-md px-3 py-1.5 text-sm bg-surface-alt text-foreground font-medium" }}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <div className="text-right leading-tight">
              <div className="text-sm font-medium">{me?.name ?? "…"}</div>
              <div className="text-xs text-muted-foreground">{me ? ROLE_LABEL[me.role] : ""}</div>
            </div>
            <Button variant="outline" size="sm" onClick={signOut}>
              <LogOut className="mr-1 h-4 w-4" /> Sign out
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-4 py-8">{children}</main>
    </div>
  );
}
