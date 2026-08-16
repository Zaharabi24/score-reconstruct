-- kpi_definitions writes
CREATE POLICY kpi_insert ON public.kpi_definitions FOR INSERT TO authenticated
  WITH CHECK (private.my_role() = 'hr_admin');

CREATE POLICY kpi_update ON public.kpi_definitions FOR UPDATE TO authenticated
  USING (private.my_role() = 'hr_admin' OR reviewer_id = auth.uid() OR approver_id = auth.uid() OR private.manages(employee_id) OR employee_id = auth.uid())
  WITH CHECK (private.my_role() = 'hr_admin' OR reviewer_id = auth.uid() OR approver_id = auth.uid() OR private.manages(employee_id) OR employee_id = auth.uid());

CREATE POLICY kpi_delete ON public.kpi_definitions FOR DELETE TO authenticated
  USING (private.my_role() = 'hr_admin');

-- score_records writes (no delete policy: deletes stay blocked)
CREATE POLICY scores_insert ON public.score_records FOR INSERT TO authenticated
  WITH CHECK (
    private.my_role() = 'hr_admin'
    OR EXISTS (
      SELECT 1 FROM public.kpi_definitions k
      WHERE k.id = kpi_definition_id
        AND (k.reviewer_id = auth.uid() OR k.approver_id = auth.uid() OR k.employee_id = auth.uid())
    )
  );

CREATE POLICY scores_update ON public.score_records FOR UPDATE TO authenticated
  USING (
    private.my_role() = 'hr_admin'
    OR EXISTS (
      SELECT 1 FROM public.kpi_definitions k
      WHERE k.id = kpi_definition_id AND (k.reviewer_id = auth.uid() OR k.approver_id = auth.uid())
    )
  )
  WITH CHECK (
    private.my_role() = 'hr_admin'
    OR EXISTS (
      SELECT 1 FROM public.kpi_definitions k
      WHERE k.id = kpi_definition_id AND (k.reviewer_id = auth.uid() OR k.approver_id = auth.uid())
    )
  );

-- evidence writes (insert only; update/delete stay blocked)
CREATE POLICY evidence_insert ON public.evidence FOR INSERT TO authenticated
  WITH CHECK (
    uploaded_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.actual_entries a
      JOIN public.kpi_definitions k ON k.id = a.kpi_definition_id
      WHERE a.id = actual_entry_id AND k.employee_id = auth.uid()
    )
  );

-- storage: evidence bucket write policies, scoped to the caller's own folder
CREATE POLICY evidence_objects_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'evidence'
    AND (private.my_role() = 'hr_admin' OR (storage.foldername(name))[1] = auth.uid()::text)
  );

CREATE POLICY evidence_objects_update ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (private.my_role() = 'hr_admin' OR (storage.foldername(name))[1] = auth.uid()::text)
  )
  WITH CHECK (
    bucket_id = 'evidence'
    AND (private.my_role() = 'hr_admin' OR (storage.foldername(name))[1] = auth.uid()::text)
  );

CREATE POLICY evidence_objects_delete ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'evidence'
    AND (private.my_role() = 'hr_admin' OR (storage.foldername(name))[1] = auth.uid()::text)
  );