
CREATE SCHEMA IF NOT EXISTS private;

-- 1. Helper functions moved out of the API-exposed schema
CREATE OR REPLACE FUNCTION private.my_role()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.my_department()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.employees WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION private.manages(_employee_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = _employee_id AND e.manager_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION private.can_see_kpi(_kpi_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.id = _kpi_id AND (
      k.employee_id = auth.uid()
      OR k.reviewer_id = auth.uid()
      OR k.approver_id = auth.uid()
      OR private.manages(k.employee_id)
      OR private.my_role() IN ('hr_admin','executive')
    )
  )
$$;

-- 2. Recreate policies against the private helpers
DROP POLICY IF EXISTS actuals_read ON public.actual_entries;
CREATE POLICY actuals_read ON public.actual_entries FOR SELECT TO authenticated
  USING (private.can_see_kpi(kpi_definition_id));

DROP POLICY IF EXISTS audit_read ON public.audit_log;
CREATE POLICY audit_read ON public.audit_log FOR SELECT TO authenticated
  USING (private.my_role() IN ('hr_admin','executive') OR employee_id = auth.uid() OR private.manages(employee_id));

DROP POLICY IF EXISTS employees_read ON public.employees;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR manager_id = auth.uid()
    OR private.my_role() IN ('hr_admin','executive')
    OR (private.my_role() = 'manager' AND department_id = private.my_department())
  );

DROP POLICY IF EXISTS evidence_read ON public.evidence;
CREATE POLICY evidence_read ON public.evidence FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.actual_entries a WHERE a.id = evidence.actual_entry_id AND private.can_see_kpi(a.kpi_definition_id)));

DROP POLICY IF EXISTS kpi_read ON public.kpi_definitions;
CREATE POLICY kpi_read ON public.kpi_definitions FOR SELECT TO authenticated
  USING (
    employee_id = auth.uid() OR reviewer_id = auth.uid() OR approver_id = auth.uid()
    OR private.manages(employee_id) OR private.my_role() IN ('hr_admin','executive')
  );

DROP POLICY IF EXISTS scores_read ON public.score_records;
CREATE POLICY scores_read ON public.score_records FOR SELECT TO authenticated
  USING (private.can_see_kpi(kpi_definition_id));

-- 3. Scope over-broad reads
DROP POLICY IF EXISTS departments_read ON public.departments;
CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated
  USING (
    private.my_role() IN ('hr_admin','executive','manager')
    OR id = private.my_department()
    OR id = (SELECT e.department_id FROM public.employees e WHERE e.manager_id = auth.uid() LIMIT 1)
  );

DROP POLICY IF EXISTS rubrics_read ON public.rubrics;
CREATE POLICY rubrics_read ON public.rubrics FOR SELECT TO authenticated
  USING (
    private.my_role() IN ('hr_admin','executive','manager')
    OR EXISTS (SELECT 1 FROM public.kpi_definitions k WHERE k.rubric_id = rubrics.id AND private.can_see_kpi(k.id))
  );

DROP POLICY IF EXISTS rubrics_write ON public.rubrics;
CREATE POLICY rubrics_write ON public.rubrics FOR ALL TO authenticated
  USING (private.my_role() = 'hr_admin') WITH CHECK (private.my_role() = 'hr_admin');

DROP POLICY IF EXISTS policy_read ON public.scoring_policy;
CREATE POLICY policy_read ON public.scoring_policy FOR SELECT TO authenticated
  USING (
    private.my_role() IN ('hr_admin','executive','manager')
    OR department_id IS NULL
    OR department_id = private.my_department()
  );

DROP POLICY IF EXISTS policy_write ON public.scoring_policy;
CREATE POLICY policy_write ON public.scoring_policy FOR UPDATE TO authenticated
  USING (private.my_role() = 'hr_admin') WITH CHECK (private.my_role() = 'hr_admin');

DROP POLICY IF EXISTS policy_insert ON public.scoring_policy;
CREATE POLICY policy_insert ON public.scoring_policy FOR INSERT TO authenticated
  WITH CHECK (private.my_role() = 'hr_admin');

DROP POLICY IF EXISTS employees_update_self ON public.employees;
CREATE POLICY employees_update_self ON public.employees FOR UPDATE TO authenticated
  USING (id = auth.uid()) WITH CHECK (id = auth.uid());

-- 4. Controlled write path for actual entries (immutable once written)
GRANT INSERT ON public.actual_entries TO authenticated;
CREATE POLICY actuals_insert_own ON public.actual_entries FOR INSERT TO authenticated
  WITH CHECK (
    entered_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.kpi_definitions k
      WHERE k.id = actual_entries.kpi_definition_id
        AND k.employee_id = auth.uid()
        AND k.status IN ('active','returned','correction_requested')
    )
  );

-- 5. Trigger functions: keep in public but not callable through the API
REVOKE EXECUTE ON FUNCTION public.audit_row() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.my_role() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.my_department() FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.manages(uuid) FROM anon, authenticated, public;
REVOKE EXECUTE ON FUNCTION public.can_see_kpi(uuid) FROM anon, authenticated, public;
DROP FUNCTION IF EXISTS public.can_see_kpi(uuid);
DROP FUNCTION IF EXISTS public.manages(uuid);
DROP FUNCTION IF EXISTS public.my_department();
DROP FUNCTION IF EXISTS public.my_role();

-- private helpers are only used inside policies; not reachable via the API schema
GRANT USAGE ON SCHEMA private TO authenticated, anon;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA private TO authenticated, anon;

-- 6. Evidence storage object policies (uploads/deletes stay server-side only)
DROP POLICY IF EXISTS evidence_objects_read ON storage.objects;
CREATE POLICY evidence_objects_read ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (
      (storage.foldername(name))[1] = auth.uid()::text
      OR private.can_see_kpi((NULLIF((storage.foldername(name))[2], ''))::uuid)
    )
  );
