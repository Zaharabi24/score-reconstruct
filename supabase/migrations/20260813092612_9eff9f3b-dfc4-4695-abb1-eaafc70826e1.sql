
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  parent_department_id UUID REFERENCES public.departments(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.employees (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'employee' CHECK (role IN ('employee','manager','hr_admin','executive')),
  department_id UUID REFERENCES public.departments(id),
  manager_id UUID REFERENCES public.employees(id),
  is_demo BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  levels JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.scoring_policy (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id),
  achievement_floor NUMERIC NOT NULL DEFAULT 70,
  achievement_cap NUMERIC NOT NULL DEFAULT 120,
  adjustment_escalation_threshold NUMERIC NOT NULL DEFAULT 10,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.kpi_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id),
  department_id UUID REFERENCES public.departments(id),
  name TEXT NOT NULL,
  description TEXT,
  kpi_type TEXT NOT NULL CHECK (kpi_type IN ('higher_is_better','lower_is_better','milestone','qualitative')),
  target_value NUMERIC,
  unit TEXT,
  weight_percent NUMERIC NOT NULL CHECK (weight_percent > 0 AND weight_percent <= 100),
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  perspective TEXT NOT NULL CHECK (perspective IN ('financial','customer','operational','people')),
  reviewer_id UUID REFERENCES public.employees(id),
  approver_id UUID REFERENCES public.employees(id),
  rubric_id UUID REFERENCES public.rubrics(id),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','pending_target_approval','active','submitted','returned','approved','correction_requested')),
  milestones JSONB,
  created_by UUID REFERENCES public.employees(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.actual_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  actual_value NUMERIC,
  rubric_level INT,
  data_source_type TEXT NOT NULL DEFAULT 'unverified' CHECK (data_source_type IN ('system_verified','verified_manual','unverified')),
  reporting_date DATE NOT NULL DEFAULT CURRENT_DATE,
  comments TEXT,
  entered_by UUID REFERENCES public.employees(id),
  entered_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.evidence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  actual_entry_id UUID NOT NULL REFERENCES public.actual_entries(id) ON DELETE CASCADE,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_hash TEXT NOT NULL,
  file_size INT,
  uploaded_by UUID REFERENCES public.employees(id),
  uploaded_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  description TEXT
);

CREATE TABLE public.score_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_definition_id UUID NOT NULL REFERENCES public.kpi_definitions(id) ON DELETE CASCADE,
  version_number INT NOT NULL DEFAULT 1,
  calculated_score NUMERIC,
  achievement_percent NUMERIC,
  adjustment_delta NUMERIC NOT NULL DEFAULT 0,
  adjustment_reason_code TEXT,
  adjustment_justification TEXT,
  final_score NUMERIC,
  calculation_trace JSONB,
  reviewed_by UUID REFERENCES public.employees(id),
  reviewed_at TIMESTAMPTZ,
  approved_by UUID REFERENCES public.employees(id),
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type TEXT NOT NULL,
  entity_id UUID,
  action TEXT NOT NULL,
  actor_id UUID,
  actor_role TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT now(),
  before_value JSONB,
  after_value JSONB,
  reason TEXT,
  employee_id UUID
);

CREATE INDEX idx_kpi_employee ON public.kpi_definitions(employee_id);
CREATE INDEX idx_scores_kpi ON public.score_records(kpi_definition_id);
CREATE INDEX idx_audit_entity ON public.audit_log(entity_id);

CREATE OR REPLACE FUNCTION public.my_role()
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role FROM public.employees WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.my_department()
RETURNS UUID LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT department_id FROM public.employees WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.manages(_employee_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.employees e WHERE e.id = _employee_id AND e.manager_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.can_see_kpi(_kpi_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.kpi_definitions k
    WHERE k.id = _kpi_id AND (
      k.employee_id = auth.uid()
      OR k.reviewer_id = auth.uid()
      OR k.approver_id = auth.uid()
      OR public.manages(k.employee_id)
      OR public.my_role() IN ('hr_admin','executive')
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _dept UUID;
BEGIN
  SELECT id INTO _dept FROM public.departments
   WHERE name = COALESCE(NEW.raw_user_meta_data->>'department_name', 'Corporate') LIMIT 1;
  INSERT INTO public.employees (id, name, email, role, department_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email,'@',1)),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'employee'),
    _dept
  ) ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END; $$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _emp UUID;
BEGIN
  IF TG_TABLE_NAME = 'kpi_definitions' THEN
    _emp := NEW.employee_id;
  ELSE
    SELECT k.employee_id INTO _emp FROM public.kpi_definitions k WHERE k.id = NEW.kpi_definition_id;
  END IF;

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, before_value, after_value, employee_id)
  VALUES (
    TG_TABLE_NAME, NEW.id, lower(TG_OP), auth.uid(), public.my_role(),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), _emp
  );
  RETURN NEW;
END; $$;

CREATE TRIGGER audit_kpi_definitions AFTER INSERT OR UPDATE ON public.kpi_definitions
FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_actual_entries AFTER INSERT ON public.actual_entries
FOR EACH ROW EXECUTE FUNCTION public.audit_row();
CREATE TRIGGER audit_score_records AFTER INSERT OR UPDATE ON public.score_records
FOR EACH ROW EXECUTE FUNCTION public.audit_row();

