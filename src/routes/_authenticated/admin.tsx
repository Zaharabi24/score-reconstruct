import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Plus, RefreshCw, Trash2 } from "lucide-react";
import {
  useAuditLog,
  useDepartments,
  useEmployees,
  useKpis,
  usePolicy,
  useRealtimeKpis,
  useRubrics,
} from "@/lib/queries";
import { exportDataset, runErpSync, setupKpi } from "@/lib/kpi.functions";
import { AuditTrail } from "@/components/AuditTrail";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "HR admin — Anwar KPIFlow" },
      { name: "description", content: "KPI setup wizard, weight governance, rubrics, policy and the full audit trail." },
      { property: "og:title", content: "HR admin — Anwar KPIFlow" },
      { property: "og:description", content: "Define KPIs, enforce the 100% weight budget and audit every change." },
    ],
  }),
  component: Admin,
});

type Milestone = { label: string; weight: number };

function Admin() {
  useRealtimeKpis();
  const { data: audit } = useAuditLog();
  const { data: kpis } = useKpis();
  const { data: rubrics } = useRubrics();
  const { data: policy } = usePolicy();
  const exportFn = useServerFn(exportDataset);
  const syncFn = useServerFn(runErpSync);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const { content, mime } = await exportFn({ data: { format: "csv" } });
      const blob = new Blob([content], { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "kpiflow-scores.csv";
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Export failed");
    } finally {
      setBusy(false);
    }
  };

  const doSync = async () => {
    setBusy(true);
    try {
      const res = await syncFn();
      toast.success(`ERP sync complete — ${res.synced} KPI(s) received system-verified actuals`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl">HR administration</h1>
        <p className="text-sm text-muted-foreground">
          Weight budgets, rubrics and policy bands are enforced server-side before anything is written.
        </p>
      </div>

      <Tabs defaultValue="setup">
        <TabsList>
          <TabsTrigger value="setup">KPI setup</TabsTrigger>
          <TabsTrigger value="registry">Registry</TabsTrigger>
          <TabsTrigger value="policy">Policy &amp; rubrics</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="setup" className="mt-5">
          <SetupWizard />
        </TabsContent>

        <TabsContent value="registry" className="mt-5">
          <div className="panel overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-5 py-2 font-medium">KPI</th>
                  <th className="px-5 py-2 font-medium">Owner</th>
                  <th className="px-5 py-2 font-medium">Type</th>
                  <th className="px-5 py-2 text-right font-medium">Weight</th>
                  <th className="px-5 py-2 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {(kpis ?? []).map((kpi) => (
                  <tr key={kpi.id} className="border-t border-border">
                    <td className="px-5 py-2">{kpi.name}</td>
                    <td className="px-5 py-2">{kpi.employees?.name}</td>
                    <td className="px-5 py-2 capitalize">{kpi.kpi_type.replace(/_/g, " ")}</td>
                    <td className="num px-5 py-2 text-right">{kpi.weight_percent}%</td>
                    <td className="px-5 py-2">
                      <StatusBadge status={kpi.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="policy" className="mt-5 space-y-4">
          <div className="panel p-5">
            <h3 className="text-sm font-semibold">Scoring policy</h3>
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
              <Item label="Score cap" value={String(policy?.achievement_cap ?? "—")} />
              <Item label="Zero threshold" value={`${policy?.achievement_floor ?? "—"}%`} />
              <Item
                label="Adjustment escalation"
                value={`±${policy?.adjustment_escalation_threshold ?? "—"} pts`}
              />
              <Item label="Min weight" value="5%" />
              <Item label="Max weight" value="40%" />
              <Item label="Weight budget" value="100% per employee per period" />
            </dl>
          </div>
          <div className="panel p-5">
            <h3 className="text-sm font-semibold">Rubrics</h3>
            <div className="mt-3 space-y-4">
              {(rubrics ?? []).map((r) => (
                <div key={r["id"] as string}>
                  <p className="text-sm font-medium">{r["name"] as string}</p>
                  <ul className="mt-1 space-y-1 text-sm text-muted-foreground">
                    {((r["levels"] as { level: number; label: string; descriptor?: string }[]) ?? []).map((lvl) => (
                      <li key={lvl.level}>
                        <span className="num">L{lvl.level}</span> — {lvl.label}
                        {lvl.descriptor ? `: ${lvl.descriptor}` : ""}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="integrations" className="mt-5">
          <div className="panel space-y-4 p-5">
            <h3 className="text-sm font-semibold">ERP sync &amp; exports</h3>
            <p className="text-sm text-muted-foreground">
              Sync pulls system-verified actuals for KPIs flagged as system-sourced and records them as immutable
              entries. Exports contain approved scores only.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={doSync} disabled={busy}>
                {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                Run ERP sync
              </Button>
              <Button variant="outline" onClick={doExport} disabled={busy}>
                Export scores (CSV)
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="audit" className="mt-5">
          <AuditTrail rows={audit ?? []} title="Organisation audit trail" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Item({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="num">{value}</dd>
    </div>
  );
}

function SetupWizard() {
  const queryClient = useQueryClient();
  const { data: employees } = useEmployees();
  const { data: departments } = useDepartments();
  const { data: rubrics } = useRubrics();
  const { data: kpis } = useKpis();
  const create = useServerFn(setupKpi);

  const [employeeId, setEmployeeId] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [perspective, setPerspective] = useState("financial");
  const [kpiType, setKpiType] = useState("higher_is_better");
  const [unit, setUnit] = useState("");
  const [target, setTarget] = useState("");
  const [weight, setWeight] = useState("20");
  const [reviewerId, setReviewerId] = useState("");
  const [approverId, setApproverId] = useState("");
  const [rubricId, setRubricId] = useState("");
  const [start, setStart] = useState(`${new Date().getFullYear()}-01-01`);
  const [end, setEnd] = useState(`${new Date().getFullYear()}-12-31`);
  const [milestones, setMilestones] = useState<Milestone[]>([{ label: "", weight: 100 }]);
  const [busy, setBusy] = useState(false);

  const usedWeight = useMemo(
    () =>
      (kpis ?? [])
        .filter((k) => k.employee_id === employeeId && k.period_start === start)
        .reduce((sum, k) => sum + Number(k.weight_percent), 0),
    [kpis, employeeId, start],
  );
  const remaining = 100 - usedWeight;

  const submit = async () => {
    setBusy(true);
    try {
      await create({
        data: {
          employee_id: employeeId,
          name,
          description: description || null,
          perspective: perspective as "financial",
          kpi_type: kpiType as "higher_is_better",
          unit: unit || null,
          target_value: kpiType === "qualitative" || kpiType === "milestone" ? null : Number(target),
          weight_percent: Number(weight),
          period_start: start,
          period_end: end,
          reviewer_id: reviewerId || null,
          approver_id: approverId || null,
          rubric_id: kpiType === "qualitative" ? rubricId || null : null,
          milestones: kpiType === "milestone" ? milestones.filter((m) => m.label) : null,
        },
      });
      toast.success("KPI created and sent for target approval");
      setName("");
      setTarget("");
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create the KPI");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="panel space-y-5 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">KPI setup wizard</h3>
        {employeeId && (
          <p className="text-xs text-muted-foreground">
            Weight used for this period: <span className="num">{usedWeight}%</span> · remaining{" "}
            <span className="num">{remaining}%</span>
          </p>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Field label="Employee">
          <Select value={employeeId} onValueChange={setEmployeeId}>
            <SelectTrigger>
              <SelectValue placeholder="Select employee" />
            </SelectTrigger>
            <SelectContent>
              {(employees ?? []).map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} — {departments?.find((d) => d.id === e.department_id)?.name ?? "no dept"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="KPI name">
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Net revenue growth" />
        </Field>

        <Field label="Perspective">
          <Select value={perspective} onValueChange={setPerspective}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {["financial", "customer", "process", "people"].map((p) => (
                <SelectItem key={p} value={p} className="capitalize">
                  {p}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="KPI type">
          <Select value={kpiType} onValueChange={setKpiType}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="higher_is_better">Higher is better</SelectItem>
              <SelectItem value="lower_is_better">Lower is better</SelectItem>
              <SelectItem value="milestone">Milestone</SelectItem>
              <SelectItem value="qualitative">Qualitative (rubric)</SelectItem>
            </SelectContent>
          </Select>
        </Field>

        {kpiType !== "qualitative" && kpiType !== "milestone" && (
          <>
            <Field label="Target value">
              <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} />
            </Field>
            <Field label="Unit">
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="%, SAR, days" />
            </Field>
          </>
        )}

        {kpiType === "qualitative" && (
          <Field label="Rubric">
            <Select value={rubricId} onValueChange={setRubricId}>
              <SelectTrigger>
                <SelectValue placeholder="Select rubric" />
              </SelectTrigger>
              <SelectContent>
                {(rubrics ?? []).map((r) => (
                  <SelectItem key={r["id"] as string} value={r["id"] as string}>
                    {r["name"] as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        )}

        <Field label={`Weight % (remaining ${remaining}%)`}>
          <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>

        <Field label="Reviewer (line manager)">
          <Select value={reviewerId} onValueChange={setReviewerId}>
            <SelectTrigger>
              <SelectValue placeholder="Select reviewer" />
            </SelectTrigger>
            <SelectContent>
              {(employees ?? [])
                .filter((e) => e.role !== "employee")
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Senior approver">
          <Select value={approverId} onValueChange={setApproverId}>
            <SelectTrigger>
              <SelectValue placeholder="Select approver" />
            </SelectTrigger>
            <SelectContent>
              {(employees ?? [])
                .filter((e) => e.role === "executive" || e.role === "hr_admin")
                .map((e) => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.name}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </Field>

        <Field label="Period start">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Period end">
          <Input type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
      </div>

      {kpiType === "milestone" && (
        <div className="space-y-2">
          <Label>Milestones</Label>
          {milestones.map((m, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={m.label}
                placeholder="Milestone description"
                onChange={(e) =>
                  setMilestones((prev) => prev.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))
                }
              />
              <Input
                type="number"
                className="w-28"
                value={m.weight}
                onChange={(e) =>
                  setMilestones((prev) =>
                    prev.map((x, j) => (j === i ? { ...x, weight: Number(e.target.value) } : x)),
                  )
                }
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setMilestones((prev) => prev.filter((_, j) => j !== i))}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => setMilestones((prev) => [...prev, { label: "", weight: 0 }])}
          >
            <Plus className="mr-1 h-4 w-4" /> Add milestone
          </Button>
        </div>
      )}

      <Field label="Description">
        <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>

      <Button disabled={busy || !employeeId || !name || !reviewerId} onClick={submit}>
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Create KPI and request target approval
      </Button>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
