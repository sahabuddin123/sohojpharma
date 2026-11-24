
-- 1. Extend status CHECK to include grace_period
ALTER TABLE public.subscriptions DROP CONSTRAINT IF EXISTS subscriptions_status_check;
ALTER TABLE public.subscriptions ADD CONSTRAINT subscriptions_status_check
  CHECK (status IN ('trial','active','past_due','grace_period','expired','cancelled','suspended'));

-- 2. subscription_history
CREATE TABLE IF NOT EXISTS public.subscription_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.subscriptions(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL,
  plan_id uuid,
  from_status text,
  to_status text,
  event text NOT NULL CHECK (event IN (
    'created','renewed','upgraded','downgraded','suspended','reactivated',
    'expired','cancelled','trial_converted','grace_started','status_changed'
  )),
  actor_user_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS subscription_history_sub_idx
  ON public.subscription_history (subscription_id, created_at DESC);
CREATE INDEX IF NOT EXISTS subscription_history_tenant_idx
  ON public.subscription_history (tenant_id, created_at DESC);

GRANT SELECT ON public.subscription_history TO authenticated;
GRANT ALL ON public.subscription_history TO service_role;

ALTER TABLE public.subscription_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY sub_history_admin_read
  ON public.subscription_history FOR SELECT TO authenticated
  USING (public.is_app_admin(auth.uid()));

CREATE POLICY sub_history_tenant_read
  ON public.subscription_history FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.tenant_members tm
      WHERE tm.tenant_id = subscription_history.tenant_id
        AND tm.user_id = auth.uid()
    )
  );

