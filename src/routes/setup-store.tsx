import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { Loader2, Check, Store, Warehouse, UserCheck, Banknote, ArrowRight, ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/setup-store")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Store Setup — SohojPharma" }] }),
  component: SetupWizard,
});

type SetupStatus = {
  branches: { id: string; name: string; code: string; address: string | null; phone: string | null; is_main: boolean }[];
  warehouses: { id: string; name: string; code: string; branch_id: string | null; is_default: boolean }[];
  default_branch_id: string | null;
  member_default_branch_id: string | null;
  register_count: number;
  complete: boolean;
};

function SetupWizard() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const { data: status, isLoading } = useQuery({
    enabled: !!tenantId,
    queryKey: ["store-setup-status", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_store_setup_status" as never, { _tenant_id: tenantId } as never);
      if (error) throw error;
      return data as unknown as SetupStatus;
    },
  });

  const [step, setStep] = useState(0);
  const [branchId, setBranchId] = useState<string | "new">("new");
  const [branchName, setBranchName] = useState("Main Branch");
  const [branchAddress, setBranchAddress] = useState("");
  const [branchPhone, setBranchPhone] = useState("");
  const [warehouseId, setWarehouseId] = useState<string | "new">("new");
  const [warehouseName, setWarehouseName] = useState("Main Warehouse");
  const [createRegister, setCreateRegister] = useState(true);
  const [registerName, setRegisterName] = useState("Main Counter");
  const [registerOpening, setRegisterOpening] = useState("0");

  // Pre-fill when existing data loads
  useMemo(() => {
    if (!status) return;
    if (status.branches.length > 0) {
      const main = status.branches.find((b) => b.is_main) ?? status.branches[0];
      setBranchId(main.id);
      setBranchName(main.name);
      setBranchAddress(main.address ?? "");
      setBranchPhone(main.phone ?? "");
    }
    if (status.warehouses.length > 0) {
      const def = status.warehouses.find((w) => w.is_default) ?? status.warehouses[0];
      setWarehouseId(def.id);
      setWarehouseName(def.name);
    }
    if (status.register_count > 0) setCreateRegister(false);
  }, [status]);

  const setup = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("setup_store_basics" as never, {
        _tenant_id: tenantId,
        _branch_id: branchId === "new" ? null : branchId,
        _branch_name: branchName,
        _branch_address: branchAddress,
        _branch_phone: branchPhone,
        _warehouse_id: warehouseId === "new" ? null : warehouseId,
        _warehouse_name: warehouseName,
        _create_register: createRegister,
        _register_name: registerName,
        _register_opening: Number(registerOpening) || 0,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast.success("Store setup complete!");
      qc.invalidateQueries({ queryKey: ["store-setup-status"] });
      qc.invalidateQueries({ queryKey: ["warehouses-for-pos"] });
      qc.invalidateQueries({ queryKey: ["pos-search"] });
      qc.invalidateQueries({ queryKey: ["store-dashboard"] });
      navigate({ to: "/store" });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!tenantId) {
    return (
      <AppShell variant="store" title="Store Setup">
        <PageHeader title="No active pharmacy" description="Select a pharmacy first." />
      </AppShell>
    );
  }

  if (isLoading || !status) {
    return (
      <AppShell variant="store" title="Store Setup">
        <div className="flex h-64 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      </AppShell>
    );
  }

  const steps = [
    { label: "Branch", icon: Store },
    { label: "Warehouse", icon: Warehouse },
    { label: "Assign me", icon: UserCheck },
    { label: "Cash counter", icon: Banknote },
  ];

  return (
    <AppShell variant="store" title="Store Setup">
      <div className="mx-auto max-w-3xl space-y-6 pb-10">
        <PageHeader title="Store Setup Wizard" description="Branch, warehouse, and user assignment one shot e setup koro — POS & stock thik moto kaaj korbe." />

        {/* Stepper */}
        <div className="flex items-center justify-between gap-2">
          {steps.map((s, i) => {
            const Icon = s.icon;
            const active = i === step;
            const done = i < step;
            return (
              <div key={s.label} className="flex flex-1 items-center gap-2">
                <div className={`grid h-9 w-9 place-items-center rounded-full border ${done ? "border-success bg-success text-success-foreground" : active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-muted text-muted-foreground"}`}>
                  {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                </div>
                <span className={`text-xs font-medium ${active ? "text-foreground" : "text-muted-foreground"} hidden sm:inline`}>{s.label}</span>
                {i < steps.length - 1 && <div className={`h-px flex-1 ${done ? "bg-success" : "bg-border"}`} />}
              </div>
            );
          })}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">{steps[step].label}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {step === 0 && (
              <>
                {status.branches.length > 0 && (
                  <div className="space-y-2">
                    <Label>Existing branch use korbo</Label>
                    <div className="grid gap-2">
                      {status.branches.map((b) => (
                        <label key={b.id} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${branchId === b.id ? "border-primary bg-primary/5" : "border-border"}`}>
                          <input type="radio" checked={branchId === b.id} onChange={() => { setBranchId(b.id); setBranchName(b.name); setBranchAddress(b.address ?? ""); setBranchPhone(b.phone ?? ""); }} />
                          <span className="font-medium">{b.name}</span>
                          {b.is_main && <span className="text-xs text-success">(main)</span>}
                          <span className="ml-auto text-xs text-muted-foreground">{b.code}</span>
                        </label>
                      ))}
                      <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-2 text-sm ${branchId === "new" ? "border-primary bg-primary/5" : ""}`}>
                        <input type="radio" checked={branchId === "new"} onChange={() => setBranchId("new")} />
                        <span>+ Notun branch banao</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Branch name</Label>
                  <Input value={branchName} onChange={(e) => setBranchName(e.target.value)} placeholder="Main Branch" />
                </div>
                <div className="grid gap-2">
                  <Label>Address</Label>
                  <Input value={branchAddress} onChange={(e) => setBranchAddress(e.target.value)} />
                </div>
                <div className="grid gap-2">
                  <Label>Phone</Label>
                  <Input value={branchPhone} onChange={(e) => setBranchPhone(e.target.value)} />
                </div>
              </>
            )}

            {step === 1 && (
              <>
                {status.warehouses.length > 0 && (
                  <div className="space-y-2">
                    <Label>Existing warehouse use korbo</Label>
                    <div className="grid gap-2">
                      {status.warehouses.map((w) => (
                        <label key={w.id} className={`flex cursor-pointer items-center gap-2 rounded-md border p-2 text-sm ${warehouseId === w.id ? "border-primary bg-primary/5" : "border-border"}`}>
                          <input type="radio" checked={warehouseId === w.id} onChange={() => { setWarehouseId(w.id); setWarehouseName(w.name); }} />
                          <span className="font-medium">{w.name}</span>
                          {w.is_default && <span className="text-xs text-success">(default)</span>}
                          <span className="ml-auto text-xs text-muted-foreground">{w.code}</span>
                        </label>
                      ))}
                      <label className={`flex cursor-pointer items-center gap-2 rounded-md border border-dashed p-2 text-sm ${warehouseId === "new" ? "border-primary bg-primary/5" : ""}`}>
                        <input type="radio" checked={warehouseId === "new"} onChange={() => setWarehouseId("new")} />
                        <span>+ Notun warehouse banao</span>
                      </label>
                    </div>
                  </div>
                )}
                <div className="grid gap-2">
                  <Label>Warehouse name</Label>
                  <Input value={warehouseName} onChange={(e) => setWarehouseName(e.target.value)} placeholder="Main Warehouse" />
                </div>
                <p className="text-xs text-muted-foreground">Branch er sathe link kora hobe & default warehouse hishebe set hobe.</p>
              </>
            )}

            {step === 2 && (
              <div className="space-y-3 text-sm">
                <p>Apnar (current user) ke ei branch & warehouse e assign kora hobe jate POS / stock / inventory branch-RLS e block na hoy.</p>
                <div className="rounded-md border bg-muted/30 p-3 text-xs">
                  <div><b>Branch:</b> {branchName || "—"}</div>
                  <div><b>Warehouse:</b> {warehouseName || "—"}</div>
                </div>
                {status.member_default_branch_id && (
                  <p className="text-xs text-muted-foreground">Note: Apnar previous default branch overwrite hobe.</p>
                )}
              </div>
            )}

            {step === 3 && (
              <>
                <label className="flex cursor-pointer items-center gap-2 text-sm">
                  <Checkbox checked={createRegister} onCheckedChange={(c) => setCreateRegister(!!c)} />
                  Default cash counter open koro
                </label>
                {createRegister && (
                  <>
                    <div className="grid gap-2">
                      <Label>Counter name</Label>
                      <Input value={registerName} onChange={(e) => setRegisterName(e.target.value)} />
                    </div>
                    <div className="grid gap-2">
                      <Label>Opening cash (৳)</Label>
                      <Input type="number" value={registerOpening} onChange={(e) => setRegisterOpening(e.target.value)} />
                    </div>
                  </>
                )}
                {status.register_count > 0 && (
                  <p className="text-xs text-muted-foreground">Already {status.register_count} register exist kore. Notun ekta create korle existing gulor sathe parallel thakbe.</p>
                )}
              </>
            )}

            <div className="flex items-center justify-between pt-2">
              <Button variant="ghost" disabled={step === 0} onClick={() => setStep((s) => s - 1)}>
                <ArrowLeft className="mr-1 h-4 w-4" /> Back
              </Button>
              {step < steps.length - 1 ? (
                <Button onClick={() => setStep((s) => s + 1)}>
                  Next <ArrowRight className="ml-1 h-4 w-4" />
                </Button>
              ) : (
                <Button onClick={() => setup.mutate()} disabled={setup.isPending}>
                  {setup.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Finish setup
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
