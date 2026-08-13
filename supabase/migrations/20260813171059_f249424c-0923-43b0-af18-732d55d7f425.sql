
ALTER TABLE public.employees ADD COLUMN IF NOT EXISTS designation text;

CREATE OR REPLACE FUNCTION public.seed_department_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  d_sales uuid;
  mgr uuid := '11111111-1111-4111-8111-111111111102';
  exec_id uuid := '11111111-1111-4111-8111-111111111104';
  e_rafi uuid := '11111111-1111-4111-8111-111111111101';
  e_tania uuid := '11111111-1111-4111-8111-111111111105';
  e_shuvo uuid := '11111111-1111-4111-8111-111111111106';
  e_mahin uuid := '11111111-1111-4111-8111-111111111107';
  e_sadia uuid := '11111111-1111-4111-8111-111111111108';
  p_start date := '2026-07-01';
  p_end date := '2026-09-30';
  r record;
BEGIN
  SELECT id INTO d_sales FROM public.departments WHERE name = 'Sales' ORDER BY created_at LIMIT 1;
  IF d_sales IS NULL THEN
    INSERT INTO public.departments (name) VALUES ('Sales') RETURNING id INTO d_sales;
  END IF;

  -- New team member
  INSERT INTO public.employees (id, name, email, role, department_id, manager_id, is_demo)
  VALUES (e_sadia, 'Sadia Noor', 'sadia@anwarkpiflow.demo', 'employee', d_sales, mgr, true)
  ON CONFLICT (id) DO NOTHING;

  -- Department scoping: the lead and five reports all sit in Sales
  UPDATE public.employees SET department_id = d_sales, designation = 'Department / Team Lead' WHERE id = mgr;
  UPDATE public.employees SET department_id = d_sales, manager_id = mgr, designation = 'Sales Executive' WHERE id = e_rafi;
  UPDATE public.employees SET department_id = d_sales, manager_id = mgr, designation = 'Field Coordinator' WHERE id = e_tania;
  UPDATE public.employees SET department_id = d_sales, manager_id = mgr, designation = 'Client Relations Officer' WHERE id = e_shuvo;
  UPDATE public.employees SET department_id = d_sales, manager_id = mgr, designation = 'Sales Associate' WHERE id = e_mahin;
  UPDATE public.employees SET department_id = d_sales, manager_id = mgr, designation = 'Account Manager' WHERE id = e_sadia;
  UPDATE public.employees SET designation = COALESCE(designation, 'Team Member') WHERE designation IS NULL;

  -- Keep existing KPI rows aligned to the department
  UPDATE public.kpi_definitions k SET department_id = d_sales
  WHERE k.employee_id IN (e_rafi, e_tania, e_shuvo, e_mahin, e_sadia, mgr);

  -- Fresh submission requests for the active period
  DELETE FROM public.kpi_definitions WHERE id::text LIKE '55555555-%';

  INSERT INTO public.kpi_definitions
    (id, employee_id, department_id, name, description, kpi_type, target_value, unit, weight_percent,
     period_start, period_end, perspective, reviewer_id, approver_id, status, milestones, created_by)
  VALUES
    ('55555555-5555-4555-8555-555555555501', e_rafi, d_sales, 'Upsell Revenue', 'Incremental revenue from existing accounts.', 'higher_is_better', 500000, 'BDT', 15, p_start, p_end, 'financial', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555502', e_rafi, d_sales, 'Proposal Turnaround Days', 'Average days to send a client proposal.', 'lower_is_better', 5, 'days', 10, p_start, p_end, 'operational', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555503', e_shuvo, d_sales, 'Customer Satisfaction Rating', 'Qualitative rubric assessment by client feedback.', 'qualitative', NULL, NULL, 15, p_start, p_end, 'customer', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555504', e_shuvo, d_sales, 'Escalation Rate', 'Escalations per 100 handled cases.', 'lower_is_better', 3, 'per 100', 10, p_start, p_end, 'customer', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555505', e_tania, d_sales, 'Territory Expansion Milestones', 'Staged rollout of new territory coverage.', 'milestone', NULL, NULL, 15, p_start, p_end, 'operational', mgr, exec_id, 'submitted',
      '[{"label":"Territory mapping","weight":30,"completed":true},{"label":"Partner onboarding","weight":50,"completed":true},{"label":"Full route launch","weight":20,"completed":false}]'::jsonb, mgr),
    ('55555555-5555-4555-8555-555555555506', e_mahin, d_sales, 'New Retail Outlets', 'Outlets activated this period.', 'higher_is_better', 20, 'outlets', 15, p_start, p_end, 'financial', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555507', e_sadia, d_sales, 'Account Renewal Rate', 'Share of accounts renewed on time.', 'higher_is_better', 90, '%', 15, p_start, p_end, 'customer', mgr, exec_id, 'returned', NULL, mgr),
    ('55555555-5555-4555-8555-555555555508', e_sadia, d_sales, 'Key Account Growth', 'Growth in key account value.', 'higher_is_better', 15, '%', 10, p_start, p_end, 'financial', mgr, exec_id, 'submitted', NULL, mgr),
    ('55555555-5555-4555-8555-555555555509', e_tania, d_sales, 'Route Coverage', 'Planned routes covered this period.', 'higher_is_better', 100, '%', 10, p_start, p_end, 'operational', mgr, exec_id, 'active', NULL, mgr);

  -- Actuals for everything except the untouched "awaiting actual" KPI
  INSERT INTO public.actual_entries (kpi_definition_id, actual_value, rubric_level, data_source_type, reporting_date, comments, entered_by)
  VALUES
    ('55555555-5555-4555-8555-555555555501', 610000, NULL, 'verified_manual', p_start + 60, 'Closed two large upsells in the final month.', e_rafi),
    ('55555555-5555-4555-8555-555555555502', 4, NULL, 'system_verified', p_start + 60, 'CRM timestamps averaged across 34 proposals.', e_rafi),
    ('55555555-5555-4555-8555-555555555503', NULL, 4, 'verified_manual', p_start + 58, 'Client survey scores attached.', e_shuvo),
    ('55555555-5555-4555-8555-555555555504', 5, NULL, 'system_verified', p_start + 58, 'Two supply issues drove escalations up.', e_shuvo),
    ('55555555-5555-4555-8555-555555555505', NULL, NULL, 'verified_manual', p_start + 55, 'Two of three milestones signed off.', e_tania),
    ('55555555-5555-4555-8555-555555555506', 17, NULL, 'verified_manual', p_start + 57, 'Three outlets slipped to next period.', e_mahin),
    ('55555555-5555-4555-8555-555555555507', 88, NULL, 'verified_manual', p_start + 50, 'Renewal file attached.', e_sadia),
    ('55555555-5555-4555-8555-555555555508', 17, NULL, 'verified_manual', p_start + 56, 'Two accounts upgraded tier.', e_sadia);

  -- Calculated (not yet final) scores, matching the server scoring curve (floor 70, cap 120)
  FOR r IN
    SELECT * FROM (VALUES
      ('55555555-5555-4555-8555-555555555501'::uuid, 122.00::numeric, 120.00::numeric, '(actual 610000 / target 500000) * 100'),
      ('55555555-5555-4555-8555-555555555502'::uuid, 120.00, 120.00, 'max((2 - (actual 4 / target 5)) * 100, 0)'),
      ('55555555-5555-4555-8555-555555555503'::uuid, NULL, 95.00, 'rubric_level_to_score_map[4]'),
      ('55555555-5555-4555-8555-555555555504'::uuid, 33.33, 0.00, 'max((2 - (actual 5 / target 3)) * 100, 0)'),
      ('55555555-5555-4555-8555-555555555505'::uuid, 80.00, 33.33, 'sum(weight of completed milestones) = 80'),
      ('55555555-5555-4555-8555-555555555506'::uuid, 85.00, 50.00, '(actual 17 / target 20) * 100'),
      ('55555555-5555-4555-8555-555555555507'::uuid, 97.78, 92.60, '(actual 88 / target 90) * 100'),
      ('55555555-5555-4555-8555-555555555508'::uuid, 113.33, 113.33, '(actual 17 / target 15) * 100')
    ) AS v(kid, ach, score, formula)
  LOOP
    INSERT INTO public.score_records (kpi_definition_id, version_number, calculated_score, achievement_percent, final_score, calculation_trace)
    VALUES (r.kid, 1, r.score, r.ach, NULL,
      jsonb_build_object('formula', r.formula, 'achievement_percent', r.ach, 'curve',
        CASE WHEN r.ach IS NULL THEN 'rubric map' WHEN r.ach > 120 THEN 'capped at 120' ELSE 'linear 70%-100% achievement mapped to score 0-100' END,
        'system_score', r.score, 'computed_by', 'server:calculate-score'));
  END LOOP;
END;
$fn$;

ALTER FUNCTION public.reset_demo_data() RENAME TO reset_demo_data_base;

CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $r$
BEGIN
  PERFORM public.reset_demo_data_base();
  PERFORM public.seed_department_demo();
END;
$r$;

REVOKE ALL ON FUNCTION public.seed_department_demo() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data() FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_demo_data_base() FROM anon, authenticated;

SELECT public.seed_department_demo();
