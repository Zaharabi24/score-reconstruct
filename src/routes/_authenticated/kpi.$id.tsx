import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Download, FileCheck2, Loader2 } from "lucide-react";
import { useMe } from "@/hooks/useMe";
import { latestActual, latestScore, useAuditLog, useKpi, useRealtimeKpis, useRubrics } from "@/lib/queries";
import { getEvidenceLink, getReportPayload, submitActual } from "@/lib/kpi.functions";
import { buildKpiReport } from "@/lib/report";
import { StatusBadge } from "@/components/StatusBadge";
import { WorkflowStepper } from "@/components/WorkflowStepper";
import { CalculationPanel } from "@/components/CalculationPanel";
import { AuditTrail } from "@/components/AuditTrail";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export const Route = createFileRoute("/_authenticated/kpi/$id")({
  head: () => ({
    meta: [
      { title: "KPI detail — Anwar KPIFlow" },
      { name: "description", content: "Target, actual, evidence, score calculation, review and approval history." },
      { property: "og:title", content: "KPI detail — Anwar KPIFlow" },
      { property: "og:description", content: "Full calculation path and audit trail for a single KPI." },
    ],
  }),
  component: KpiDetail,
});

function KpiDetail() {
  const { id } = Route.useParams();
  const { data: me } = useMe();
  useRealtimeKpis();
  const { data: kpi, isLoading } = useKpi(id);
  const { data: audit } = useAuditLog(id);
  const { data: rubrics } = useRubrics();
  const queryClient = useQueryClient();
  const submit = useServerFn(submitActual);
  const evidenceLink = useServerFn(getEvidenceLink);
  const reportFn = useServerFn(getReportPayload);

  const [actualValue, setActualValue] = useState("");
  const [rubricLevel, setRubricLevel] = useState("3");
  const [comments, setComments] = useState("");
  const [source, setSource] = useState("verified_manual");
  const [file, setFile] = useState<File | null>(null);
  const [milestoneSel, setMilestoneSel] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);

  if (isLoading) return <p className="text-sm text-muted-foreground">Loading…</p>;
  if (!kpi) return <p className="text-sm text-muted-foreground">KPI not found or not visible to you.</p>;

  const score = latestScore(kpi);
  const actual = latestActual(kpi);
  const isOwner = me?.id === kpi.employee_id;
  const canSubmit = isOwner && ["active", "returned"].includes(kpi.status);
  const milestones = (kpi.milestones as { label: string; weight: number; completed?: boolean }[] | null) ?? [];
  const needsEvidence = source !== "system_verified";

  const readFile = (f: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(f);
    });

  const onSubmit = async () => {
    setBusy(true);
    try {
      const evidence = file
        ? { file_name: file.name, content_base64: await readFile(file), description: comments || null }
        : null;
      const result = await submit({
        data: {
          kpi_definition_id: kpi.id,
          actual_value: kpi.kpi_type === "qualitative" || kpi.kpi_type === "milestone" ? null : Number(actualValue),
          rubric_level: kpi.kpi_type === "qualitative" ? Number(rubricLevel) : null,
          reporting_date: new Date().toISOString().slice(0, 10),
          comments: comments || null,
          data_source_type: source as "system_verified" | "verified_manual" | "unverified",
          completed_milestones: kpi.kpi_type === "milestone" ? milestoneSel : null,
          evidence,
        },
      });
      toast.success(
        `Submitted — achievement ${result.achievement_percent ?? "n/a"}%, calculated score ${result.calculated_score}`,
      );
      setFile(null);
      queryClient.invalidateQueries();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Submission failed");
    } finally {
      setBusy(false);
    }
  };

  const downloadEvidence = async (evidenceId: string) => {
    try {
      const { url, reason } = await evidenceLink({ data: { evidence_id: evidenceId } });
      if (!url) {
        toast.error(reason ?? "Could not create a download link");
        return;
      }
      window.open(url, "_blank", "noopener");
    } catch {
      toast.error("Could not create a download link");
    }
  };

  const downloadReport = async () => {
    try {
      const payload = await reportFn({ data: { kpi_definition_id: kpi.id } });
      buildKpiReport(payload as never, `KPI record — ${kpi.name}`).save(`kpi-${kpi.id.slice(0, 8)}.pdf`);
    } catch {
      toast.error("Could not generate the report");
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl">{kpi.name}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {kpi.employees?.name} · {kpi.perspective} · weight <span className="num">{kpi.weight_percent}%</span> ·{" "}
            {kpi.period_start} → {kpi.period_end}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusBadge status={kpi.status} />
          <Button variant="outline" size="sm" onClick={downloadReport}>
            <Download className="mr-1 h-4 w-4" /> Download report
          </Button>
        </div>
      </div>

      <div className="panel p-5">
        <WorkflowStepper status={kpi.status} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          <div className="panel p-5">
            <h3 className="text-sm font-semibold">Target and actual</h3>
            {kpi.description && <p className="mt-2 text-sm text-muted-foreground">{kpi.description}</p>}
            <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
              <div>
                <dt className="text-xs text-muted-foreground">Target</dt>
                <dd className="num text-lg">
                  {kpi.target_value ?? "—"} {kpi.unit}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Latest actual</dt>
                <dd className="num text-lg">{actual?.actual_value ?? actual?.rubric_level ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Data source</dt>
                <dd>{actual?.data_source_type ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Reviewer / approver</dt>
                <dd>
                  {kpi.reviewer?.name ?? "—"} / {kpi.approver?.name ?? "—"}
                </dd>
              </div>
            </dl>

            {!!milestones.length && (
              <ul className="mt-4 space-y-1.5 text-sm">
                {milestones.map((m, i) => (
                  <li key={i} className="flex justify-between border-b border-border pb-1.5 last:border-0">
                    <span>{m.label}</span>
                    <span className="num">
                      {m.weight}% · {m.completed ? "done" : "open"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="panel p-5">
            <h3 className="text-sm font-semibold">Evidence</h3>
            <div className="mt-3 space-y-3">
              {(kpi.actual_entries ?? []).flatMap((entry) =>
                (entry.evidence ?? []).map((ev) => (
                  <div key={ev.id} className="rounded-md border border-border bg-surface-alt p-3">
                    <div className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-sm">
                        <FileCheck2 className="h-4 w-4 text-primary" />
                        {ev.file_name}
                      </span>
                      <Button variant="ghost" size="sm" onClick={() => downloadEvidence(ev.id)}>
                        Download
                      </Button>
                    </div>
                    <p className="num mt-2 break-all text-xs text-muted-foreground">sha256:{ev.file_hash}</p>
                  </div>
                )),
              )}
              {!(kpi.actual_entries ?? []).some((e) => (e.evidence ?? []).length) && (
                <p className="text-sm text-muted-foreground">No evidence attached yet.</p>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <CalculationPanel kpi={kpi} score={score} />

          {canSubmit && (
            <div id="submit" className="panel p-5">
              <h3 className="text-sm font-semibold">Enter actual and evidence</h3>
              <div className="mt-4 space-y-4">
                {kpi.kpi_type === "qualitative" ? (
                  <div className="space-y-1.5">
                    <Label>Rubric level</Label>
                    <Select value={rubricLevel} onValueChange={setRubricLevel}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(
                          ((rubrics ?? []).find((r) => r.id === kpi["rubric_id"])?.levels as
                            | { level: number; label: string }[]
                            | undefined) ?? [1, 2, 3, 4, 5].map((l) => ({ level: l, label: `Level ${l}` }))
                        ).map((lvl) => (
                          <SelectItem key={lvl.level} value={String(lvl.level)}>
                            {lvl.level} — {lvl.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                ) : kpi.kpi_type === "milestone" ? (
                  <div className="space-y-2">
                    <Label>Completed milestones</Label>
                    {milestones.map((m, i) => (
                      <label key={i} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          checked={milestoneSel.includes(i)}
                          onChange={(e) =>
                            setMilestoneSel((prev) =>
                              e.target.checked ? [...prev, i] : prev.filter((x) => x !== i),
                            )
                          }
                        />
                        {m.label} <span className="num text-muted-foreground">({m.weight}%)</span>
                      </label>
                    ))}
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    <Label htmlFor="actual">Actual value ({kpi.unit ?? "units"})</Label>
                    <Input
                      id="actual"
                      type="number"
                      value={actualValue}
                      onChange={(e) => setActualValue(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Data source</Label>
                  <Select value={source} onValueChange={setSource}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="verified_manual">Verified manual</SelectItem>
                      <SelectItem value="unverified">Unverified</SelectItem>
                      <SelectItem value="system_verified">System verified</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="evidence">Evidence file {needsEvidence && "(required)"}</Label>
                  <Input id="evidence" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="comments">Comments</Label>
                  <Textarea id="comments" value={comments} onChange={(e) => setComments(e.target.value)} rows={3} />
                </div>

                <Button
                  className="w-full"
                  disabled={
                    busy ||
                    (needsEvidence && !file) ||
                    (kpi.kpi_type !== "qualitative" && kpi.kpi_type !== "milestone" && !actualValue)
                  }
                  onClick={onSubmit}
                >
                  {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Submit actual for review
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>

      <AuditTrail rows={audit ?? []} title="Audit history for this KPI" />
    </div>
  );
}
