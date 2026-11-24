ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS client_op_id uuid UNIQUE;
ALTER TABLE public.purchases ADD COLUMN IF NOT EXISTS client_op_id uuid UNIQUE;
CREATE INDEX IF NOT EXISTS idx_sales_client_op_id ON public.sales(client_op_id) WHERE client_op_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_purchases_client_op_id ON public.purchases(client_op_id) WHERE client_op_id IS NOT NULL;