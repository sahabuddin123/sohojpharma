
-- =====================================================
-- S4.1 RBAC: roles, permissions, role_permissions, user_role_assignments
-- =====================================================

-- 1) PERMISSIONS catalog (system-wide)
CREATE TABLE IF NOT EXISTS public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,         -- e.g. 'products.view'
  module text NOT NULL,              -- e.g. 'products'
  action text NOT NULL,              -- e.g. 'view'
  description text,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.permissions TO authenticated;
GRANT ALL ON public.permissions TO service_role;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "permissions readable by authenticated" ON public.permissions;
CREATE POLICY "permissions readable by authenticated"
  ON public.permissions FOR SELECT TO authenticated USING (true);

-- 2) ROLES (system + custom, tenant-scoped for custom)
CREATE TABLE IF NOT EXISTS public.roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE, -- NULL for system roles
  code text NOT NULL,                -- 'owner', 'manager', 'warehouse_manager'...
  name text NOT NULL,
  description text,
  is_system boolean NOT NULL DEFAULT false,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, code)
);
CREATE UNIQUE INDEX IF NOT EXISTS roles_system_code_unique
  ON public.roles (code) WHERE tenant_id IS NULL;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.roles TO authenticated;
GRANT ALL ON public.roles TO service_role;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "roles select" ON public.roles;
CREATE POLICY "roles select" ON public.roles FOR SELECT TO authenticated
  USING (
    tenant_id IS NULL
    OR EXISTS (SELECT 1 FROM public.tenant_members tm
               WHERE tm.tenant_id = roles.tenant_id AND tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "roles write" ON public.roles;
CREATE POLICY "roles write" ON public.roles FOR ALL TO authenticated
  USING (
    tenant_id IS NOT NULL AND (
      public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
    )
  )
  WITH CHECK (
    tenant_id IS NOT NULL AND is_system = false AND (
      public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
      OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
    )
  );

-- 3) ROLE_PERMISSIONS
CREATE TABLE IF NOT EXISTS public.role_permissions (
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role_id, permission_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_permissions TO authenticated;
GRANT ALL ON public.role_permissions TO service_role;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "role_permissions select" ON public.role_permissions;
CREATE POLICY "role_permissions select" ON public.role_permissions FOR SELECT TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.roles r
            WHERE r.id = role_permissions.role_id
              AND (r.tenant_id IS NULL
                   OR EXISTS (SELECT 1 FROM public.tenant_members tm
                              WHERE tm.tenant_id = r.tenant_id AND tm.user_id = auth.uid())))
  );

DROP POLICY IF EXISTS "role_permissions write" ON public.role_permissions;
CREATE POLICY "role_permissions write" ON public.role_permissions FOR ALL TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.roles r
            WHERE r.id = role_permissions.role_id
              AND r.tenant_id IS NOT NULL
              AND (public.has_role(auth.uid(), r.tenant_id, 'owner'::app_role)
                   OR public.has_role(auth.uid(), r.tenant_id, 'manager'::app_role)))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.roles r
            WHERE r.id = role_permissions.role_id
              AND r.tenant_id IS NOT NULL
              AND (public.has_role(auth.uid(), r.tenant_id, 'owner'::app_role)
                   OR public.has_role(auth.uid(), r.tenant_id, 'manager'::app_role)))
  );

-- 4) USER_ROLE_ASSIGNMENTS
CREATE TABLE IF NOT EXISTS public.user_role_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role_id uuid NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
  branch_id uuid,
  warehouse_id uuid,
  assigned_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, user_id, role_id)
);
CREATE INDEX IF NOT EXISTS ura_user_tenant_idx
  ON public.user_role_assignments (user_id, tenant_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_role_assignments TO authenticated;
GRANT ALL ON public.user_role_assignments TO service_role;
ALTER TABLE public.user_role_assignments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ura select" ON public.user_role_assignments;
CREATE POLICY "ura select" ON public.user_role_assignments FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.tenant_members tm
               WHERE tm.tenant_id = user_role_assignments.tenant_id AND tm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS "ura write" ON public.user_role_assignments;
CREATE POLICY "ura write" ON public.user_role_assignments FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
  )
  WITH CHECK (
    public.has_role(auth.uid(), tenant_id, 'owner'::app_role)
    OR public.has_role(auth.uid(), tenant_id, 'manager'::app_role)
  );

