ALTER TABLE public.tenants DISABLE TRIGGER USER;
UPDATE public.tenants SET status='active' WHERE id='a2df5b96-458e-433c-a690-4ba6f76cc821';
ALTER TABLE public.tenants ENABLE TRIGGER USER;