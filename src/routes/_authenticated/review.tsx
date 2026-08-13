import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExternalLink, Inbox, Loader2, Paperclip } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import {
  latestActual,
  latestScore,
  useRealtimeKpis,
  useWorkspace,
  type ActualRow,
  type KpiRow,
} from "@/lib/queries";
import { approveTarget, getEvidenceLink, reviewDecision } from "@/lib/kpi.functions";
import { BAND_TINT } from "@/lib/bands";
import { DepartmentOverview } from "@/components/DepartmentOverview";
import { CalculationPanel } from "@/components/CalculationPanel";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

const REASON_CODES = [
  { value: "market_conditions", label: "Market conditions" },
  { value: "data_correction", label: "Data correction" },
  { value: "external_factor", label: "External factor" },
  { value: "policy_exception", label: "Policy exception" },
  { value: "other", label: "Other" },
];

const QUEUE_STATUSES = ["pending_target_approval", "submitted", "correction_requested", "returned"];

export const Route = createFileRoute("/_authenticated/review")({
  head: () => ({
    meta: [
      { title: "Department / Team Lead — Anwar KPIFlow" },
      {
        name: "description",
        content: "Department-scoped performance overview and the KPI submission requests waiting on your decision.",
      },
      { property: "og:title", content: "Department / Team Lead — Anwar KPIFlow" },
      { property: "og:description", content: "Department overview plus the KPI submission request queue." },
    ],
  }),
  component: DepartmentWorkspace,
});

