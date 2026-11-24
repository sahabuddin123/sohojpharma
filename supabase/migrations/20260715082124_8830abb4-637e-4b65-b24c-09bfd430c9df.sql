-- Fix: public visitors should not be able to directly execute the internal journal trigger helper.
REVOKE EXECUTE ON FUNCTION public.tg_journal_entries_default_branch() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_journal_entries_default_branch() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_journal_entries_default_branch() FROM authenticated;

-- Fix: standardize prescription bucket tenant-folder parsing across all policies.
DROP POLICY IF EXISTS "tenant members update prescription files" ON storage.objects;

CREATE POLICY "tenant members update prescription files"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'prescriptions'
  AND public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
)
WITH CHECK (
  bucket_id = 'prescriptions'
  AND public.is_tenant_member(auth.uid(), split_part(name, '/', 1)::uuid)
);