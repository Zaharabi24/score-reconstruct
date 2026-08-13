
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $audit$
DECLARE _emp UUID;
BEGIN
  IF TG_TABLE_NAME = 'kpi_definitions' THEN
    _emp := NEW.employee_id;
  ELSE
    SELECT k.employee_id INTO _emp FROM public.kpi_definitions k WHERE k.id = NEW.kpi_definition_id;
  END IF;

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, before_value, after_value, employee_id)
  VALUES (
    TG_TABLE_NAME, NEW.id, lower(TG_OP), auth.uid(), private.my_role(),
    CASE WHEN TG_OP = 'UPDATE' THEN to_jsonb(OLD) ELSE NULL END,
    to_jsonb(NEW), _emp
  );
  RETURN NEW;
END; $audit$;

REVOKE ALL ON FUNCTION public.audit_row() FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.reset_demo_data()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $fn$
DECLARE
  d_bd   uuid := '22222222-2222-4222-8222-222222222201';
  d_ops  uuid := '22222222-2222-4222-8222-222222222202';
  d_cs   uuid := '22222222-2222-4222-8222-222222222203';
  d_sales uuid := '22222222-2222-4222-8222-222222222204';
  e_rafi   uuid := '11111111-1111-4111-8111-111111111101';
  e_nasrin uuid := '11111111-1111-4111-8111-111111111102';
  e_hr     uuid := '11111111-1111-4111-8111-111111111103';
  e_kamal  uuid := '11111111-1111-4111-8111-111111111104';
  e_tania  uuid := '11111111-1111-4111-8111-111111111105';
  e_shuvo  uuid := '11111111-1111-4111-8111-111111111106';
  e_mahin  uuid := '11111111-1111-4111-8111-111111111107';
  r_collab uuid := '33333333-3333-4333-8333-333333333301';
  p_start date := date_trunc('quarter', CURRENT_DATE)::date;
  p_end   date := (date_trunc('quarter', CURRENT_DATE) + interval '3 months - 1 day')::date;
  q_start date := (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date;
  q_end   date := (date_trunc('quarter', CURRENT_DATE) - interval '1 day')::date;
  demo_emps uuid[];
  demo_kpis uuid[];
BEGIN
  demo_emps := ARRAY[e_rafi,e_nasrin,e_hr,e_kamal,e_tania,e_shuvo,e_mahin];

  -- wipe previous demo data (children first)
  SELECT COALESCE(array_agg(id), ARRAY[]::uuid[]) INTO demo_kpis
    FROM public.kpi_definitions WHERE employee_id = ANY(demo_emps);
  DELETE FROM public.evidence WHERE actual_entry_id IN
    (SELECT id FROM public.actual_entries WHERE kpi_definition_id = ANY(demo_kpis));
  DELETE FROM public.actual_entries WHERE kpi_definition_id = ANY(demo_kpis);
  DELETE FROM public.score_records WHERE kpi_definition_id = ANY(demo_kpis);
  DELETE FROM public.audit_log WHERE employee_id = ANY(demo_emps) OR entity_id = ANY(demo_kpis);
  DELETE FROM public.kpi_definitions WHERE employee_id = ANY(demo_emps);
  DELETE FROM public.employees WHERE id = ANY(demo_emps);

  -- departments
  INSERT INTO public.departments (id, name) VALUES
    (d_bd,'Business Development'), (d_ops,'Operations'),
    (d_cs,'Customer Service'), (d_sales,'Sales')
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name;

  -- rubric + org policy
  INSERT INTO public.rubrics (id, name, levels) VALUES (r_collab, 'Collaboration rubric (1-5)', '[
    {"level":1,"label":"Rarely collaborates","score":20},
    {"level":2,"label":"Occasionally supports peers","score":45},
    {"level":3,"label":"Reliable team contributor","score":70},
    {"level":4,"label":"Actively enables other teams","score":95},
    {"level":5,"label":"Sets the collaboration standard","score":120}]'::jsonb)
  ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, levels = EXCLUDED.levels;

  INSERT INTO public.scoring_policy (department_id, achievement_floor, achievement_cap, adjustment_escalation_threshold)
  SELECT NULL, 70, 120, 10
  WHERE NOT EXISTS (SELECT 1 FROM public.scoring_policy WHERE department_id IS NULL);

  -- people
  INSERT INTO public.employees (id, name, email, role, department_id, manager_id, is_demo) VALUES
    (e_nasrin,'Nasrin Islam','manager@anwarkpiflow.demo','manager',d_bd,NULL,true),
    (e_hr,'HR Admin','hradmin@anwarkpiflow.demo','hr_admin',d_bd,NULL,true),
    (e_kamal,'Kamal Hasan','executive@anwarkpiflow.demo','executive',d_bd,NULL,true),
    (e_rafi,'Rafi Ahmed','employee@anwarkpiflow.demo','employee',d_bd,e_nasrin,true),
    (e_tania,'Tania Karim','tania@anwarkpiflow.demo','employee',d_ops,e_nasrin,true),
    (e_shuvo,'Shuvo Rahman','shuvo@anwarkpiflow.demo','employee',d_cs,e_nasrin,true),
    (e_mahin,'Mahin Chowdhury','mahin@anwarkpiflow.demo','employee',d_sales,e_nasrin,true);

  -- KPI definitions
  INSERT INTO public.kpi_definitions
    (id, employee_id, department_id, name, description, kpi_type, target_value, unit, weight_percent,
     period_start, period_end, perspective, reviewer_id, approver_id, rubric_id, status, created_by, created_at)
  VALUES
   ('44444444-4444-4444-8444-444444444401',e_rafi,d_bd,'Monthly Sales','Closed-won revenue booked in the period.','higher_is_better',10000000,'BDT',30,p_start,p_end,'financial',e_nasrin,e_kamal,NULL,'active',e_hr,now()-interval '21 days'),
   ('44444444-4444-4444-8444-444444444402',e_rafi,d_bd,'New Client Acquisitions','Net new logos signed in the period.','higher_is_better',12,'clients',25,p_start,p_end,'customer',e_nasrin,e_kamal,NULL,'submitted',e_hr,now()-interval '21 days'),
   ('44444444-4444-4444-8444-444444444403',e_rafi,d_bd,'Client Complaint Rate','Complaints per 100 active accounts.','lower_is_better',5,'per 100',20,p_start,p_end,'customer',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '21 days'),
   ('44444444-4444-4444-8444-444444444404',e_rafi,d_bd,'Team Collaboration Rating','Rubric-assessed cross-team collaboration.','qualitative',NULL,NULL,25,p_start,p_end,'people',e_nasrin,e_kamal,r_collab,'returned',e_hr,now()-interval '21 days'),
   ('44444444-4444-4444-8444-444444444405',e_tania,d_ops,'On-time Delivery Rate','Shipments delivered on the committed date.','higher_is_better',95,'%',35,p_start,p_end,'operational',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '20 days'),
   ('44444444-4444-4444-8444-444444444406',e_tania,d_ops,'Warehouse Cost per Unit','Fully loaded handling cost per unit shipped.','lower_is_better',120,'BDT',25,p_start,p_end,'operational',e_nasrin,e_kamal,NULL,'pending_target_approval',e_hr,now()-interval '2 days'),
   ('44444444-4444-4444-8444-444444444407',e_shuvo,d_cs,'First Call Resolution','Tickets resolved on first contact.','higher_is_better',85,'%',30,p_start,p_end,'customer',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '20 days'),
   ('44444444-4444-4444-8444-444444444408',e_mahin,d_sales,'Quarterly Revenue Target','Revenue recognised for the quarter.','higher_is_better',25000000,'BDT',40,p_start,p_end,'financial',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '20 days'),
   ('44444444-4444-4444-8444-444444444409',e_nasrin,d_bd,'Team KPI Cycle Completion','Team evaluations completed on schedule.','higher_is_better',100,'%',30,p_start,p_end,'people',e_kamal,e_kamal,NULL,'approved',e_hr,now()-interval '19 days'),
   ('44444444-4444-4444-8444-444444444410',e_hr,d_bd,'Evaluation Cycle On-time Closure','Org-wide cycle closed within the calendar.','higher_is_better',100,'%',25,p_start,p_end,'operational',e_kamal,e_kamal,NULL,'approved',e_hr,now()-interval '19 days'),
   ('44444444-4444-4444-8444-444444444411',e_kamal,d_bd,'Org Score Coverage','Share of eligible staff with an approved score.','higher_is_better',100,'%',20,p_start,p_end,'operational',e_hr,e_hr,NULL,'approved',e_hr,now()-interval '19 days'),
   ('44444444-4444-4444-8444-444444444412',e_shuvo,d_cs,'First Call Resolution','Tickets resolved on first contact.','higher_is_better',85,'%',30,q_start,q_end,'customer',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '110 days'),
   ('44444444-4444-4444-8444-444444444413',e_mahin,d_sales,'Quarterly Revenue Target','Revenue recognised for the quarter.','higher_is_better',25000000,'BDT',40,q_start,q_end,'financial',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '110 days'),
   ('44444444-4444-4444-8444-444444444414',e_rafi,d_bd,'New Client Acquisitions','Net new logos signed in the period.','higher_is_better',12,'clients',25,q_start,q_end,'customer',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '110 days'),
   ('44444444-4444-4444-8444-444444444415',e_tania,d_ops,'On-time Delivery Rate','Shipments delivered on the committed date.','higher_is_better',95,'%',35,q_start,q_end,'operational',e_nasrin,e_kamal,NULL,'approved',e_hr,now()-interval '110 days');

  -- reported actuals
  INSERT INTO public.actual_entries
    (id, kpi_definition_id, actual_value, rubric_level, data_source_type, reporting_date, comments, entered_by, entered_at)
  VALUES
   ('55555555-5555-4555-8555-555555555502','44444444-4444-4444-8444-444444444402',10,NULL,'verified_manual',CURRENT_DATE-7,'Ten signed contracts; two more in legal review.',e_rafi,now()-interval '7 days'),
   ('55555555-5555-4555-8555-555555555503','44444444-4444-4444-8444-444444444403',3,NULL,'system_verified',CURRENT_DATE-12,'Pulled from the CRM complaints register.',e_rafi,now()-interval '12 days'),
   ('55555555-5555-4555-8555-555555555504','44444444-4444-4444-8444-444444444404',NULL,3,'verified_manual',CURRENT_DATE-9,'Self-assessment at rubric level 3.',e_rafi,now()-interval '9 days'),
   ('55555555-5555-4555-8555-555555555505','44444444-4444-4444-8444-444444444405',91,NULL,'system_verified',CURRENT_DATE-11,'WMS delivery report.',e_tania,now()-interval '11 days'),
   ('55555555-5555-4555-8555-555555555507','44444444-4444-4444-8444-444444444407',70,NULL,'verified_manual',CURRENT_DATE-13,'Helpdesk export; two outage days excluded.',e_shuvo,now()-interval '13 days'),
   ('55555555-5555-4555-8555-555555555508','44444444-4444-4444-8444-444444444408',19500000,NULL,'system_verified',CURRENT_DATE-10,'ERP revenue ledger.',e_mahin,now()-interval '10 days'),
   ('55555555-5555-4555-8555-555555555509','44444444-4444-4444-8444-444444444409',96,NULL,'verified_manual',CURRENT_DATE-8,'Two evaluations closed after the deadline.',e_nasrin,now()-interval '8 days'),
   ('55555555-5555-4555-8555-555555555510','44444444-4444-4444-8444-444444444410',98,NULL,'verified_manual',CURRENT_DATE-8,'Cycle closed one day late for Sales.',e_hr,now()-interval '8 days'),
   ('55555555-5555-4555-8555-555555555511','44444444-4444-4444-8444-444444444411',90,NULL,'system_verified',CURRENT_DATE-8,'Coverage report from KPIFlow.',e_kamal,now()-interval '8 days'),
   ('55555555-5555-4555-8555-555555555512','44444444-4444-4444-8444-444444444412',74,NULL,'verified_manual',CURRENT_DATE-100,'Previous quarter helpdesk export.',e_shuvo,now()-interval '100 days'),
   ('55555555-5555-4555-8555-555555555513','44444444-4444-4444-8444-444444444413',18000000,NULL,'system_verified',CURRENT_DATE-100,'Previous quarter ERP ledger.',e_mahin,now()-interval '100 days'),
   ('55555555-5555-4555-8555-555555555514','44444444-4444-4444-8444-444444444414',9,NULL,'verified_manual',CURRENT_DATE-100,'Nine logos signed last quarter.',e_rafi,now()-interval '100 days'),
   ('55555555-5555-4555-8555-555555555515','44444444-4444-4444-8444-444444444415',89,NULL,'system_verified',CURRENT_DATE-100,'Previous quarter WMS report.',e_tania,now()-interval '100 days');

  -- evidence
  INSERT INTO public.evidence (id, actual_entry_id, file_url, file_name, file_hash, file_size, uploaded_by, uploaded_at, description)
  VALUES
   ('66666666-6666-4666-8666-666666666602','55555555-5555-4555-8555-555555555502','11111111-1111-4111-8111-111111111101/44444444-4444-4444-8444-444444444402/signed-contracts.pdf','signed-contracts-q.pdf',encode(digest('signed-contracts-q.pdf','sha256'),'hex'),284137,e_rafi,now()-interval '7 days','Scanned counter-signed contracts'),
   ('66666666-6666-4666-8666-666666666603','55555555-5555-4555-8555-555555555503','11111111-1111-4111-8111-111111111101/44444444-4444-4444-8444-444444444403/complaint-register.csv','complaint-register.csv',encode(digest('complaint-register.csv','sha256'),'hex'),18422,e_rafi,now()-interval '12 days','CRM complaint export'),
   ('66666666-6666-4666-8666-666666666604','55555555-5555-4555-8555-555555555504','11111111-1111-4111-8111-111111111101/44444444-4444-4444-8444-444444444404/collaboration-notes.pdf','collaboration-notes.pdf',encode(digest('collaboration-notes.pdf','sha256'),'hex'),64210,e_rafi,now()-interval '9 days','Peer feedback summary'),
   ('66666666-6666-4666-8666-666666666605','55555555-5555-4555-8555-555555555505','11111111-1111-4111-8111-111111111105/44444444-4444-4444-8444-444444444405/wms-delivery-report.xlsx','wms-delivery-report.xlsx',encode(digest('wms-delivery-report.xlsx','sha256'),'hex'),98314,e_tania,now()-interval '11 days','WMS on-time delivery export'),
   ('66666666-6666-4666-8666-666666666607','55555555-5555-4555-8555-555555555507','11111111-1111-4111-8111-111111111106/44444444-4444-4444-8444-444444444407/helpdesk-fcr.csv','helpdesk-fcr.csv',encode(digest('helpdesk-fcr.csv','sha256'),'hex'),40219,e_shuvo,now()-interval '13 days','Helpdesk first-call-resolution export'),
   ('66666666-6666-4666-8666-666666666608','55555555-5555-4555-8555-555555555508','11111111-1111-4111-8111-111111111107/44444444-4444-4444-8444-444444444408/erp-revenue-ledger.pdf','erp-revenue-ledger.pdf',encode(digest('erp-revenue-ledger.pdf','sha256'),'hex'),210884,e_mahin,now()-interval '10 days','ERP revenue ledger extract'),
   ('66666666-6666-4666-8666-666666666609','55555555-5555-4555-8555-555555555509','11111111-1111-4111-8111-111111111102/44444444-4444-4444-8444-444444444409/cycle-completion.pdf','cycle-completion.pdf',encode(digest('cycle-completion.pdf','sha256'),'hex'),51220,e_nasrin,now()-interval '8 days','Cycle completion tracker'),
   ('66666666-6666-4666-8666-666666666610','55555555-5555-4555-8555-555555555510','11111111-1111-4111-8111-111111111103/44444444-4444-4444-8444-444444444410/cycle-closure.pdf','cycle-closure.pdf',encode(digest('cycle-closure.pdf','sha256'),'hex'),44190,e_hr,now()-interval '8 days','Closure sign-off sheet'),
   ('66666666-6666-4666-8666-666666666611','55555555-5555-4555-8555-555555555511','11111111-1111-4111-8111-111111111104/44444444-4444-4444-8444-444444444411/coverage-report.pdf','coverage-report.pdf',encode(digest('coverage-report.pdf','sha256'),'hex'),33902,e_kamal,now()-interval '8 days','Score coverage report'),
   ('66666666-6666-4666-8666-666666666612','55555555-5555-4555-8555-555555555512','11111111-1111-4111-8111-111111111106/44444444-4444-4444-8444-444444444412/helpdesk-fcr-prev.csv','helpdesk-fcr-prev.csv',encode(digest('helpdesk-fcr-prev.csv','sha256'),'hex'),39110,e_shuvo,now()-interval '100 days','Previous quarter helpdesk export'),
   ('66666666-6666-4666-8666-666666666613','55555555-5555-4555-8555-555555555513','11111111-1111-4111-8111-111111111107/44444444-4444-4444-8444-444444444413/erp-revenue-prev.pdf','erp-revenue-prev.pdf',encode(digest('erp-revenue-prev.pdf','sha256'),'hex'),198220,e_mahin,now()-interval '100 days','Previous quarter ERP ledger'),
   ('66666666-6666-4666-8666-666666666614','55555555-5555-4555-8555-555555555514','11111111-1111-4111-8111-111111111101/44444444-4444-4444-8444-444444444414/signed-contracts-prev.pdf','signed-contracts-prev.pdf',encode(digest('signed-contracts-prev.pdf','sha256'),'hex'),176430,e_rafi,now()-interval '100 days','Previous quarter contracts'),
   ('66666666-6666-4666-8666-666666666615','55555555-5555-4555-8555-555555555515','11111111-1111-4111-8111-111111111105/44444444-4444-4444-8444-444444444415/wms-delivery-prev.xlsx','wms-delivery-prev.xlsx',encode(digest('wms-delivery-prev.xlsx','sha256'),'hex'),88120,e_tania,now()-interval '100 days','Previous quarter WMS export');

  -- versioned score records
  INSERT INTO public.score_records
    (id, kpi_definition_id, version_number, calculated_score, achievement_percent, adjustment_delta,
     adjustment_reason_code, adjustment_justification, final_score, calculation_trace,
     reviewed_by, reviewed_at, approved_by, approved_at, created_at)
  VALUES
   ('77777777-7777-4777-8777-777777777702','44444444-4444-4444-8444-444444444402',1,44.43,83.33,0,NULL,NULL,NULL,
     '{"formula":"(actual 10 / target 12) * 100","achievement_percent":83.33,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":44.43}'::jsonb,
     NULL,NULL,NULL,NULL,now()-interval '7 days'),
   ('77777777-7777-4777-8777-777777777703','44444444-4444-4444-8444-444444444403',1,120,140,0,NULL,NULL,120,
     '{"formula":"max((2 - (actual 3 / target 5)) * 100, 0)","achievement_percent":140,"curve":"capped at 120","system_score":120}'::jsonb,
     e_nasrin,now()-interval '11 days',e_nasrin,now()-interval '11 days',now()-interval '12 days'),
   ('77777777-7777-4777-8777-777777777704','44444444-4444-4444-8444-444444444404',1,70,NULL,0,NULL,NULL,NULL,
     '{"formula":"rubric_level_to_score_map[level]","rubric_level":3,"system_score":70}'::jsonb,
     NULL,NULL,NULL,NULL,now()-interval '9 days'),
   ('77777777-7777-4777-8777-777777777705','44444444-4444-4444-8444-444444444405',1,85.97,95.79,0,NULL,NULL,85.97,
     '{"formula":"(actual 91 / target 95) * 100","achievement_percent":95.79,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":85.97}'::jsonb,
     e_nasrin,now()-interval '9 days',e_nasrin,now()-interval '9 days',now()-interval '11 days'),
   ('77777777-7777-4777-8777-777777777707','44444444-4444-4444-8444-444444444407',1,41.17,82.35,10,'external_dependency','External market factor: two carrier outage days inflated repeat contacts beyond the team''s control.',51.17,
     '{"formula":"(actual 70 / target 85) * 100","achievement_percent":82.35,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":41.17}'::jsonb,
     e_nasrin,now()-interval '9 days',e_nasrin,now()-interval '9 days',now()-interval '13 days'),
   ('77777777-7777-4777-8777-777777777708','44444444-4444-4444-8444-444444444408',1,26.67,78,0,NULL,NULL,26.67,
     '{"formula":"(actual 19500000 / target 25000000) * 100","achievement_percent":78,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":26.67}'::jsonb,
     e_nasrin,now()-interval '8 days',e_nasrin,now()-interval '8 days',now()-interval '10 days'),
   ('77777777-7777-4777-8777-777777777709','44444444-4444-4444-8444-444444444409',1,86.67,96,0,NULL,NULL,86.67,
     '{"formula":"(actual 96 / target 100) * 100","achievement_percent":96,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":86.67}'::jsonb,
     e_kamal,now()-interval '6 days',e_kamal,now()-interval '6 days',now()-interval '8 days'),
   ('77777777-7777-4777-8777-777777777710','44444444-4444-4444-8444-444444444410',1,93.33,98,0,NULL,NULL,93.33,
     '{"formula":"(actual 98 / target 100) * 100","achievement_percent":98,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":93.33}'::jsonb,
     e_kamal,now()-interval '6 days',e_kamal,now()-interval '6 days',now()-interval '8 days'),
   ('77777777-7777-4777-8777-777777777711','44444444-4444-4444-8444-444444444411',1,66.67,90,0,NULL,NULL,66.67,
     '{"formula":"(actual 90 / target 100) * 100","achievement_percent":90,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":66.67}'::jsonb,
     e_hr,now()-interval '6 days',e_hr,now()-interval '6 days',now()-interval '8 days'),
   ('77777777-7777-4777-8777-777777777712','44444444-4444-4444-8444-444444444412',1,56.87,87.06,0,NULL,NULL,56.87,
     '{"formula":"(actual 74 / target 85) * 100","achievement_percent":87.06,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":56.87}'::jsonb,
     e_nasrin,now()-interval '96 days',e_nasrin,now()-interval '96 days',now()-interval '100 days'),
   ('77777777-7777-4777-8777-777777777713','44444444-4444-4444-8444-444444444413',1,6.67,72,0,NULL,NULL,6.67,
     '{"formula":"(actual 18000000 / target 25000000) * 100","achievement_percent":72,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":6.67}'::jsonb,
     e_nasrin,now()-interval '96 days',e_nasrin,now()-interval '96 days',now()-interval '100 days'),
   ('77777777-7777-4777-8777-777777777714','44444444-4444-4444-8444-444444444414',1,16.67,75,0,NULL,NULL,16.67,
     '{"formula":"(actual 9 / target 12) * 100","achievement_percent":75,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":16.67}'::jsonb,
     e_nasrin,now()-interval '96 days',e_nasrin,now()-interval '96 days',now()-interval '100 days'),
   ('77777777-7777-4777-8777-777777777715','44444444-4444-4444-8444-444444444415',1,78.93,93.68,0,NULL,NULL,78.93,
     '{"formula":"(actual 89 / target 95) * 100","achievement_percent":93.68,"curve":"linear 70%-100% achievement mapped to score 0-100","system_score":78.93}'::jsonb,
     e_nasrin,now()-interval '96 days',e_nasrin,now()-interval '96 days',now()-interval '100 days');

  -- remove trigger-generated audit noise from the seed inserts, then write a realistic history
  DELETE FROM public.audit_log WHERE entity_id = ANY(ARRAY(SELECT id FROM public.kpi_definitions WHERE employee_id = ANY(demo_emps)))
     OR entity_id = ANY(ARRAY(SELECT id FROM public.score_records WHERE kpi_definition_id IN (SELECT id FROM public.kpi_definitions WHERE employee_id = ANY(demo_emps))))
     OR entity_id = ANY(ARRAY(SELECT id FROM public.actual_entries WHERE kpi_definition_id IN (SELECT id FROM public.kpi_definitions WHERE employee_id = ANY(demo_emps))));

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", after_value, reason, employee_id)
  SELECT 'kpi_definitions', k.id, 'kpi_created', e_hr, 'hr_admin', k.created_at,
         jsonb_build_object('name',k.name,'target_value',k.target_value,'weight_percent',k.weight_percent,'status','pending_target_approval'),
         'KPI routed for target approval', k.employee_id
  FROM public.kpi_definitions k WHERE k.employee_id = ANY(demo_emps);

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", before_value, after_value, reason, employee_id)
  SELECT 'kpi_definitions', k.id, 'target_approved', k.reviewer_id, 'manager', k.created_at + interval '1 day',
         jsonb_build_object('status','pending_target_approval'), jsonb_build_object('status','active'),
         'Target approved by reviewer', k.employee_id
  FROM public.kpi_definitions k
  WHERE k.employee_id = ANY(demo_emps) AND k.status <> 'pending_target_approval';

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", after_value, reason, employee_id)
  SELECT 'actual_entries', a.id, 'actual_submitted', a.entered_by, 'employee', a.entered_at,
         jsonb_build_object('actual_value',a.actual_value,'rubric_level',a.rubric_level,'data_source_type',a.data_source_type),
         COALESCE(a.comments,'Actual reported with evidence'), k.employee_id
  FROM public.actual_entries a JOIN public.kpi_definitions k ON k.id = a.kpi_definition_id
  WHERE k.employee_id = ANY(demo_emps);

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", after_value, reason, employee_id)
  SELECT 'evidence', ev.id, 'evidence_uploaded', ev.uploaded_by, 'employee', ev.uploaded_at,
         jsonb_build_object('file_name',ev.file_name,'file_hash',ev.file_hash,'file_size',ev.file_size),
         'Evidence hashed at upload', k.employee_id
  FROM public.evidence ev
  JOIN public.actual_entries a ON a.id = ev.actual_entry_id
  JOIN public.kpi_definitions k ON k.id = a.kpi_definition_id
  WHERE k.employee_id = ANY(demo_emps);

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", after_value, reason, employee_id)
  SELECT 'score_records', s.id, 'score_calculated', NULL, 'system', s.created_at,
         jsonb_build_object('calculated_score',s.calculated_score,'achievement_percent',s.achievement_percent,'trace',s.calculation_trace),
         'Server-side scoring engine', k.employee_id
  FROM public.score_records s JOIN public.kpi_definitions k ON k.id = s.kpi_definition_id
  WHERE k.employee_id = ANY(demo_emps);

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", before_value, after_value, reason, employee_id)
  SELECT 'kpi_definitions', k.id,
         CASE WHEN s.adjustment_delta <> 0 THEN 'approved_with_adjustment' ELSE 'approved_as_calculated' END,
         s.approved_by, 'manager', s.approved_at,
         jsonb_build_object('status','submitted','calculated_score',s.calculated_score),
         jsonb_build_object('status','approved','final_score',s.final_score,'adjustment_delta',s.adjustment_delta),
         COALESCE(s.adjustment_justification,'Approved as calculated'), k.employee_id
  FROM public.score_records s JOIN public.kpi_definitions k ON k.id = s.kpi_definition_id
  WHERE k.employee_id = ANY(demo_emps) AND s.final_score IS NOT NULL;

  INSERT INTO public.audit_log (entity_type, entity_id, action, actor_id, actor_role, "timestamp", before_value, after_value, reason, employee_id)
  VALUES ('kpi_definitions','44444444-4444-4444-8444-444444444404','returned_for_clarification',e_nasrin,'manager',now()-interval '5 days',
          jsonb_build_object('status','submitted'), jsonb_build_object('status','returned'),
          'Please attach the peer feedback for the two cross-department projects before this rating can be scored.', e_rafi),
         ('kpi_definitions','44444444-4444-4444-8444-444444444402','submitted_for_review',e_rafi,'employee',now()-interval '7 days',
          jsonb_build_object('status','active'), jsonb_build_object('status','submitted'),
          'Actual submitted with supporting evidence', e_rafi);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reset_demo_data() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reset_demo_data() TO service_role;

SELECT public.reset_demo_data();
