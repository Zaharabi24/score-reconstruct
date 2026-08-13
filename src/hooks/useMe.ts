import { useWorkspace } from "@/lib/queries";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "manager" | "hr_admin" | "executive";
  department_id: string | null;
  manager_id: string | null;
};

/** The employee the app is acting as — the selected demo persona, or the signed-in account. */
export function useMe() {
  const { data, isLoading } = useWorkspace();
  return { data: (data?.me as Me | undefined) ?? null, isLoading };
}

export const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  manager: "Manager / Reviewer",
  hr_admin: "HR Admin",
  executive: "Executive",
};

export const ROLE_ORDER = ["employee", "manager", "hr_admin", "executive"] as const;
