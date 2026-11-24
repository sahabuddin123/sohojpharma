
DROP POLICY IF EXISTS "subproofs read"   ON storage.objects;
DROP POLICY IF EXISTS "subproofs write"  ON storage.objects;
DROP POLICY IF EXISTS "branding read"    ON storage.objects;
DROP POLICY IF EXISTS "branding write"   ON storage.objects;
DROP POLICY IF EXISTS "branding update"  ON storage.objects;
DROP POLICY IF EXISTS "branding delete"  ON storage.objects;

CREATE POLICY "subproofs read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'subscription-proofs' AND (
    public.is_app_admin(auth.uid())
    OR public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid)
  ));
CREATE POLICY "subproofs write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'subscription-proofs' AND
              public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid));

CREATE POLICY "branding read" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'tenant-branding' AND (
    public.is_app_admin(auth.uid())
    OR public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid)
  ));
CREATE POLICY "branding write" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'tenant-branding' AND
              public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid));
CREATE POLICY "branding update" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'tenant-branding' AND
         public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid))
  WITH CHECK (bucket_id = 'tenant-branding' AND
              public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid));
CREATE POLICY "branding delete" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'tenant-branding' AND
         public.is_tenant_member(auth.uid(), (string_to_array(name,'/'))[1]::uuid));
