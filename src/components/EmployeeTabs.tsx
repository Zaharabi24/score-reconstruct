import { Link } from "@tanstack/react-router";

const TABS = [
  { to: "/kpis", label: "My KPIs" },
  { to: "/summary", label: "Performance Summary" },
] as const;

/** Tab switcher between the two employee screens, rendered inside the Employee section. */
export function EmployeeTabs() {
  return (
    <nav className="flex flex-wrap gap-2">
      {TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          className="rounded-full border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted"
          activeProps={{
            className:
              "rounded-full border border-primary-dark bg-primary-dark px-4 py-2 text-sm font-medium text-primary-foreground",
          }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
