import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type AnyRow = Record<string, unknown>;

const money = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));

export function buildKpiReport(payload: { kpis: AnyRow[]; audit: AnyRow[]; generated_at: string }, title: string) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Anwar KPIFlow — Performance Record", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(title, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date(payload.generated_at).toLocaleString()}`, margin, y);
  y += 20;

  for (const kpi of payload.kpis) {
    const scores = ((kpi["score_records"] as AnyRow[]) ?? []).sort(
      (a, b) => Number(a["version_number"]) - Number(b["version_number"]),
    );
    const latest = scores[scores.length - 1];
    const actuals = ((kpi["actual_entries"] as AnyRow[]) ?? []).sort(
      (a, b) => String(a["entered_at"]).localeCompare(String(b["entered_at"])),
    );
    const lastActual = actuals[actuals.length - 1];
    const evidence = ((lastActual?.["evidence"] as AnyRow[]) ?? [])[0];

    doc.setFont("helvetica", "bold");
    doc.setFontSize(12);
    doc.text(String(kpi["name"]), margin, y);
    y += 6;

    autoTable(doc, {
      startY: y + 6,
      theme: "grid",
      styles: { fontSize: 9, cellPadding: 4 },
      headStyles: { fillColor: [31, 111, 92] },
      head: [["Field", "Value"]],
      body: [
        ["Employee", money((kpi["employees"] as AnyRow | null)?.["name"])],
        ["KPI type", money(kpi["kpi_type"])],
        ["Perspective", money(kpi["perspective"])],
        ["Weight", `${money(kpi["weight_percent"])}%`],
        ["Period", `${money(kpi["period_start"])} → ${money(kpi["period_end"])}`],
        ["Target", `${money(kpi["target_value"])} ${money(kpi["unit"])}`],
        ["Actual", money(lastActual?.["actual_value"])],
        ["Data source", money(lastActual?.["data_source_type"])],
        ["Evidence file", money(evidence?.["file_name"])],
        ["Evidence SHA-256", money(evidence?.["file_hash"])],
        ["Achievement %", money(latest?.["achievement_percent"])],
        ["Calculated score", money(latest?.["calculated_score"])],
        ["Adjustment", money(latest?.["adjustment_delta"])],
        ["Adjustment reason", money(latest?.["adjustment_reason_code"])],
        ["Justification", money(latest?.["adjustment_justification"])],
        ["Final score", money(latest?.["final_score"])],
        ["Score version", money(latest?.["version_number"])],
        ["Approved at", money(latest?.["approved_at"])],
        ["Status", money(kpi["status"])],
        ["Calculation trace", JSON.stringify(latest?.["calculation_trace"] ?? {})],
      ],
    });
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 18;

    const trail = payload.audit.filter((a) => a["entity_id"] === kpi["id"] || a["employee_id"] === kpi["employee_id"]);
    if (trail.length) {
      autoTable(doc, {
        startY: y,
        theme: "striped",
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [18, 59, 49] },
        head: [["Timestamp", "Action", "Actor role", "Reason"]],
        body: trail.map((a) => [
          new Date(String(a["timestamp"])).toLocaleString(),
          String(a["action"]),
          String(a["actor_role"] ?? "system"),
          String(a["reason"] ?? ""),
        ]),
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 24;
    }

    if (y > 700) {
      doc.addPage();
      y = margin;
    }
  }

  return doc;
}

type DashboardPayload = {
  periodLabel: string;
  glance: {
    evaluated: number;
    people: number;
    avgScore: number;
    avgAchievement: number;
    approvalsPending: number;
    adjusted: number;
    belowTarget: number;
    totalKpis: number;
  };
  best: { name: string; achievement: number | null } | null;
  watch: { name: string; achievement: number | null } | null;
  departments: {
    name: string;
    achievement: number | null;
    pending: number;
    belowTarget: number;
    high: { name: string; score: number } | null;
    low: { name: string; score: number } | null;
  }[];
  people: {
    name: string;
    department: string;
    achievedPoints: number;
    totalPoints: number;
    percent: number;
    kpiCount: number;
    pending: number;
  }[];
  trend: { label: string; score: number }[];
  adjusters: { name: string; count: number }[];
};

export function buildDashboardReport(payload: DashboardPayload) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const margin = 40;
  let y = margin;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Anwar KPIFlow — Management Dashboard", margin, y);
  y += 18;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.text(`Period: ${payload.periodLabel}`, margin, y);
  y += 14;
  doc.text(`Generated: ${new Date().toLocaleString()}`, margin, y);
  y += 12;

  const g = payload.glance;
  autoTable(doc, {
    startY: y + 6,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [31, 111, 92] },
    head: [["At a glance", "Value"]],
    body: [
      ["Evaluated / people", `${g.evaluated} / ${g.people}`],
      ["Average score", `${g.avgScore} / 120`],
      ["Average target achievement", `${g.avgAchievement}%`],
      ["Approvals pending", String(g.approvalsPending)],
      ["Best department", payload.best ? `${payload.best.name} (${payload.best.achievement ?? "—"}%)` : "—"],
      ["Weakest department", payload.watch ? `${payload.watch.name} (${payload.watch.achievement ?? "—"}%)` : "—"],
      ["KPIs below target", String(g.belowTarget)],
      ["Manually adjusted", String(g.adjusted)],
      ["Total KPIs in period", String(g.totalKpis)],
    ],
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [18, 59, 49] },
    head: [["Department", "Avg achievement", "Pending", "Below target", "Top performer", "Needs support"]],
    body: payload.departments.map((d) => [
      d.name,
      d.achievement === null ? "—" : `${d.achievement}%`,
      String(d.pending),
      String(d.belowTarget),
      d.high ? `${d.high.name} (${d.high.score.toFixed(1)})` : "—",
      d.low ? `${d.low.name} (${d.low.score.toFixed(1)})` : "—",
    ]),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  autoTable(doc, {
    startY: y,
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [31, 111, 92] },
    head: [["Person", "Department", "Achieved / total pts", "Achievement", "KPIs", "Pending"]],
    body: payload.people.map((p) => [
      p.name,
      p.department,
      `${p.achievedPoints} / ${p.totalPoints}`,
      `${Math.min(100, p.percent)}%`,
      String(p.kpiCount),
      String(p.pending),
    ]),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  if (y > 640) {
    doc.addPage();
    y = margin;
  }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [18, 59, 49] },
    head: [["Period", "Average score"]],
    body: payload.trend.map((t) => [t.label, String(t.score)]),
  });
  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 20;

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    headStyles: { fillColor: [31, 111, 92] },
    head: [["Reviewer", "Manual adjustments"]],
    body: payload.adjusters.length ? payload.adjusters.map((a) => [a.name, String(a.count)]) : [["No manual adjustments", "0"]],
  });

  return doc;
}
