-- 1. Merge duplicate departments (keep the one with KPIs attached)
DO $$
DECLARE r RECORD; keeper uuid;
BEGIN
  FOR r IN SELECT name FROM public.departments GROUP BY name HAVING count(*) > 1 LOOP
    SELECT d.id INTO keeper FROM public.departments d
      WHERE d.name = r.name
      ORDER BY (SELECT count(*) FROM public.kpi_definitions k WHERE k.department_id = d.id) DESC,
               (SELECT count(*) FROM public.employees e WHERE e.department_id = d.id) DESC,
               d.created_at ASC
      LIMIT 1;
    UPDATE public.employees SET department_id = keeper WHERE department_id IN
      (SELECT id FROM public.departments WHERE name = r.name AND id <> keeper);
    UPDATE public.kpi_definitions SET department_id = keeper WHERE department_id IN
      (SELECT id FROM public.departments WHERE name = r.name AND id <> keeper);
    UPDATE public.scoring_policy SET department_id = keeper WHERE department_id IN
      (SELECT id FROM public.departments WHERE name = r.name AND id <> keeper);
    UPDATE public.departments SET parent_department_id = keeper WHERE parent_department_id IN
      (SELECT id FROM public.departments WHERE name = r.name AND id <> keeper);
    DELETE FROM public.departments WHERE name = r.name AND id <> keeper;
  END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS departments_name_key ON public.departments (name);

-- 2. Historical demo periods so the trend chart has 4 real points
CREATE OR REPLACE FUNCTION public.seed_demo_history()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  cutoff date := (date_trunc('quarter', CURRENT_DATE) - interval '3 months')::date;
  spec jsonb;
  specs jsonb := '[
    {"emp":"11111111-1111-4111-8111-111111111101","dept":"22222222-2222-4222-8222-222222222201","name":"New Client Acquisitions","target":12,"unit":"clients","weight":25,"persp":"customer","base":78},
    {"emp":"11111111-1111-4111-8111-111111111105","dept":"22222222-2222-4222-8222-222222222202","name":"On-time Delivery Rate","target":95,"unit":"%","weight":35,"persp":"operational","base":90},
    {"emp":"11111111-1111-4111-8111-111111111106","dept":"22222222-2222-4222-8222-222222222203","name":"First Call Resolution","target":85,"unit":"%","weight":30,"persp":"customer","base":83},
    {"emp":"11111111-1111-4111-8111-111111111107","dept":"22222222-2222-4222-8222-222222222204","name":"Quarterly Revenue Target","target":25000000,"unit":"BDT","weight":40,"persp":"financial","base":70}
  ]'::jsonb;
  offs int;
  kid uuid; aid uuid; per_start date; per_end date;
  ach numeric; sc numeric; act numeric;
  e_nasrin uuid := '11111111-1111-4111-8111-111111111102';
  e_hr     uuid := '11111111-1111-4111-8111-111111111103';
  e_kamal  uuid := '11111111-1111-4111-8111-111111111104';
BEGIN
  -- clear any previously seeded history (older than the previous quarter)
  DELETE FROM public.evidence WHERE actual_entry_id IN (
    SELECT a.id FROM public.actual_entries a JOIN public.kpi_definitions k ON k.id = a.kpi_definition_id
    WHERE k.period_end < cutoff);
  DELETE FROM public.actual_entries WHERE kpi_definition_id IN
    (SELECT id FROM public.kpi_definitions WHERE period_end < cutoff);
  DELETE FROM public.score_records WHERE kpi_definition_id IN
    (SELECT id FROM public.kpi_definitions WHERE period_end < cutoff);
  DELETE FROM public.audit_log WHERE entity_id IN
    (SELECT id FROM public.kpi_definitions WHERE period_end < cutoff);
  DELETE FROM public.kpi_definitions WHERE period_end < cutoff;

  FOREACH offs IN ARRAY ARRAY[3,2] LOOP
    per_start := (date_trunc('quarter', CURRENT_DATE) - (offs || ' months')::interval * 3)::date;
    per_end   := (date_trunc('quarter', CURRENT_DATE) - ((offs-1) || ' months')::interval * 3 - interval '1 day')::date;

    FOR spec IN SELECT * FROM jsonb_array_elements(specs) LOOP
      kid := md5((spec->>'name') || (spec->>'emp') || per_start::text)::uuid;
      aid := md5('actual' || (spec->>'name') || (spec->>'emp') || per_start::text)::uuid;
      ach := (spec->>'base')::numeric - (offs - 1) * 6 + ((('x'||substr(md5((spec->>'name')||per_start::text),1,4))::bit(16)::int % 9) - 4);
      act := round((spec->>'target')::numeric * ach / 100, 2);
      sc  := round(greatest(0, least(120, (ach - 70) / 30 * 100)), 2);

      INSERT INTO public.kpi_definitions
        (id, employee_id, department_id, name, description, kpi_type, target_value, unit, weight_percent,
         period_start, period_end, perspective, reviewer_id, approver_id, status, created_by, created_at)
      VALUES (kid, (spec->>'emp')::uuid, (spec->>'dept')::uuid, spec->>'name',
              'Historical period record.', 'higher_is_better', (spec->>'target')::numeric, spec->>'unit',
              (spec->>'weight')::numeric, per_start, per_end, spec->>'persp',
              e_nasrin, e_kamal, 'approved', e_hr, per_start::timestamptz);

      INSERT INTO public.actual_entries
        (id, kpi_definition_id, actual_value, data_source_type, reporting_date, comments, entered_by, entered_at)
      VALUES (aid, kid, act, 'system_verified', per_end, 'Historical reported actual.',
              (spec->>'emp')::uuid, per_end::timestamptz);

      INSERT INTO public.score_records
        (kpi_definition_id, version_number, calculated_score, achievement_percent, adjustment_delta,
         final_score, calculation_trace, reviewed_by, reviewed_at, approved_by, approved_at, created_at)
      VALUES (kid, 1, sc, round(ach,2), 0, sc,
              jsonb_build_object('formula', format('(actual %s / target %s) * 100', act, spec->>'target'),
                                 'achievement_percent', round(ach,2),
                                 'curve','linear 70%-100% achievement mapped to score 0-100',
                                 'system_score', sc),
              e_nasrin, per_end::timestamptz, e_nasrin, per_end::timestamptz, per_end::timestamptz);
    END LOOP;
  END LOOP;
END; $$;

REVOKE ALL ON FUNCTION public.seed_demo_history() FROM anon, authenticated;

SELECT public.seed_demo_history();