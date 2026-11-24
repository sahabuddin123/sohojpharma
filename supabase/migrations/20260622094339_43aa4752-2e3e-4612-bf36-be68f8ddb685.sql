ALTER TABLE public.subscriptions DISABLE TRIGGER USER;
UPDATE public.subscriptions
  SET status='active',
      plan_id=(SELECT id FROM public.plans WHERE code='pro' LIMIT 1),
      current_period_start=now(),
      current_period_end=now()+interval '1 year',
      billing_cycle='yearly',
      auto_renew=true,
      starts_at=now(),
      expires_at=now()+interval '1 year',
      cancelled_at=NULL,
      updated_at=now()
  WHERE tenant_id='a2df5b96-458e-433c-a690-4ba6f76cc821';
ALTER TABLE public.subscriptions ENABLE TRIGGER USER;