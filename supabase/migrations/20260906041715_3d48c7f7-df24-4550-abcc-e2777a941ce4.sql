CREATE TABLE IF NOT EXISTS public.business_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id uuid NOT NULL REFERENCES public.business_units(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'ongoing' CHECK (status IN ('ongoing','completed','on_hold')),
  unit text NOT NULL DEFAULT 'BDT',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name text NOT NULL,
  designation text,
  kpi_weight_percent numeric NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS public.project_targets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  target_date date NOT NULL,
  target_value numeric NOT NULL,
  UNIQUE (project_id, target_date)
);
CREATE TABLE IF NOT EXISTS public.project_employee_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  member_id uuid NOT NULL REFERENCES public.project_members(id) ON DELETE CASCADE,
  entry_date date NOT NULL,
  actual_value numeric NOT NULL DEFAULT 0,
  report_note text,
  kpi_weight_percent numeric NOT NULL DEFAULT 10,
  kpi_score numeric,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_pee_project_date ON public.project_employee_entries(project_id, entry_date);
CREATE TABLE IF NOT EXISTS public.project_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_employee_entry_id uuid NOT NULL REFERENCES public.project_employee_entries(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_url text NOT NULL,
  file_hash text NOT NULL,
  file_size integer,
  uploaded_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.business_units, public.projects, public.project_members, public.project_targets, public.project_employee_entries, public.project_evidence TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.projects, public.project_members, public.project_targets, public.project_employee_entries, public.project_evidence TO authenticated;
GRANT ALL ON public.business_units, public.projects, public.project_members, public.project_targets, public.project_employee_entries, public.project_evidence TO service_role;

ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_targets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_employee_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_evidence ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['business_units','projects','project_members','project_targets','project_employee_entries','project_evidence'] LOOP
    EXECUTE format('CREATE POLICY "Management can read %1$s" ON public.%1$I FOR SELECT TO authenticated USING (private.my_role() IN (''manager'',''hr_admin'',''executive''))', t);
    IF t <> 'business_units' THEN
      EXECUTE format('CREATE POLICY "Management can write %1$s" ON public.%1$I FOR ALL TO authenticated USING (private.my_role() IN (''manager'',''hr_admin'')) WITH CHECK (private.my_role() IN (''manager'',''hr_admin''))', t);
    END IF;
  END LOOP;
END $$;