GRANT SELECT ON public.departments TO authenticated;
GRANT ALL ON public.departments TO service_role;
GRANT SELECT, UPDATE ON public.employees TO authenticated;
GRANT ALL ON public.employees TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rubrics TO authenticated;
GRANT ALL ON public.rubrics TO service_role;
GRANT SELECT, INSERT, UPDATE ON public.scoring_policy TO authenticated;
GRANT ALL ON public.scoring_policy TO service_role;
GRANT SELECT ON public.kpi_definitions TO authenticated;
GRANT ALL ON public.kpi_definitions TO service_role;
GRANT SELECT ON public.actual_entries TO authenticated;
GRANT ALL ON public.actual_entries TO service_role;
GRANT SELECT ON public.evidence TO authenticated;
GRANT ALL ON public.evidence TO service_role;
GRANT SELECT ON public.score_records TO authenticated;
GRANT ALL ON public.score_records TO service_role;
GRANT SELECT ON public.audit_log TO authenticated;
GRANT INSERT, SELECT ON public.audit_log TO service_role;

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
CREATE POLICY departments_read ON public.departments FOR SELECT TO authenticated USING (true);

ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
CREATE POLICY employees_read ON public.employees FOR SELECT TO authenticated
USING (
  id = auth.uid()
  OR manager_id = auth.uid()
  OR public.my_role() IN ('hr_admin','executive')
  OR (public.my_role() = 'manager' AND department_id = public.my_department())
);
CREATE POLICY employees_update_self ON public.employees FOR UPDATE TO authenticated
USING (id = auth.uid()) WITH CHECK (id = auth.uid());

ALTER TABLE public.rubrics ENABLE ROW LEVEL SECURITY;
CREATE POLICY rubrics_read ON public.rubrics FOR SELECT TO authenticated USING (true);
CREATE POLICY rubrics_write ON public.rubrics FOR ALL TO authenticated
USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');

ALTER TABLE public.scoring_policy ENABLE ROW LEVEL SECURITY;
CREATE POLICY policy_read ON public.scoring_policy FOR SELECT TO authenticated USING (true);
CREATE POLICY policy_write ON public.scoring_policy FOR UPDATE TO authenticated
USING (public.my_role() = 'hr_admin') WITH CHECK (public.my_role() = 'hr_admin');
CREATE POLICY policy_insert ON public.scoring_policy FOR INSERT TO authenticated
WITH CHECK (public.my_role() = 'hr_admin');

ALTER TABLE public.kpi_definitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY kpi_read ON public.kpi_definitions FOR SELECT TO authenticated
USING (
  employee_id = auth.uid() OR reviewer_id = auth.uid() OR approver_id = auth.uid()
  OR public.manages(employee_id) OR public.my_role() IN ('hr_admin','executive')
);

ALTER TABLE public.actual_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY actuals_read ON public.actual_entries FOR SELECT TO authenticated
USING (public.can_see_kpi(kpi_definition_id));

ALTER TABLE public.evidence ENABLE ROW LEVEL SECURITY;
CREATE POLICY evidence_read ON public.evidence FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.actual_entries a WHERE a.id = actual_entry_id AND public.can_see_kpi(a.kpi_definition_id)));

ALTER TABLE public.score_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY scores_read ON public.score_records FOR SELECT TO authenticated
USING (public.can_see_kpi(kpi_definition_id));

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON public.audit_log FOR SELECT TO authenticated
USING (
  public.my_role() IN ('hr_admin','executive')
  OR employee_id = auth.uid()
  OR public.manages(employee_id)
);

ALTER TABLE public.kpi_definitions REPLICA IDENTITY FULL;
ALTER TABLE public.score_records REPLICA IDENTITY FULL;
ALTER TABLE public.actual_entries REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.kpi_definitions;
ALTER PUBLICATION supabase_realtime ADD TABLE public.score_records;
ALTER PUBLICATION supabase_realtime ADD TABLE public.actual_entries;

INSERT INTO public.departments (id, name) VALUES
 ('11111111-1111-1111-1111-111111111101','Corporate'),
 ('11111111-1111-1111-1111-111111111102','Sales'),
 ('11111111-1111-1111-1111-111111111103','Operations'),
 ('11111111-1111-1111-1111-111111111104','Human Resources'),
 ('11111111-1111-1111-1111-111111111105','Finance');

INSERT INTO public.scoring_policy (id, department_id) VALUES
 ('22222222-2222-2222-2222-222222222201', NULL);

INSERT INTO public.rubrics (id, name, levels) VALUES
 ('33333333-3333-3333-3333-333333333301','Standard Behaviour Rubric',
  '[{"level":1,"label":"Needs Improvement","description":"Consistently below expectation"},
    {"level":2,"label":"Developing","description":"Occasionally meets expectation"},
    {"level":3,"label":"Meets Expectation","description":"Reliably delivers the standard"},
    {"level":4,"label":"Exceeds","description":"Frequently above the standard"},
    {"level":5,"label":"Outstanding","description":"Role model across the business"}]'::jsonb);

INSERT INTO public.employees (id, name, email, role, department_id, manager_id, is_demo) VALUES
 ('44444444-4444-4444-4444-444444444401','Tanvir Rahman','tanvir@anwargroup.demo','manager','11111111-1111-1111-1111-111111111102',NULL,true),
 ('44444444-4444-4444-4444-444444444402','Nusrat Jahan','nusrat@anwargroup.demo','employee','11111111-1111-1111-1111-111111111102','44444444-4444-4444-4444-444444444401',true),
 ('44444444-4444-4444-4444-444444444403','Imran Hossain','imran@anwargroup.demo','employee','11111111-1111-1111-1111-111111111103','44444444-4444-4444-4444-444444444401',true),
 ('44444444-4444-4444-4444-444444444404','Farhana Akter','farhana@anwargroup.demo','employee','11111111-1111-1111-1111-111111111104','44444444-4444-4444-4444-444444444401',true),
 ('44444444-4444-4444-4444-444444444405','Rezaul Karim','rezaul@anwargroup.demo','employee','11111111-1111-1111-1111-111111111105','44444444-4444-4444-4444-444444444401',true);