function DepartmentWorkspace() {
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: workspace, isLoading } = useWorkspace();

  const departmentId = me?.department_id ?? null;
  const departmentName =
    (workspace?.departments ?? []).find((d) => d.id === departmentId)?.name ?? "Your department";

  // Department scope — the data layer already restricts the read; this keeps the view honest.
  const deptKpis = useMemo(
    () => (workspace?.kpis ?? []).filter((k) => (k.employees?.department_id ?? k.department_id) === departmentId),
    [workspace?.kpis, departmentId],
  );
  const team = useMemo(
    () => (workspace?.employees ?? []).filter((e) => e.department_id === departmentId && e.role === "employee"),
    [workspace?.employees, departmentId],
  );

  const periods = useMemo(
    () => Array.from(new Set(deptKpis.map((k) => k.period_start))).sort((a, b) => b.localeCompare(a)),
    [deptKpis],
  );
  const periodStart = periods[0] ?? null;
  const priorPeriod = periods[1] ?? null;
  const current = useMemo(() => deptKpis.filter((k) => k.period_start === periodStart), [deptKpis, periodStart]);
  const previous = useMemo(
    () => (priorPeriod ? deptKpis.filter((k) => k.period_start === priorPeriod) : []),
    [deptKpis, priorPeriod],
  );

  const [statusFilter, setStatusFilter] = useState("all");

  const queue = useMemo(
    () =>
      current
        .filter((k) => QUEUE_STATUSES.includes(k.status))
        .filter((k) => k.reviewer_id === me?.id || k.approver_id === me?.id || team.some((e) => e.id === k.employee_id)),
    [current, me?.id, team],
  );

  return (
    <div className="space-y-10">
      <header className="space-y-1">
        <h1 className="text-[28px] font-bold leading-tight">Department / Team Lead</h1>
        <p className="text-sm text-muted-foreground">
          Everything here is scoped to {departmentName}. Decisions are bounded by policy and written to the audit log.
        </p>
      </header>

      {isLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

      {!isLoading && (
        <>
          <DepartmentOverview
            kpis={current}
            team={team}
            periodStart={periodStart}
            previousPeriodKpis={previous}
            departmentName={departmentName}
            onFilterStatus={(status) => {
              setStatusFilter(QUEUE_STATUSES.includes(status) ? status : "all");
              document.getElementById("kpi-requests")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
          />
          <RequestQueue
            queue={queue}
            meId={me?.id ?? null}
            statusFilter={statusFilter}
            setStatusFilter={setStatusFilter}
          />
        </>
      )}
    </div>
  );
}

/* ───────────────────────── Section 2 — submission requests ───────────────────────── */

function RequestQueue({
  queue,
  meId,
  statusFilter,
  setStatusFilter,
}: {
  queue: KpiRow[];
  meId: string | null;
  statusFilter: string;
  setStatusFilter: (status: string) => void;
}) {
  const [openedIds, setOpenedIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [employeeFilter, setEmployeeFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const employees = Array.from(new Map(queue.map((k) => [k.employee_id, k.employees?.name ?? "—"])).entries());
  const types = Array.from(new Set(queue.map((k) => k.kpi_type)));

  const rows = useMemo(() => {
    const filtered = queue.filter(
      (k) =>
        (employeeFilter === "all" || k.employee_id === employeeFilter) &&
        (typeFilter === "all" || k.kpi_type === typeFilter) &&
        (statusFilter === "all" || k.status === statusFilter),
    );
    // FIFO: oldest submission first.
    return filtered.sort((a, b) => {
      const at = latestActual(a)?.entered_at ?? a.period_start;
      const bt = latestActual(b)?.entered_at ?? b.period_start;
      return at.localeCompare(bt);
    });
  }, [queue, employeeFilter, typeFilter, statusFilter]);

  const active = queue.find((k) => k.id === activeId) ?? null;

  const open = (kpi: KpiRow) => {
    setActiveId(kpi.id);
    setOpenedIds((ids) => (ids.includes(kpi.id) ? ids : [...ids, kpi.id]));
  };

  return (
    <section id="kpi-requests" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold">KPI submission requests</h2>
          <p className="text-sm text-muted-foreground">
            <span className="num">{rows.length}</span> request{rows.length === 1 ? "" : "s"} waiting — oldest first.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <FilterSelect value={employeeFilter} onChange={setEmployeeFilter} label="All employees"
            options={employees.map(([id, name]) => ({ value: id, label: name }))} />
          <FilterSelect value={typeFilter} onChange={setTypeFilter} label="All KPI types"
            options={types.map((t) => ({ value: t, label: t.replace(/_/g, " ") }))} />
          <FilterSelect value={statusFilter} onChange={setStatusFilter} label="All statuses"
            options={QUEUE_STATUSES.map((s) => ({ value: s, label: cardStatus(s, false).label }))} />
        </div>
      </div>

      {!rows.length ? (
        <div className="panel flex flex-col items-center gap-2 p-12 text-center">
          <Inbox className="h-6 w-6 text-muted-foreground" />
          <p className="text-sm font-medium">No pending requests — you're all caught up</p>
          <p className="text-xs text-muted-foreground">New submissions from your department will appear here.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rows.map((kpi) => {
            const status = cardStatus(kpi.status, openedIds.includes(kpi.id));
            const ownRecord = kpi.employee_id === meId;
            return (
              <article key={kpi.id} className="panel card-hover flex h-full flex-col p-5">
                <span className={`inline-flex w-fit items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
                  {status.label}
                </span>
                <h3 className="mt-3 text-[15px] font-semibold leading-snug">{kpi.name}</h3>
                <p className="mt-1 text-sm text-muted-foreground">{kpi.employees?.name}</p>
                <p className="text-xs text-muted-foreground">{kpi.employees?.designation ?? "Team member"}</p>
                <div className="mt-5 flex-1" />
                <Button
                  className="h-9 w-full rounded-lg font-semibold"
                  onClick={() => open(kpi)}
                  aria-label={`View request for ${kpi.name}`}
                >
                  View Request
                </Button>
                {ownRecord && (
                  <p className="mt-2 text-[11px] text-muted-foreground">Your own record — decisions are disabled.</p>
                )}
              </article>
            );
          })}
        </div>
      )}

      <Sheet open={!!active} onOpenChange={(v) => !v && setActiveId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-2xl">
          {active && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="text-base">{active.name}</SheetTitle>
                <SheetDescription>
                  {active.employees?.name} · {active.employees?.designation ?? "Team member"}
                </SheetDescription>
              </SheetHeader>
              <div className="space-y-6 p-4 pt-0">
                <RequestDetail key={active.id} kpi={active} meId={meId} onDone={() => setActiveId(null)} />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </section>
  );
}

function FilterSelect({
  value,
  onChange,
  label,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  options: { value: string; label: string }[];
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-9 w-[170px] text-xs">
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{label}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function cardStatus(status: string, opened: boolean) {
  if (status === "returned") return { label: "Returned", className: BAND_TINT.critical };
  if (status === "pending_target_approval") return { label: "Target pending", className: BAND_TINT.below };
  if (status === "correction_requested") return { label: "Pending final approval", className: BAND_TINT.exceptional };
  return opened
    ? { label: "Pending your review", className: BAND_TINT.below }
    : { label: "Submitted", className: BAND_TINT.meets };
}

/* ───────────────────────── Detail: record / calculation / decision ───────────────────────── */

function RequestDetail({ kpi, meId, onDone }: { kpi: KpiRow; meId: string | null; onDone: () => void }) {
  const queryClient = useQueryClient();
  const decide = useServerFn(reviewDecision);
  const approveTargetFn = useServerFn(approveTarget);
  const evidenceLink = useServerFn(getEvidenceLink);
  const score = latestScore(kpi);
  const actual = latestActual(kpi);
  const ownRecord = kpi.employee_id === meId;

  const [delta, setDelta] = useState("0");
  const [reasonCode, setReasonCode] = useState<string>("");
  const [justification, setJustification] = useState("");
  const [returnReason, setReturnReason] = useState("");
  const [showAdjust, setShowAdjust] = useState(false);
  const [showReturn, setShowReturn] = useState(false);
  const [busy, setBusy] = useState(false);
  const [locked, setLocked] = useState(false);
  const [touched, setTouched] = useState(false);

  const disabled = busy || locked || ownRecord;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setLocked(true);
    try {
      await fn();
      toast.success(ok);
      await queryClient.invalidateQueries();
      onDone();
    } catch (error) {
      setLocked(false);
      toast.error(error instanceof Error ? error.message : "Action failed");
    } finally {
      setBusy(false);
    }
  };

  const openEvidence = async (id: string) => {
    const res = (await evidenceLink({ data: { evidence_id: id } })) as { url: string | null; reason: string | null };
    if (res.url) window.open(res.url, "_blank", "noopener");
    else toast.info(res.reason ?? "Evidence unavailable");
  };

  if (kpi.status === "pending_target_approval") {
    return (
      <div className="panel p-5">
        <h3 className="text-sm font-semibold">Target approval</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Approve the target before the period opens. Targets are locked once approved.
        </p>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="field-label">Target</dt>
            <dd className="num text-lg">
              {kpi.target_value ?? "—"} {kpi.unit}
            </dd>
          </div>
          <div>
            <dt className="field-label">Period</dt>
            <dd className="num">
              {kpi.period_start} → {kpi.period_end}
            </dd>
          </div>
        </dl>
        <div className="mt-4 space-y-3">
          <Textarea
            rows={2}
            placeholder="Reason (required when returning)"
            value={returnReason}
            onChange={(e) => setReturnReason(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={disabled}
              onClick={() =>
                run(
                  () => approveTargetFn({ data: { kpi_definition_id: kpi.id, approve: true } }),
                  "Target approved — the KPI is now active",
                )
              }
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve target
            </Button>
            <Button
              variant="outline"
              disabled={disabled || returnReason.trim().length < 5}
              onClick={() =>
                run(
                  () =>
                    approveTargetFn({
                      data: { kpi_definition_id: kpi.id, approve: false, rejection_reason: returnReason },
                    }),
                  "Returned to HR for revision",
                )
              }
            >
              Return for revision
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* A. Record summary */}
      <div className="panel p-6">
        <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
          <div className="min-w-0">
            <h3 className="truncate text-base font-bold">{kpi.name}</h3>
            <p className="mt-0.5 truncate text-sm text-muted-foreground">
              {kpi.employees?.name} · {kpi.employees?.designation ?? "Team member"}
            </p>
          </div>
          <Link
            to="/kpi/$id"
            params={{ id: kpi.id }}
            className="inline-flex shrink-0 items-center gap-1 rounded-md px-1 text-xs font-medium text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            Open full record <ExternalLink className="h-3.5 w-3.5" />
          </Link>
        </div>
        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <div className="stat-block">
            <p className="field-label">Target</p>
            <p className="num mt-1 text-[15px] font-medium">
              {kpi.target_value ?? "—"} {kpi.target_value !== null ? (kpi.unit ?? "") : ""}
            </p>
          </div>
          <div className="stat-block">
            <p className="field-label">Actual</p>
            <p className="num mt-1 text-[15px] font-medium">{actual?.actual_value ?? actual?.rubric_level ?? "—"}</p>
          </div>
          <div className="stat-block">
            <p className="field-label">Evidence</p>
            <EvidenceList actual={actual} onOpen={openEvidence} />
          </div>
        </div>
        {actual?.comments && <p className="quote-callout mt-5 text-sm">“{actual.comments}”</p>}
      </div>

      {/* B. Calculation path */}
      <CalculationPanel kpi={kpi} score={score} />

      {/* C. Decision */}
      <div className="panel space-y-5 p-6">
        <h3 className="text-base font-bold">Decision</h3>
        {ownRecord && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <p className={`w-fit rounded-full border px-3 py-1 text-xs ${BAND_TINT.below}`}>
                  Segregation of duties
                </p>
              </TooltipTrigger>
              <TooltipContent>You cannot approve your own KPI record</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <Button
            className="h-10 rounded-lg font-semibold"
            disabled={disabled}
            onClick={() =>
              run(
                () => decide({ data: { kpi_definition_id: kpi.id, decision: "approve" } }),
                "Score approved and locked",
              )
            }
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Approve calculated
          </Button>
          <Button
            variant="outline"
            className="h-10 rounded-lg border-primary text-primary hover:bg-primary/10 hover:text-primary"
            disabled={disabled}
            aria-expanded={showAdjust}
            onClick={() => {
              setShowAdjust((v) => !v);
              setShowReturn(false);
            }}
          >
            Apply adjustment
          </Button>
          <Button
            variant="ghost"
            className="h-10 rounded-lg text-muted-foreground"
            disabled={disabled}
            aria-expanded={showReturn}
            onClick={() => {
              setShowReturn((v) => !v);
              setShowAdjust(false);
            }}
          >
            Return to employee
          </Button>
        </div>

        {showAdjust && (
          <div className="space-y-4 rounded-lg border border-border bg-surface-alt p-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="delta" className="field-label">
                  Adjustment (points)
                </Label>
                <Input
                  id="delta"
                  type="number"
                  className="num h-10"
                  value={delta}
                  onChange={(e) => setDelta(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="field-label">Reason code</Label>
                <Select value={reasonCode} onValueChange={setReasonCode}>
                  <SelectTrigger className="h-10">
                    <SelectValue placeholder="Select a reason" />
                  </SelectTrigger>
                  <SelectContent>
                    {REASON_CODES.map((code) => (
                      <SelectItem key={code.value} value={code.value}>
                        {code.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="just" className="field-label">
                Justification (min. 20 characters)
              </Label>
              <Textarea
                id="just"
                rows={3}
                value={justification}
                onBlur={() => setTouched(true)}
                onChange={(e) => setJustification(e.target.value)}
              />
              {touched && justification.trim().length < 20 && (
                <p className="text-xs text-destructive">A justification of at least 20 characters is required.</p>
              )}
            </div>
            <Button
              className="h-10 rounded-lg font-semibold"
              disabled={disabled || Number(delta) === 0 || !reasonCode || justification.trim().length < 20}
              onClick={() =>
                run(
                  () =>
                    decide({
                      data: {
                        kpi_definition_id: kpi.id,
                        decision: "adjust",
                        adjustment_delta: Number(delta),
                        adjustment_reason_code: reasonCode,
                        adjustment_justification: justification,
                      },
                    }),
                  "Adjustment applied and logged",
                )
              }
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Submit adjustment
            </Button>
          </div>
        )}

        {showReturn && (
          <div className="space-y-3 rounded-lg border border-border bg-surface-alt p-4">
            <Label htmlFor="return-reason" className="field-label">
              What needs fixing?
            </Label>
            <Textarea
              id="return-reason"
              rows={3}
              value={returnReason}
              onChange={(e) => setReturnReason(e.target.value)}
              placeholder="This note is shown to the employee when the KPI reopens."
            />
            <Button
              variant="outline"
              className="h-10 rounded-lg"
              disabled={disabled || returnReason.trim().length < 5}
              onClick={() =>
                run(
                  () =>
                    decide({
                      data: { kpi_definition_id: kpi.id, decision: "return", return_reason: returnReason },
                    }),
                  "Returned to the employee",
                )
              }
            >
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Send back to employee
            </Button>
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          Adjustments outside the policy band are escalated server-side; every decision is appended to the audit log.
        </p>
      </div>
    </div>
  );
}

function EvidenceList({ actual, onOpen }: { actual: ActualRow | null; onOpen: (id: string) => void }) {
  const files = actual?.evidence ?? [];
  return (
    <div className="mt-1 space-y-1">
      <p className="num text-[15px] font-medium">{files.length} file(s)</p>
      {files.map((f) => (
        <button
          key={f.id}
          onClick={() => onOpen(f.id)}
          className="flex w-full items-center gap-1 rounded text-left text-[11px] text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Paperclip className="h-3 w-3 shrink-0" />
          <span className="truncate">{f.file_name ?? "evidence"}</span>
        </button>
      ))}
    </div>
  );
}
