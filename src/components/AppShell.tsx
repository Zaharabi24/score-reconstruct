import { Link, useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Activity, LogOut, RotateCcw, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ROLE_LABEL, useMe } from "@/hooks/useMe";
import { setPersonaId, useDemoPersonaId } from "@/lib/demo";
import { useWorkspace, type EmployeeLite } from "@/lib/queries";
import { resetDemoData } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";

type ScreenPath = "/kpis" | "/summary" | "/review" | "/admin" | "/dashboard";
type Screen = { to: ScreenPath; label: string };

export const ROLE_SCREENS: Record<string, Screen[]> = {
  employee: [
    { to: "/kpis", label: "My KPIs" },
    { to: "/summary", label: "Performance summary" },
  ],
  manager: [
    { to: "/review", label: "Review console" },
    { to: "/kpis", label: "My KPIs" },
    { to: "/summary", label: "Performance summary" },
  ],
  hr_admin: [
    { to: "/admin", label: "HR admin" },
    { to: "/review", label: "Review console" },
    { to: "/dashboard", label: "Management dashboard" },
  ],
  executive: [
    { to: "/dashboard", label: "Management dashboard" },
    { to: "/review", label: "Review console" },
    { to: "/summary", label: "Performance summary" },
  ],
};

/** One flat, always-visible menu: each item owns a screen and the role it is viewed as. */
const MENU: { to: ScreenPath; label: string; role: string }[] = [
  { to: "/summary", label: "Employee KPI", role: "employee" },
  { to: "/review", label: "Department", role: "manager" },
  { to: "/admin", label: "HR/Admin", role: "hr_admin" },
  { to: "/dashboard", label: "Management Dashboard", role: "hr_admin" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const { data: workspace } = useWorkspace();
  const personaId = useDemoPersonaId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const personas = workspace?.personas ?? [];

  // First load of a demo session picks the persona that matches the screen being opened.
  useEffect(() => {
    if (personaId || !personas.length) return;
    const wanted = MENU.find((m) => pathname.startsWith(m.to))?.role ?? "employee";
    const seeded = personas.find((p) => p.role === wanted) ?? personas[0]!;
    setPersonaId(seeded.id);
  }, [personaId, personas, pathname]);

  const go = async (item: (typeof MENU)[number]) => {
    const persona = personas.find((p: EmployeeLite) => p.role === item.role);
    if (persona && persona.id !== personaId) {
      setPersonaId(persona.id);
      queryClient.invalidateQueries({ queryKey: ["workspace"] });
    }
    await router.navigate({ to: item.to });
  };

  const reset = async () => {
    setResetting(true);
    try {
      await resetDemoData();
      await queryClient.invalidateQueries();
      toast.success("Demo data restored to its seeded state");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const signOut = async () => {
    setPersonaId(null);
    await supabase.auth.signOut();
    await router.navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen bg-background lg:flex">
      <aside className="flex flex-col gap-6 bg-primary-dark px-4 py-6 text-primary-foreground lg:min-h-screen lg:w-72 lg:shrink-0">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">Anwar KPIFlow</span>
        </Link>

        <div>
          <p className="px-1 text-[11px] uppercase tracking-[0.14em] opacity-60">Menu</p>
          <nav className="mt-2 grid gap-1">
            {MENU.map((item) => {
              const active =
                item.to === "/summary"
                  ? pathname.startsWith("/kpis") || pathname.startsWith("/summary") || pathname.startsWith("/kpi/")
                  : pathname.startsWith(item.to);
              return (
                <button
                  key={item.to}
                  onClick={() => go(item)}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-primary font-medium opacity-100" : "opacity-75 hover:bg-primary/40 hover:opacity-100"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        <div className="mt-auto space-y-3 pt-4">
          <div className="rounded-md bg-primary/25 px-3 py-2 text-xs leading-tight">
            <div className="font-medium">{me?.name ?? "…"}</div>
            <div className="opacity-70">{me ? ROLE_LABEL[me.role] : ""}</div>
          </div>
          <button
            onClick={reset}
            disabled={resetting}
            className="flex w-full items-center gap-2 rounded-md border border-primary/50 px-3 py-2 text-xs opacity-80 transition-colors hover:bg-primary/40 hover:opacity-100 disabled:opacity-50"
          >
            {resetting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
            Reset demo data
          </button>
          <Button variant="ghost" size="sm" className="w-full justify-start px-3 text-xs" onClick={signOut}>
            <LogOut className="mr-2 h-3.5 w-3.5" /> Sign out
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-8 lg:px-8">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
