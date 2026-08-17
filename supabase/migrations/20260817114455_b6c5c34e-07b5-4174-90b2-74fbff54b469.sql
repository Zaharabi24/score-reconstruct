-- departments: explicit hr_admin-only write policies
DROP POLICY IF EXISTS departments_insert_hr ON public.departments;
DROP POLICY IF EXISTS departments_update_hr ON public.departments;
DROP POLICY IF EXISTS departments_delete_hr ON public.departments;

CREATE POLICY departments_insert_hr ON public.departments
  FOR INSERT TO authenticated
  WITH CHECK (private.my_role() = 'hr_admin');

CREATE POLICY departments_update_hr ON public.departments
  FOR UPDATE TO authenticated
  USING (private.my_role() = 'hr_admin')
  WITH CHECK (private.my_role() = 'hr_admin');

CREATE POLICY departments_delete_hr ON public.departments
  FOR DELETE TO authenticated
  USING (private.my_role() = 'hr_admin');

-- employees: explicit hr_admin-only provisioning / deprovisioning
DROP POLICY IF EXISTS employees_insert_hr ON public.employees;
DROP POLICY IF EXISTS employees_delete_hr ON public.employees;

CREATE POLICY employees_insert_hr ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK (private.my_role() = 'hr_admin');

CREATE POLICY employees_delete_hr ON public.employees
  FOR DELETE TO authenticated
  USING (private.my_role() = 'hr_admin' AND id <> auth.uid());

-- audit_log: make the append-only intent explicit; clients may never write.
REVOKE INSERT, UPDATE, DELETE ON public.audit_log FROM authenticated, anon;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;