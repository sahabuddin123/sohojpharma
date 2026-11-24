
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions DISABLE TRIGGER trg_subscription_guard;
UPDATE public.subscriptions SET status='trial' WHERE status='trialing';
ALTER TABLE public.subscriptions ENABLE TRIGGER trg_subscription_guard;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial','active','past_due','expired','cancelled'));
