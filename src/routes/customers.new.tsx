import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
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
import { createCustomer } from "@/lib/api/customer-crud.functions";

export const Route = createFileRoute("/customers/new")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "New Customer — SohojPharma" }] }),
  component: NewCustomerPage,
});

function NewCustomerPage() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const navigate = useNavigate();
  const fn = useServerFn(createCustomer);

  const [form, setForm] = useState({
    name: "", phone: "", email: "", type: "retail" as "retail" | "dealer" | "wholesale",
    address: "", credit_limit: 0, opening_balance: 0, notes: "", allergies: "",
  });

  const m = useMutation({
    mutationFn: () => fn({ data: { tenantId, ...form } }),
    onSuccess: (c) => {
      toast.success("Customer created");
      navigate({ to: "/customers/$id", params: { id: c.id } });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((p) => ({ ...p, [k]: v }));

  return (
    <AppShell variant="store" title="New Customer">
      <PageHeader
        title="New Customer"
        description="Create a customer record. Mobile must be unique within your tenant."
        actions={
          <Button variant="outline" asChild>
            <Link to="/customers"><ArrowLeft className="mr-1.5 h-4 w-4" /> Back</Link>
          </Button>
        }
      />
      <Card className="shadow-card">
        <CardContent className="space-y-5 p-6">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Name *</Label>
              <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Mobile *</Label>
              <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Customer Type</Label>
              <Select value={form.type} onValueChange={(v) => set("type", v as typeof form.type)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">Retail</SelectItem>
                  <SelectItem value="dealer">Dealer</SelectItem>
                  <SelectItem value="wholesale">Wholesale</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Address</Label>
              <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Credit Limit (৳)</Label>
              <Input type="number" min={0} value={form.credit_limit}
                onChange={(e) => set("credit_limit", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5">
              <Label>Opening Due (৳)</Label>
              <Input type="number" min={0} value={form.opening_balance}
                onChange={(e) => set("opening_balance", Number(e.target.value) || 0)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Allergies / Medical Notes</Label>
              <Textarea rows={2} value={form.allergies} onChange={(e) => set("allergies", e.target.value)} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label>Notes</Label>
              <Textarea rows={2} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t border-border pt-4">
            <Button variant="outline" asChild><Link to="/customers">Cancel</Link></Button>
            <Button onClick={() => m.mutate()} disabled={m.isPending || !form.name.trim() || !form.phone.trim()}>
              {m.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              Save Customer
            </Button>
          </div>
        </CardContent>
      </Card>
    </AppShell>
  );
}
