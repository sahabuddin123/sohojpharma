DROP POLICY IF EXISTS "Public can read blog images" ON storage.objects;
DROP POLICY IF EXISTS landing_cms_public_read ON storage.objects;
CREATE POLICY "App admins can read blog images" ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'blog-images' AND public.is_app_admin(auth.uid()));
CREATE POLICY landing_cms_admin_read ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'landing-cms' AND public.is_app_admin(auth.uid()));