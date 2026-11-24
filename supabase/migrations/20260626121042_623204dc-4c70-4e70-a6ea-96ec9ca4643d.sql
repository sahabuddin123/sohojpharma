
CREATE POLICY "landing_cms_public_read" ON storage.objects FOR SELECT TO anon, authenticated USING (bucket_id = 'landing-cms');
CREATE POLICY "landing_cms_admin_write" ON storage.objects FOR INSERT TO authenticated WITH CHECK (bucket_id = 'landing-cms' AND public.is_app_admin(auth.uid()));
CREATE POLICY "landing_cms_admin_update" ON storage.objects FOR UPDATE TO authenticated USING (bucket_id = 'landing-cms' AND public.is_app_admin(auth.uid()));
CREATE POLICY "landing_cms_admin_delete" ON storage.objects FOR DELETE TO authenticated USING (bucket_id = 'landing-cms' AND public.is_app_admin(auth.uid()));
