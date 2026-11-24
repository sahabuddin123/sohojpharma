import { useEffect, useState } from "react";
import { createFileRoute, Link, redirect, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronRight, Loader2, Store, Warehouse, CreditCard, Building2, PartyPopper } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { localizePgError } from "@/lib/errors/pg-limit";

export const Route = createFileRoute("/setup")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Setup — SohojPharma" }] }),
  beforeLoad: async () => {
    const { data: userRes } = await supabase.auth.getUser();
    const user = userRes?.user;
    if (!user) throw redirect({ to: "/auth", replace: true });
    const { data: isAdmin } = await supabase.rpc("is_app_admin", { _user_id: user.id });
    if (isAdmin) throw redirect({ to: "/admin", replace: true });
  },
  component: SetupWizard,
});

type StepKey = "business" | "branch" | "warehouse" | "register" | "done";
const STEPS: { key: StepKey; label: string; icon: typeof Store }[] = [
  { key: "business", label: "Business", icon: Building2 },
  { key: "branch", label: "Branch", icon: Store },
  { key: "warehouse", label: "Warehouse", icon: Warehouse },
  { key: "register", label: "Register", icon: CreditCard },
  { key: "done", label: "Complete", icon: PartyPopper },
];

function SetupWizard() {
  const { session, currentTenantId, loading } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { t } = useTranslation();
  const [step, setStep] = useState<StepKey>("business");
  const [createdBranchId, setCreatedBranchId] = useState<string | null>(null);
  const [createdWarehouseId, setCreatedWarehouseId] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !session) navigate({ to: "/auth", replace: true });
  }, [loading, session, navigate]);

  const tenantId = currentTenantId ?? "";

  // ---------- Existing data ----------
  const { data: tenant } = useQuery({
    enabled: !!tenantId,
    queryKey: ["tenant-row", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("id,name,phone,address_line")
        .eq("id", tenantId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const branchesQ = useQuery({
    enabled: !!tenantId,
    queryKey: ["setup-branches", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id,name")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const existingBranches = branchesQ.data ?? [];

  const warehousesQ = useQuery({
    enabled: !!tenantId,
    queryKey: ["setup-warehouses", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("warehouses")
        .select("id,name,code,branch_id")
        .eq("tenant_id", tenantId)
        .is("deleted_at", null);
      if (error) throw error;
      return data ?? [];
    },
  });
  const existingWarehouses = warehousesQ.data ?? [];

  const openRegisterQ = useQuery({
    enabled: !!tenantId && !!session?.user?.id,
    queryKey: ["setup-open-register", tenantId, session?.user?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cash_registers")
        .select("id,register_name")
        .eq("tenant_id", tenantId)
        .eq("user_id", session!.user.id)
        .eq("status", "open")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  const existingOpenRegister = openRegisterQ.data ?? null;

  // ---------- Hydrate step from DB (run once after queries settle) ----------
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    if (hydrated || !tenantId) return;
    if (!branchesQ.isFetched || !warehousesQ.isFetched || !openRegisterQ.isFetched) return;
    console.log("[ONBOARDING_RECOVERY]", {
      branches: existingBranches.length,
      warehouses: existingWarehouses.length,
      openRegister: !!existingOpenRegister,
    });
    if (existingBranches.length > 0) {
      console.log("[FOUND_BRANCH]", existingBranches[0].id);
      setCreatedBranchId(existingBranches[0].id);
    }
    if (existingWarehouses.length > 0) {
      console.log("[FOUND_WAREHOUSE]", existingWarehouses[0].id);
      setCreatedWarehouseId(existingWarehouses[0].id);
    }
    if (existingOpenRegister) console.log("[FOUND_REGISTER]", existingOpenRegister.id);

    if (existingBranches.length > 0 && existingWarehouses.length > 0 && existingOpenRegister) {
      setStep("done");
    } else if (existingBranches.length > 0 && existingWarehouses.length > 0) {
      setStep("register");
    } else if (existingBranches.length > 0) {
      setStep("warehouse");
    }
    setHydrated(true);
  }, [hydrated, tenantId, branchesQ.isFetched, warehousesQ.isFetched, openRegisterQ.isFetched, existingBranches, existingWarehouses, existingOpenRegister]);

  // ---------- Form state ----------
  const [biz, setBiz] = useState({ name: "", phone: "", address: "" });
  useEffect(() => {
    if (tenant) setBiz({ name: tenant.name ?? "", phone: tenant.phone ?? "", address: tenant.address_line ?? "" });
  }, [tenant]);

  const [branch, setBranch] = useState({ name: "Main Branch", address: "", phone: "" });
  const [wh, setWh] = useState({ name: "Main Warehouse", code: "MAIN", address: "", isDefault: true });
  const [reg, setReg] = useState({ register_name: "Main Register", opening_amount: "0" });

  // ---------- Mutations ----------
  const saveBiz = useMutation({
    mutationFn: async () => {
      if (!biz.name.trim()) throw new Error("Business name is required");
      const { error } = await supabase
        .from("tenants")
        .update({ name: biz.name.trim(), phone: biz.phone || null, address_line: biz.address || null })
        .eq("id", tenantId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Business information saved");
      qc.invalidateQueries({ queryKey: ["tenant-row", tenantId] });
      setStep("branch");
    },
    onError: (e: Error) => toast.error(localizePgError(t, e)),
  });

  const saveBranch = useMutation({
    mutationFn: async () => {
      if (!branch.name.trim()) throw new Error("Branch name is required");
      // Existing branch? Skip creation.
      if (existingBranches.length > 0) {
        setCreatedBranchId(existingBranches[0].id);
        return existingBranches[0].id;
      }
      const code = branch.name.trim().toUpperCase().replace(/[^A-Z0-9]+/g, "").slice(0, 8) || "MAIN";
      const { data, error } = await supabase
        .from("branches")
        .insert({
          tenant_id: tenantId,
          code,
          name: branch.name.trim(),
          address: branch.address || null,
          phone: branch.phone || null,
          is_main: true,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: (id) => {
      setCreatedBranchId(id);
      toast.success("Branch created");
      qc.invalidateQueries({ queryKey: ["setup-branches", tenantId] });
      qc.invalidateQueries({ queryKey: ["onboarding-status", tenantId] });
      setStep("warehouse");
    },
    onError: (e: Error) => toast.error(localizePgError(t, e)),
  });

  const saveWarehouse = useMutation({
    mutationFn: async () => {
      if (!wh.name.trim()) throw new Error("Warehouse name is required");
      if (!wh.code.trim()) throw new Error("Warehouse code is required");
      const branchId = createdBranchId ?? existingBranches[0]?.id ?? null;
      const codeUpper = wh.code.trim().toUpperCase();

      // Idempotent: reuse if any warehouse exists (by code or any) for tenant
      const existingByCode = existingWarehouses.find((w) => (w.code ?? "").toUpperCase() === codeUpper);
      const reuse = existingByCode ?? existingWarehouses[0];
      if (reuse) {
        console.log("[SKIP_DUPLICATE_CREATE] warehouse", reuse.id);
        return reuse.id as string;
      }

      const { data, error } = await supabase
        .from("warehouses")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          code: codeUpper,
          name: wh.name.trim(),
          address: wh.address || null,
          is_default: wh.isDefault,
          is_active: true,
        })
        .select("id")
        .single();
      if (error) throw error;
      if (wh.isDefault) {
        await supabase
          .from("warehouses")
          .update({ is_default: false })
          .eq("tenant_id", tenantId)
          .neq("id", data.id);
      }
      return data.id as string;
    },
    onSuccess: (id) => {
      setCreatedWarehouseId(id);
      toast.success("Warehouse ready");
      qc.invalidateQueries({ queryKey: ["setup-warehouses", tenantId] });
      qc.invalidateQueries({ queryKey: ["warehouses-for-pos", tenantId] });
      qc.invalidateQueries({ queryKey: ["onboarding-status", tenantId] });
      setStep("register");
    },
    onError: (e: Error) => toast.error(localizePgError(t, e)),
  });

  const saveRegister = useMutation({
    mutationFn: async () => {
      if (!reg.register_name.trim()) throw new Error("Register name is required");
      if (!session?.user?.id) throw new Error("Not signed in");

      // Idempotent: if any open register exists for this user, reuse it.
      if (existingOpenRegister) {
        console.log("[SKIP_DUPLICATE_CREATE] register", existingOpenRegister.id);
        return existingOpenRegister.id as string;
      }

      const branchId = createdBranchId ?? existingBranches[0]?.id ?? null;
      const opening = Number(reg.opening_amount);
      if (Number.isNaN(opening) || opening < 0) throw new Error("Opening balance must be a positive number");
      const { data, error } = await supabase
        .from("cash_registers")
        .insert({
          tenant_id: tenantId,
          branch_id: branchId,
          user_id: session.user.id,
          register_name: reg.register_name.trim(),
          opening_amount: opening,
          status: "open",
        })
        .select("id")
        .single();
      if (error) throw error;
      return data.id as string;
    },
    onSuccess: () => {
      toast.success("Cash register ready");
      qc.invalidateQueries({ queryKey: ["onboarding-status", tenantId] });
      qc.invalidateQueries({ queryKey: ["setup-open-register", tenantId] });
      qc.invalidateQueries({ queryKey: ["active-register"] });
      setStep("done");
    },
    onError: (e: Error) => toast.error(localizePgError(t, e)),
  });

  // ---------- UI ----------
  const stepIdx = STEPS.findIndex((s) => s.key === step);
  const progress = ((stepIdx + 1) / STEPS.length) * 100;

  if (loading || !session) {
    return (
      <div className="grid min-h-screen place-items-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-muted/30 px-4 py-10">
      <div className="mx-auto max-w-2xl">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-semibold tracking-tight">Welcome to SohojPharma</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Let's get your pharmacy ready in a few quick steps.
          </p>
        </div>

        <div className="mb-6">
          <Progress value={progress} className="h-2" />
          <ol className="mt-3 flex items-center justify-between text-xs">
            {STEPS.map((s, i) => {
              const Icon = s.icon;
              const done = i < stepIdx;
              const active = i === stepIdx;
              return (
                <li key={s.key} className="flex flex-1 flex-col items-center gap-1">
                  <div
                    className={
                      "flex h-7 w-7 items-center justify-center rounded-full border " +
                      (done
                        ? "border-emerald-500 bg-emerald-500 text-white"
                        : active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-muted bg-background text-muted-foreground")
                    }
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                  </div>
                  <span className={active ? "font-medium" : "text-muted-foreground"}>{s.label}</span>
                </li>
              );
            })}
          </ol>
        </div>

        <Card>
          {step === "business" && (
            <>
              <CardHeader>
                <CardTitle>Business information</CardTitle>
                <CardDescription>Tell us about your pharmacy.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Business name" required>
                  <Input value={biz.name} onChange={(e) => setBiz({ ...biz, name: e.target.value })} placeholder="Acme Pharmacy" />
                </Field>
                <Field label="Phone">
                  <Input value={biz.phone} onChange={(e) => setBiz({ ...biz, phone: e.target.value })} placeholder="01XXXXXXXXX" />
                </Field>
                <Field label="Address">
                  <Textarea value={biz.address} onChange={(e) => setBiz({ ...biz, address: e.target.value })} rows={2} />
                </Field>
                <StepActions onNext={() => saveBiz.mutate()} loading={saveBiz.isPending} nextLabel="Continue" />
              </CardContent>
            </>
          )}

          {step === "branch" && (
            <>
              <CardHeader>
                <CardTitle>Add your first branch</CardTitle>
                <CardDescription>
                  {existingBranches.length > 0
                    ? `You already have ${existingBranches.length} branch — continue to warehouse setup.`
                    : "This is the physical location where you'll operate."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Branch name" required>
                  <Input value={branch.name} onChange={(e) => setBranch({ ...branch, name: e.target.value })} disabled={existingBranches.length > 0} />
                </Field>
                <Field label="Address">
                  <Textarea value={branch.address} onChange={(e) => setBranch({ ...branch, address: e.target.value })} rows={2} disabled={existingBranches.length > 0} />
                </Field>
                <Field label="Phone">
                  <Input value={branch.phone} onChange={(e) => setBranch({ ...branch, phone: e.target.value })} disabled={existingBranches.length > 0} />
                </Field>
                <StepActions
                  onBack={() => setStep("business")}
                  onNext={() => saveBranch.mutate()}
                  loading={saveBranch.isPending}
                  nextLabel={existingBranches.length > 0 ? "Continue" : "Create branch"}
                />
              </CardContent>
            </>
          )}

          {step === "warehouse" && (
            <>
              <CardHeader>
                <CardTitle>Create your warehouse</CardTitle>
                <CardDescription>
                  {existingWarehouses.length > 0
                    ? `You already have ${existingWarehouses.length} warehouse — continue to register setup.`
                    : "Inventory lives in warehouses. You can add more later."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Warehouse name" required>
                  <Input value={wh.name} onChange={(e) => setWh({ ...wh, name: e.target.value })} disabled={existingWarehouses.length > 0} />
                </Field>
                <Field label="Code" required>
                  <Input value={wh.code} onChange={(e) => setWh({ ...wh, code: e.target.value.toUpperCase() })} maxLength={16} disabled={existingWarehouses.length > 0} />
                </Field>
                <Field label="Address">
                  <Textarea value={wh.address} onChange={(e) => setWh({ ...wh, address: e.target.value })} rows={2} disabled={existingWarehouses.length > 0} />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={wh.isDefault}
                    onCheckedChange={(v) => setWh({ ...wh, isDefault: v === true })}
                    disabled={existingWarehouses.length > 0}
                  />
                  Set as default warehouse
                </label>
                <StepActions
                  onBack={() => setStep("branch")}
                  onNext={() => saveWarehouse.mutate()}
                  loading={saveWarehouse.isPending}
                  nextLabel={existingWarehouses.length > 0 ? "Continue" : "Create warehouse"}
                />
              </CardContent>
            </>
          )}

          {step === "register" && (
            <>
              <CardHeader>
                <CardTitle>Open a cash register</CardTitle>
                <CardDescription>
                  {existingOpenRegister
                    ? `You already have an open register (${existingOpenRegister.register_name}) — continue to finish setup.`
                    : "Sales must be made under an open register."}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Field label="Register name" required>
                  <Input value={reg.register_name} onChange={(e) => setReg({ ...reg, register_name: e.target.value })} disabled={!!existingOpenRegister} />
                </Field>
                <Field label="Opening balance">
                  <Input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.01"
                    value={reg.opening_amount}
                    onChange={(e) => setReg({ ...reg, opening_amount: e.target.value })}
                    disabled={!!existingOpenRegister}
                  />
                </Field>
                <StepActions
                  onBack={() => setStep("warehouse")}
                  onNext={() => saveRegister.mutate()}
                  loading={saveRegister.isPending}
                  nextLabel={existingOpenRegister ? "Continue" : "Open register"}
                />
              </CardContent>
            </>
          )}

          {step === "done" && (
            <>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <PartyPopper className="h-5 w-5 text-emerald-600" /> You're all set
                </CardTitle>
                <CardDescription>
                  Your pharmacy is ready to make sales. You can add more branches, warehouses, and
                  registers any time.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <SummaryRow label="Branches" value={String(Math.max(existingBranches.length, 1))} />
                <SummaryRow label="Warehouses" value={String(Math.max(existingWarehouses.length, createdWarehouseId ? 1 : 0))} />
                <SummaryRow label="Registers" value="1" />
                <div className="flex flex-wrap gap-2 pt-3">
                  <Button asChild>
                    <Link to="/sales/pos" search={{ edit: undefined, recall: undefined, ref: undefined }}>Go to POS</Link>
                  </Button>
                  <Button asChild variant="outline">
                    <Link to="/store">Go to Dashboard</Link>
                  </Button>
                </div>
              </CardContent>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      {children}
    </div>
  );
}

function StepActions({
  onBack,
  onNext,
  loading,
  nextLabel,
}: {
  onBack?: () => void;
  onNext: () => void;
  loading?: boolean;
  nextLabel: string;
}) {
  return (
    <div className="flex items-center justify-between pt-2">
      {onBack ? (
        <Button variant="ghost" onClick={onBack} disabled={loading}>
          Back
        </Button>
      ) : (
        <span />
      )}
      <Button onClick={onNext} disabled={loading}>
        {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
        {nextLabel}
        {!loading && <ChevronRight className="ml-1 h-4 w-4" />}
      </Button>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  );
}
