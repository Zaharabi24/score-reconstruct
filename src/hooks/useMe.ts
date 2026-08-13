import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export type Me = {
  id: string;
  name: string;
  email: string;
  role: "employee" | "manager" | "hr_admin" | "executive";
  department_id: string | null;
  manager_id: string | null;
};

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: async (): Promise<Me | null> => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return null;
      const { data } = await supabase
        .from("employees")
        .select("id,name,email,role,department_id,manager_id")
        .eq("id", auth.user.id)
        .maybeSingle();
      return (data as Me | null) ?? null;
    },
    staleTime: 60_000,
  });
}

export const ROLE_LABEL: Record<string, string> = {
  employee: "Employee",
  manager: "Manager / Reviewer",
  hr_admin: "HR Admin",
  executive: "Executive",
};