-- 5) Seed system permissions
INSERT INTO public.permissions (code, module, action, description) VALUES
  ('dashboard.view','dashboard','view','View dashboard'),
  ('products.view','products','view','View products'),
  ('products.create','products','create','Create products'),
  ('products.edit','products','edit','Edit products'),
  ('products.delete','products','delete','Delete products'),
  ('products.import','products','import','Import products'),
  ('products.export','products','export','Export products'),
  ('inventory.view','inventory','view','View inventory'),
  ('inventory.adjust','inventory','adjust','Adjust stock'),
  ('inventory.transfer','inventory','transfer','Create transfers'),
  ('inventory.approve_transfer','inventory','approve_transfer','Approve transfers'),
  ('sales.view','sales','view','View sales'),
  ('sales.create','sales','create','Create sales / POS'),
  ('sales.refund','sales','refund','Process refunds'),
  ('sales.discount','sales','discount','Apply discounts'),
  ('sales.override_price','sales','override_price','Override price'),
  ('purchases.view','purchases','view','View purchases'),
  ('purchases.create','purchases','create','Create purchases'),
  ('purchases.approve','purchases','approve','Approve POs'),
  ('procurement.view','procurement','view','View procurement'),
  ('procurement.approve','procurement','approve','Approve procurement'),
  ('accounts.view','accounts','view','View accounts'),
  ('accounts.post_journal','accounts','post_journal','Post journals'),
  ('accounts.approve','accounts','approve','Approve journals'),
  ('reports.view','reports','view','View reports'),
  ('reports.export','reports','export','Export reports'),
  ('settings.view','settings','view','View settings'),
  ('settings.edit','settings','edit','Edit settings'),
  ('users.manage','users','manage','Manage users'),
  ('roles.manage','roles','manage','Manage roles'),
  ('subscription.manage','subscription','manage','Manage subscription')
ON CONFLICT (code) DO NOTHING;

-- 6) Seed system roles
INSERT INTO public.roles (tenant_id, code, name, description, is_system) VALUES
  (NULL,'owner','Owner','Full access',true),
  (NULL,'corporate_admin','Corporate Admin','Cross-branch admin',true),
  (NULL,'manager','Manager','Branch manager',true),
  (NULL,'regional_manager','Regional Manager','Multi-branch oversight',true),
  (NULL,'pharmacist','Pharmacist','Dispense + clinical',true),
  (NULL,'inventory_officer','Inventory Officer','Stock & transfers',true),
  (NULL,'cashier','Cashier','POS only',true),
  (NULL,'auditor','Auditor','Read-only access',true)
ON CONFLICT DO NOTHING;

-- 7) Seed role->permission defaults
-- Owner / Corporate Admin: all
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code IN ('owner','corporate_admin') AND r.tenant_id IS NULL
ON CONFLICT DO NOTHING;

-- Manager: all except subscription + roles.manage
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'manager' AND r.tenant_id IS NULL
  AND p.code NOT IN ('subscription.manage','roles.manage')
ON CONFLICT DO NOTHING;

-- Regional Manager: same as manager
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'regional_manager' AND r.tenant_id IS NULL
  AND p.code NOT IN ('subscription.manage','roles.manage','settings.edit')
ON CONFLICT DO NOTHING;

-- Pharmacist
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'pharmacist' AND r.tenant_id IS NULL
  AND p.code IN ('dashboard.view','products.view','inventory.view','sales.view',
                 'sales.create','sales.refund','reports.view','settings.view')
ON CONFLICT DO NOTHING;

-- Inventory Officer
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'inventory_officer' AND r.tenant_id IS NULL
  AND p.code IN ('dashboard.view','products.view','products.create','products.edit',
                 'products.import','products.export','inventory.view','inventory.adjust',
                 'inventory.transfer','inventory.approve_transfer','purchases.view',
                 'purchases.create','reports.view','reports.export')
ON CONFLICT DO NOTHING;

-- Cashier
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'cashier' AND r.tenant_id IS NULL
  AND p.code IN ('dashboard.view','sales.view','sales.create')
ON CONFLICT DO NOTHING;

-- Auditor: all *.view + reports.export
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'auditor' AND r.tenant_id IS NULL
  AND (p.action = 'view' OR p.code = 'reports.export')
ON CONFLICT DO NOTHING;

-- 8) has_permission() — checks both legacy user_roles->system role permissions
--    and new user_role_assignments
CREATE OR REPLACE FUNCTION public.has_permission(
  _user_id uuid, _tenant_id uuid, _permission text
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    -- New RBAC: explicit assignment
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.role_permissions rp ON rp.role_id = ura.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ura.user_id = _user_id
      AND ura.tenant_id = _tenant_id
      AND p.code = _permission
  ) OR EXISTS (
    -- Legacy: user_roles app_role mapped to system role of same code
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.tenant_id IS NULL AND r.code = ur.role::text
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ur.user_id = _user_id
      AND ur.tenant_id = _tenant_id
      AND p.code = _permission
  );
$$;

-- 9) updated_at trigger for roles
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS trg_roles_touch ON public.roles;
CREATE TRIGGER trg_roles_touch BEFORE UPDATE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
