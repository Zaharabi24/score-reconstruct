import { cn } from "@/lib/utils";

const MAP: Record<string, { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-muted text-muted-foreground border-border" },
  pending_target_approval: {
    label: "Target pending",
    className: "bg-attention/10 text-attention border-attention/30",
  },
  active: { label: "Active", className: "bg-primary/10 text-primary border-primary/30" },
  submitted: { label: "Submitted", className: "bg-attention/10 text-attention border-attention/30" },
  returned: { label: "Returned", className: "bg-destructive/10 text-destructive border-destructive/30" },
  approved: { label: "Approved", className: "bg-primary text-primary-foreground border-primary" },
  correction_requested: {
    label: "Correction requested",
    className: "bg-destructive/10 text-destructive border-destructive/30",
  },
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const item = MAP[status] ?? MAP["draft"]!;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium",
        item.className,
        className,
      )}
    >
      {item.label}
    </span>
  );
}

export const STATUS_LABEL = (status: string) => MAP[status]?.label ?? status;
