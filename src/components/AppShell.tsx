import { Link, useRouter } from "@tanstack/react-router";
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
    { to: "/dashboard", label: "Executive dashboard" },
    { to: "/review", label: "Review console" },
    { to: "/summary", label: "Performance summary" },
  ],
};

const ROLE_ORDER = ["employee", "manager", "hr_admin", "executive"] as const;

export function AppShell({ children }: { children: React.ReactNode }) {
  const { data: me } = useMe();
  const { data: workspace } = useWorkspace();
  const personaId = useDemoPersonaId();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [resetting, setResetting] = useState(false);

  const personas = workspace?.personas ?? [];

  // First load of a demo session lands on the seeded employee so no screen is empty.
  useEffect(() => {
    if (personaId || !personas.length) return;
    const seeded = personas.find((p) => p.role === "employee") ?? personas[0]!;
    setPersonaId(seeded.id);
  }, [personaId, personas]);
  // The employee screens are now tabs inside the Employee section, not sidebar links.
  const EMPLOYEE_TABS: ScreenPath[] = ["/kpis", "/summary"];
  const screens = (ROLE_SCREENS[me?.role ?? "employee"] ?? ROLE_SCREENS["employee"]!).filter(
    (s) => !EMPLOYEE_TABS.includes(s.to),
  );

  const viewAs = async (persona: EmployeeLite) => {
    setPersonaId(persona.id);
    await queryClient.invalidateQueries();
    const first = (ROLE_SCREENS[persona.role] ?? [])[0];
    if (first) await router.navigate({ to: first.to });
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
        <Link to="/kpis" className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Activity className="h-4 w-4" />
          </span>
          <span className="font-display text-base font-bold tracking-tight">Anwar KPIFlow</span>
        </Link>

        <div>
          <p className="px-1 text-[11px] uppercase tracking-[0.14em] opacity-60">View as</p>
          <div className="mt-2 grid gap-1">
            {ROLE_ORDER.map((role) => {
              const persona = personas.find((p) => p.role === role);
              if (!persona) return null;
              const active = personaId ? personaId === persona.id : me?.id === persona.id;
              return (
                <button
                  key={role}
                  onClick={() => viewAs(persona)}
                  className={`flex items-center justify-between rounded-md px-3 py-2 text-left text-sm transition-colors ${
                    active ? "bg-primary font-medium" : "opacity-75 hover:bg-primary/40 hover:opacity-100"
                  }`}
                >
                  <span>{ROLE_LABEL[role]}</span>
                  <span className="text-[11px] opacity-70">{persona.name.split(" ")[0]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <p className="px-1 text-[11px] uppercase tracking-[0.14em] opacity-60">Screens</p>
          <nav className="mt-2 grid gap-1">
            {screens.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className="rounded-md px-3 py-2 text-sm opacity-75 transition-colors hover:bg-primary/40 hover:opacity-100"
                activeProps={{ className: "rounded-md px-3 py-2 text-sm bg-primary/70 font-medium opacity-100" }}
              >
                {item.label}
              </Link>
            ))}
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
