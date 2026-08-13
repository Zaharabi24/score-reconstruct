type AuditRow = {
  id: string;
  entity_type: string;
  action: string;
  actor_role: string | null;
  timestamp: string;
  reason: string | null;
  before_value: unknown;
  after_value: unknown;
};

export function AuditTrail({ rows, title }: { rows: AuditRow[]; title: string }) {
  return (
    <div className="panel overflow-hidden">
      <div className="border-b border-border px-5 py-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">Append-only. Entries can never be edited or deleted.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-surface-alt text-left text-xs uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-5 py-2 font-medium">Timestamp</th>
              <th className="px-5 py-2 font-medium">Entity</th>
              <th className="px-5 py-2 font-medium">Action</th>
              <th className="px-5 py-2 font-medium">Actor role</th>
              <th className="px-5 py-2 font-medium">Reason</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border align-top">
                <td className="num whitespace-nowrap px-5 py-2 text-xs">
                  {new Date(row.timestamp).toLocaleString()}
                </td>
                <td className="px-5 py-2 text-xs">{row.entity_type}</td>
                <td className="px-5 py-2 text-xs font-medium">{row.action}</td>
                <td className="px-5 py-2 text-xs">{row.actor_role ?? "system"}</td>
                <td className="px-5 py-2 text-xs text-muted-foreground">{row.reason ?? "—"}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td className="px-5 py-6 text-sm text-muted-foreground" colSpan={5}>
                  No audit entries yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
