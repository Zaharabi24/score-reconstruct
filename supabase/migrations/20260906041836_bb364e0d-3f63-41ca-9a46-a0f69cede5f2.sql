CREATE OR REPLACE FUNCTION public.seed_project_kpi_demo()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  bu_cement uuid; p uuid; m uuid; e uuid;
  d date; today date := current_date;
  base numeric; tgt numeric; days int;
  names text[]; roles_t text[]; weights numeric[]; factors numeric[];
  notes text[] := ARRAY[
    'Completed conveyor calibration ahead of schedule',
    'Delayed due to part shipment',
    'Routine shift output, no blockers',
    'Coordinated with vendor on installation slot',
    'Recovered backlog from previous shift',
    'Quality check passed on first pass',
    'Downtime for preventive maintenance',
    'Extra shift arranged to close the gap'
  ];
  i int; j int; rec record;
BEGIN
  DELETE FROM public.projects;
  DELETE FROM public.business_units;

  INSERT INTO public.business_units(name) VALUES
    ('Anwar Cement Ltd.'), ('Anwar Ispat Ltd.'), ('Anwar Galvanizing Ltd.');
  SELECT id INTO bu_cement FROM public.business_units WHERE name = 'Anwar Cement Ltd.';

  PERFORM setseed(0.42);

  FOR rec IN
    SELECT * FROM (VALUES
      ('Project 01 — Kiln Efficiency Upgrade','Raising clinker throughput while holding fuel cost per ton.','tons/day',1200::numeric,7,6),
      ('Project 02 — Warehouse Automation Rollout','Automated storage and retrieval across the central warehouse.','BDT',500000::numeric,14,10),
      ('Project 03 — Regional Distribution Expansion','New dealer routes and depot coverage across three regions.','BDT',300000::numeric,7,6)
    ) AS t(nm, descr, unit, base, days, headcount)
  LOOP
    INSERT INTO public.projects(business_unit_id, name, description, status, unit)
    VALUES (bu_cement, rec.nm, rec.descr, 'ongoing', rec.unit) RETURNING id INTO p;
    base := rec.base; days := rec.days;

    FOR i IN 0..days-1 LOOP
      d := today - i;
      tgt := round(base * (0.96 + random() * 0.08)::numeric);
      INSERT INTO public.project_targets(project_id, target_date, target_value) VALUES (p, d, tgt);
    END LOOP;

    IF rec.headcount = 10 THEN
      names := ARRAY['Farhan Kabir','Nusrat Jahan','Imran Hossain','Ayesha Siddika','Rashed Chowdhury','Tanvir Alam','Sadia Rahman','Mahfuz Anwar','Shahriar Islam','Rumana Akter'];
      roles_t := ARRAY['Automation Lead','Process Engineer','Warehouse Supervisor','Data Analyst','Logistics Officer','Controls Technician','QA Specialist','Site Coordinator','Maintenance Lead','Inventory Officer'];
      weights := ARRAY[14,12,11,10,10,10,9,8,8,8];
      factors := ARRAY[1.18,1.05,0.98,0.95,0.92,0.90,0.88,0.84,0.72,0.63];
    ELSE
      names := ARRAY['Zubair Hasan','Meherun Nesa','Arif Mahmud','Sanjida Karim','Nayeem Bhuiyan','Tahmina Sultana'];
      roles_t := ARRAY['Project Lead','Kiln Engineer','Field Supervisor','Planner','Route Manager','Reporting Officer'];
      weights := ARRAY[20,18,17,16,15,14];
      factors := ARRAY[1.14,1.02,0.96,0.90,0.83,0.66];
    END IF;

    FOR j IN 1..rec.headcount LOOP
      INSERT INTO public.project_members(project_id, name, designation, kpi_weight_percent)
      VALUES (p, names[j], roles_t[j], weights[j]) RETURNING id INTO m;

      FOR i IN 0..days-1 LOOP
        d := today - i;
        SELECT target_value INTO tgt FROM public.project_targets WHERE project_id = p AND target_date = d;
        INSERT INTO public.project_employee_entries(project_id, member_id, entry_date, actual_value, report_note, kpi_weight_percent, kpi_score)
        VALUES (
          p, m, d,
          round((tgt * (weights[j] / 100.0) * factors[j] * (0.85 + random() * 0.3)::numeric), 2),
          notes[1 + floor(random() * array_length(notes,1))::int],
          weights[j],
          NULL
        ) RETURNING id INTO e;

        IF i = 0 THEN
          INSERT INTO public.project_evidence(project_employee_entry_id, file_name, file_url, file_hash, file_size)
          VALUES (e, lower(replace(names[j],' ','-')) || '-daily-report.pdf',
                  'project-evidence/' || p || '/' || e || '.pdf',
                  md5(e::text),
                  120000 + floor(random() * 400000)::int);
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;

  UPDATE public.project_employee_entries pe
  SET kpi_score = LEAST(120, round(pe.actual_value / NULLIF(pt.target_value * pe.kpi_weight_percent / 100.0, 0) * 100, 2))
  FROM public.project_targets pt
  WHERE pt.project_id = pe.project_id AND pt.target_date = pe.entry_date;
END;
$fn$;

REVOKE ALL ON FUNCTION public.seed_project_kpi_demo() FROM PUBLIC, anon, authenticated;

SELECT public.seed_project_kpi_demo();