-- 3. Trigger: auto-log lifecycle events + audit
CREATE OR REPLACE FUNCTION public.tg_subscription_history()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_event text;
  v_old_price numeric;
  v_new_price numeric;
  v_meta jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_event := 'created';
    v_meta := jsonb_build_object(
      'plan_id', NEW.plan_id, 'billing_cycle', NEW.billing_cycle,
      'expires_at', NEW.expires_at, 'status', NEW.status
    );
    INSERT INTO public.subscription_history(
      subscription_id, tenant_id, plan_id, from_status, to_status, event, actor_user_id, metadata
    ) VALUES (NEW.id, NEW.tenant_id, NEW.plan_id, NULL, NEW.status, v_event, auth.uid(), v_meta);

    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, after_data)
    VALUES (NEW.tenant_id, auth.uid(), 'subscription.created', 'subscriptions', NEW.id, to_jsonb(NEW));
    RETURN NEW;
  END IF;

  -- UPDATE
  IF NEW.plan_id IS DISTINCT FROM OLD.plan_id THEN
    SELECT price_bdt INTO v_old_price FROM public.plans WHERE id = OLD.plan_id;
    SELECT price_bdt INTO v_new_price FROM public.plans WHERE id = NEW.plan_id;
    v_event := CASE
      WHEN COALESCE(v_new_price,0) > COALESCE(v_old_price,0) THEN 'upgraded'
      WHEN COALESCE(v_new_price,0) < COALESCE(v_old_price,0) THEN 'downgraded'
      ELSE 'status_changed'
    END;
    INSERT INTO public.subscription_history(
      subscription_id, tenant_id, plan_id, from_status, to_status, event, actor_user_id, metadata
    ) VALUES (NEW.id, NEW.tenant_id, NEW.plan_id, OLD.status, NEW.status, v_event, auth.uid(),
      jsonb_build_object('from_plan', OLD.plan_id, 'to_plan', NEW.plan_id,
                         'from_price', v_old_price, 'to_price', v_new_price,
                         'billing_cycle', NEW.billing_cycle));
    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (NEW.tenant_id, auth.uid(), 'subscription.' || v_event, 'subscriptions', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;

  IF NEW.status IS DISTINCT FROM OLD.status THEN
    v_event := CASE NEW.status
      WHEN 'suspended'    THEN 'suspended'
      WHEN 'cancelled'    THEN 'cancelled'
      WHEN 'expired'      THEN 'expired'
      WHEN 'grace_period' THEN 'grace_started'
      WHEN 'active'       THEN CASE
        WHEN OLD.status IN ('trial')                              THEN 'trial_converted'
        WHEN OLD.status IN ('suspended','expired','past_due','grace_period','cancelled') THEN 'reactivated'
        ELSE 'status_changed' END
      ELSE 'status_changed'
    END;
    IF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
       AND NEW.current_period_end > COALESCE(OLD.current_period_end, NEW.current_period_end - interval '1 day') THEN
      v_event := 'renewed';
    END IF;
    INSERT INTO public.subscription_history(
      subscription_id, tenant_id, plan_id, from_status, to_status, event, actor_user_id, metadata
    ) VALUES (NEW.id, NEW.tenant_id, NEW.plan_id, OLD.status, NEW.status, v_event, auth.uid(),
      jsonb_build_object('expires_at', NEW.expires_at, 'period_end', NEW.current_period_end,
                         'billing_cycle', NEW.billing_cycle));
    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (NEW.tenant_id, auth.uid(), 'subscription.' || v_event, 'subscriptions', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  ELSIF NEW.current_period_end IS DISTINCT FROM OLD.current_period_end
        AND NEW.current_period_end > COALESCE(OLD.current_period_end, NEW.current_period_end - interval '1 day') THEN
    -- renewal without status change
    INSERT INTO public.subscription_history(
      subscription_id, tenant_id, plan_id, from_status, to_status, event, actor_user_id, metadata
    ) VALUES (NEW.id, NEW.tenant_id, NEW.plan_id, OLD.status, NEW.status, 'renewed', auth.uid(),
      jsonb_build_object('expires_at', NEW.expires_at, 'period_end', NEW.current_period_end));
    INSERT INTO public.audit_log(tenant_id, user_id, action, entity_table, entity_id, before_data, after_data)
    VALUES (NEW.tenant_id, auth.uid(), 'subscription.renewed', 'subscriptions', NEW.id, to_jsonb(OLD), to_jsonb(NEW));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS subscription_history_aiu ON public.subscriptions;
CREATE TRIGGER subscription_history_aiu
  AFTER INSERT OR UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_subscription_history();

-- 4. allow grace_period in admin_set_subscription_status; notify on it
CREATE OR REPLACE FUNCTION public.admin_set_subscription_status(p_subscription uuid, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_app_admin(auth.uid()) THEN RAISE EXCEPTION 'insufficient_privilege' USING ERRCODE='42501'; END IF;
  IF p_status NOT IN ('trial','active','past_due','grace_period','expired','cancelled','suspended') THEN
    RAISE EXCEPTION 'invalid_status';
  END IF;
  UPDATE public.subscriptions
     SET status = p_status,
         cancelled_at = CASE WHEN p_status = 'cancelled' THEN now() ELSE cancelled_at END,
         updated_at = now()
   WHERE id = p_subscription;
END $$;

CREATE OR REPLACE FUNCTION public.tg_admin_notify_subscription()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_name text;
BEGIN
  SELECT name INTO v_name FROM public.tenants WHERE id = NEW.tenant_id;
  IF TG_OP = 'UPDATE' AND NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status = 'expired' THEN
      PERFORM public.notify_admin('warning','subscription_expired','Subscription Expired',
        COALESCE(v_name,'Tenant')||' subscription expired.','/admin/subscriptions',
        'subscription', NEW.id, jsonb_build_object('tenant_id', NEW.tenant_id), NULL);
    ELSIF NEW.status = 'active' AND OLD.status IN ('expired','past_due','grace_period','cancelled','suspended') THEN
      PERFORM public.notify_admin('success','subscription_reactivated','Subscription Reactivated',
        COALESCE(v_name,'Tenant')||' subscription is active again.','/admin/subscriptions',
        'subscription', NEW.id, jsonb_build_object('tenant_id', NEW.tenant_id, 'from', OLD.status), NULL);
    ELSIF NEW.status IN ('past_due','grace_period') THEN
      PERFORM public.notify_admin('warning','subscription_expiring','Subscription In Grace',
        COALESCE(v_name,'Tenant')||' subscription is in grace period.','/admin/subscriptions',
        'subscription', NEW.id, jsonb_build_object('tenant_id', NEW.tenant_id, 'grace_until', NEW.grace_until), NULL);
    ELSIF NEW.status = 'suspended' THEN
      PERFORM public.notify_admin('warning','subscription_suspended','Subscription Suspended',
        COALESCE(v_name,'Tenant')||' subscription has been suspended.','/admin/subscriptions',
        'subscription', NEW.id, jsonb_build_object('tenant_id', NEW.tenant_id, 'from', OLD.status), NULL);
    END IF;
  END IF;
  RETURN NEW;
END $$;
