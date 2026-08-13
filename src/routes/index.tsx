import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getPersonaId } from "@/lib/demo";
import { ShieldCheck, Workflow, FileSearch, LineChart } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { ensureDemoAccount, getWorkspace } from "@/lib/workspace.functions";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Anwar KPIFlow — Auditable Variable KPI Scoring" },
      {
        name: "description",
        content:
          "Replace manual score sheets with Target → Actual → Evidence → Score → Review → Approval. Every score reconstructable, every adjustment justified.",
      },
      { property: "og:title", content: "Anwar KPIFlow — Auditable Variable KPI Scoring" },
      {
        property: "og:description",
        content: "Variable KPI and performance management for Anwar Group of Industries.",
      },
    ],
  }),
  component: Landing,
});

const PILLARS = [
  { icon: Workflow, title: "One governed workflow", body: "Target → Actual → Evidence → Score → Review → Approval, enforced server-side." },
  { icon: ShieldCheck, title: "Server-computed scores", body: "Scores are calculated by the scoring engine, never trusted from a browser." },
  { icon: FileSearch, title: "Immutable audit trail", body: "Every change, adjustment and denial is written to an append-only log." },
  { icon: LineChart, title: "Live calibration", body: "Dashboards update in real time as approvals land across the business." },
];

function Landing() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);

  // Warm the workspace cache so the first authenticated screen paints instantly.
  const prefetchWorkspace = () => {
    void queryClient.prefetchQuery({
      queryKey: ["workspace", getPersonaId()],
      queryFn: async () => (await getWorkspace()) as unknown,
      staleTime: 5 * 60_000,
    });
  };

  // Guest access: start the shared demo session and land on the Employee KPI screen.
  const enterAsGuest = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const creds = await ensureDemoAccount();
        const { error } = await supabase.auth.signInWithPassword(creds);
        if (error) throw new Error(error.message);
      }
      prefetchWorkspace();
      await router.navigate({ to: "/kpis" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the workspace");
    } finally {
      setLoading(false);
    }
  };

  // Hero CTA: opens the demo account and lands on the Employee KPI screen by default.
  const enterDashboard = async () => {
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        const creds = await ensureDemoAccount();
        const { error } = await supabase.auth.signInWithPassword(creds);
        if (error) throw new Error(error.message);
      }
      prefetchWorkspace();
      await router.navigate({ to: "/kpis" });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not open the dashboard");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border bg-card">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <span className="font-display text-lg font-bold">Anwar KPIFlow</span>
          <div className="flex items-center gap-2">
            <Button size="sm" disabled={loading} onMouseEnter={prefetchWorkspace} onClick={enterAsGuest}>
              Guest Login
            </Button>
            <Button asChild size="sm">
              <Link to="/auth">Sign in</Link>
            </Button>
          </div>
        </div>
      </header>

      <section className="mx-auto max-w-6xl px-6 py-20">
        <p className="num text-xs uppercase tracking-[0.2em] text-primary">Variable KPI & performance management</p>
        <h1 className="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">
          Every final score, fully reconstructable — without asking a human.
        </h1>
        <p className="mt-5 max-w-2xl text-base text-muted-foreground">
          Anwar KPIFlow replaces the manual score–signature–approval sheet with a governed pipeline: targets are
          approved, actuals are evidenced and hashed, scores are computed server-side, and every manual adjustment
          carries a reason code and a justification.
        </p>
        <div className="mt-8 flex gap-3">
          <Button size="lg" disabled={loading} onMouseEnter={prefetchWorkspace} onClick={enterDashboard}>
            Go to the Dashboard
          </Button>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => (
            <div key={p.title} className="panel p-5">
              <p.icon className="h-5 w-5 text-primary" />
              <h2 className="mt-3 text-base font-semibold">{p.title}</h2>
              <p className="mt-1.5 text-sm text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
