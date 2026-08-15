INSERT INTO public.evidence (actual_entry_id, file_url, file_name, file_hash, file_size, uploaded_by, uploaded_at, description)
SELECT a.id,
       'demo/' || a.id || '/evidence.pdf',
       'evidence-' || to_char(a.reporting_date, 'YYYY-MM-DD') || '.pdf',
       md5(a.id::text),
       184320,
       a.entered_by,
       a.entered_at,
       'Demo supporting document'
FROM public.actual_entries a
WHERE NOT EXISTS (SELECT 1 FROM public.evidence e WHERE e.actual_entry_id = a.id);