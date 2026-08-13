import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

const STEPS = ["Target", "Actual", "Evidence", "Score", "Review", "Approval"] as const;

const STAGE_BY_STATUS: Record<string, number> = {
  draft: 0,
  pending_target_approval: 0,
  active: 1,
  returned: 1,
  submitted: 4,
  correction_requested: 4,
  approved: 5,
};

export function WorkflowStepper({ status }: { status: string }) {
  const current = STAGE_BY_STATUS[status] ?? 0;
  return (
    <ol className="flex w-full flex-wrap items-center gap-y-3">
      {STEPS.map((step, index) => {
        const done = index < current || status === "approved";
        const active = index === current && status !== "approved";
        return (
          <li key={step} className="flex flex-1 min-w-[110px] items-center gap-2">
            <span
              className={cn(
                "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-xs num",
                done && "border-primary bg-primary text-primary-foreground",
                active && "border-attention bg-attention/10 text-attention",
                !done && !active && "border-border bg-card text-muted-foreground",
              )}
            >
              {done ? <Check className="h-4 w-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-xs font-medium",
                active ? "text-attention" : done ? "text-primary" : "text-muted-foreground",
              )}
            >
              {step}
            </span>
            {index < STEPS.length - 1 && <span className="mx-1 hidden h-px flex-1 bg-border sm:block" />}
          </li>
        );
      })}
    </ol>
  );
}
