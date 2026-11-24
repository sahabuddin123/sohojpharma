
-- Branding bucket RLS: scope objects under branding/{tenant_id}/...
-- Path layout: <tenant_id>/<filename> (bucket_id = 'branding')

DROP POLICY IF EXISTS "branding_select_members" ON storage.objects;
DROP POLICY IF EXISTS "branding_insert_admins" ON storage.objects;
DROP POLICY IF EXISTS "branding_update_admins" ON storage.objects;
DROP POLICY IF EXISTS "branding_delete_admins" ON storage.objects;

CREATE POLICY "branding_select_members"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'branding'
    AND public.is_tenant_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
  );

CREATE POLICY "branding_insert_admins"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'owner')
      OR public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'corporate_admin')
    )
  );

CREATE POLICY "branding_update_admins"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'owner')
      OR public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'corporate_admin')
    )
  );

CREATE POLICY "branding_delete_admins"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'branding'
    AND (
      public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'owner')
      OR public.has_role(auth.uid(), ((storage.foldername(name))[1])::uuid, 'corporate_admin')
    )
  );
