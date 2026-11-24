
CREATE POLICY "imports_tenant_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'imports' AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = tm.tenant_id::text));

CREATE POLICY "imports_tenant_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'imports' AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = tm.tenant_id::text));

CREATE POLICY "imports_tenant_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'imports' AND EXISTS (
    SELECT 1 FROM public.tenant_members tm
    WHERE tm.user_id = auth.uid()
      AND (storage.foldername(name))[1] = tm.tenant_id::text));
