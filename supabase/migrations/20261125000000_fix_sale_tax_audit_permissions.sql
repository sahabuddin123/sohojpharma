-- Ensure authenticated users (via pos_return) can insert into sale_tax_audit
GRANT SELECT, INSERT ON public.sale_tax_audit TO authenticated;

DO $$ BEGIN
  CREATE POLICY "tax_audit_tenant_insert" ON public.sale_tax_audit
    FOR INSERT TO authenticated
    WITH CHECK (is_tenant_member(auth.uid(), tenant_id));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
