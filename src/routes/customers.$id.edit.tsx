import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { updateCustomer } from "@/lib/api/customer-crud.functions";

export const Route = createFileRoute("/customers/$id/edit")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Edit Customer — SohojPharma" }] }),
  component: EditCustomerPage,
});

function EditCustomerPage() {
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const navigate = useNavigate();
  const fn = useServerFn(updateCustomer);

  const q = useQuery({
    queryKey: ["customer-edit", tenantId, id],
    enabled: !!tenantId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone,email,address,type,credit_limit,allergies")
        .eq("tenant_id", tenantId).eq("id", id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const [form, setForm] = useState({
    name: "", phone: "", email: "", type: "retail" as "retail" | "dealer" | "wholesale",
    address: "", credit_limit: 0, allergies: "",
  });

  useEffect(() => {
    if (q.data) {
      setForm({
        name: q.data.name ?? "",
        phone: q.data.phone ?? "",
        email: q.data.email ?? "",
        type: (q.data.type as typeof form.type) ?? "retail",
        address: q.data.address ?? "",
        credit_limit: Number(q.data.credit_limit ?? 0),
        allergies: q.data.allergies ?? "",
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q.data]);

  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, id, ...form, opening_balance: 0 } }),
    onSuccess: () => {
      toast.success("Customer updated");
      navigate({ to: "/customers/$id", params: { id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  if (q.isLoading) {
    return <AppShell variant="store" title="Edit Customer">
      <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
    </AppShell>;
  }
  if (!q.data) {
    return <AppShell variant="store" title="Edit Customer">
      <Card><CardContent className="py-10 text-center text-muted-foreground">Customer not found.</CardContent></Card>
    </AppShell>;
  }

  return (
    <AppShell variant="store" title="Edit Customer">
      <PageHeader
        title={`Edit: ${q.data.name}`}
        description="Update customer details. Opening balance can only be set on creation."
        actions={
          <Button variant="outline" asChild>
            <Link to="/customers/$id" params={{ id }}><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <Card className="shadow-card">
        <CardContent className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5"><Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Mobile *</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Customer Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as typeof form.type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="dealer">Dealer</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} /></div>
            <div className="space-y-1.5"><Label>Credit Limit (৳)</Label>
              <Input type="number" min={0} value={form.credit_limit}
                onChange={(e) => set("credit_limit", Number(e.target.value) || 0)} /></div>
            <div className="space-y-1.5 sm:col-span-2"><Label>Allergies / Medical Notes</Label>
              <Textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} /></div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" asChild>
              <Link to="/customers/$id" params={{ id }}>Cancel</Link>
            </Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending || !form.name.trim() || !form.phone.trim()}>
              {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
