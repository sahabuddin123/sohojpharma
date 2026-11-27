-- Allow online payment gateway lifecycle statuses alongside manual review statuses
ALTER TABLE public.subscription_payments
  DROP CONSTRAINT IF EXISTS subscription_payments_status_check;

ALTER TABLE public.subscription_payments
  ADD CONSTRAINT subscription_payments_status_check
  CHECK (status IN (
    'pending',
    'pending_review',
    'processing',
    'paid',
    'succeeded',
    'completed',
    'approved',
    'rejected',
    'failed',
    'cancelled',
    'refunded'
  ));
