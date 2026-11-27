import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, Save, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { createCustomer, updateCustomer } from "@/lib/api/customer-crud.functions";
import { queueCustomerCreate } from "@/lib/offline/queue";
import { isOfflineNetworkError } from "@/lib/offline/warm-cache";

type Mode = "create" | "edit";

type Props = {
  mode: Mode;
  customerId?: string | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSaved?: () => void;
};

type FormState = {
  // Basic
  name: string;
  phone: string;
  email: string;
  type: "retail" | "dealer" | "wholesale";
  // Financial
  opening_balance: number;
  credit_limit: number;
  payment_terms_days: number;
  // Address
  address: string;
  area: string;
  district: string;
  division: string;
  postal_code: string;
  country: string;
  // Medical
  date_of_birth: string;
  gender: string;
  blood_group: string;
  allergies: string;
  chronic_diseases: string;
  doctor_reference: string;
  // Additional
  nid_passport: string;
  notes: string;
  is_active: boolean;
};

const EMPTY: FormState = {
  name: "", phone: "", email: "", type: "retail",
  opening_balance: 0, credit_limit: 0, payment_terms_days: 0,
  address: "", area: "", district: "", division: "", postal_code: "", country: "",
  date_of_birth: "", gender: "", blood_group: "",
  allergies: "", chronic_diseases: "", doctor_reference: "",
  nid_passport: "", notes: "", is_active: true,
};

const SELECT_COLS =
  "id,name,phone,email,type,address,area,district,division,postal_code,country," +
  "credit_limit,opening_balance,due_balance,payment_terms_days,customer_code," +
  "date_of_birth,gender,blood_group,allergies,chronic_diseases,doctor_reference," +
  "nid_passport,notes,is_active";

export function CustomerFormDialog({ mode, customerId, open, onOpenChange, onSaved }: Props) {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const createFn = useServerFn(createCustomer);
  const updateFn = useServerFn(updateCustomer);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [tab, setTab] = useState("basic");

  const isEdit = mode === "edit";

  const q = useQuery({
    queryKey: ["customer-form", tenantId, customerId],
    enabled: isEdit && !!tenantId && !!customerId && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select(SELECT_COLS)
        .eq("tenant_id", tenantId).eq("id", customerId!).maybeSingle();
      if (error) throw error;
      return data as Record<string, unknown> | null;
    },
  });

  useEffect(() => {
    if (!open) {
      setTab("basic");
      if (!isEdit) setForm(EMPTY);
      return;
    }
    if (isEdit && q.data) {
      const d = q.data;
      const str = (k: string) => (d[k] as string | null) ?? "";
      const num = (k: string) => Number((d[k] as number | null) ?? 0);
      setForm({
        name: str("name"),
        phone: str("phone"),
        email: str("email"),
        type: ((d.type as FormState["type"]) ?? "retail"),
        opening_balance: num("opening_balance"),
        credit_limit: num("credit_limit"),
        payment_terms_days: num("payment_terms_days"),
        address: str("address"),
        area: str("area"),
        district: str("district"),
        division: str("division"),
        postal_code: str("postal_code"),
        country: str("country"),
        date_of_birth: str("date_of_birth"),
        gender: str("gender"),
        blood_group: str("blood_group"),
        allergies: str("allergies"),
        chronic_diseases: str("chronic_diseases"),
        doctor_reference: str("doctor_reference"),
        nid_passport: str("nid_passport"),
        notes: str("notes"),
        is_active: (d.is_active as boolean | null) ?? true,
      });
    }
  }, [open, isEdit, q.data]);

  const currentDue = isEdit
    ? Number((q.data?.due_balance as number | null) ?? 0)
    : form.opening_balance;
  const customerCode = isEdit ? ((q.data?.customer_code as string | null) ?? "—") : "Auto-generated";

  const invalidateAll = () => {
    qc.invalidateQueries({ queryKey: ["customers-list"] });
    qc.invalidateQueries({ queryKey: ["customer", tenantId, customerId] });
    qc.invalidateQueries({ queryKey: ["customer-form", tenantId, customerId] });
    qc.invalidateQueries({ queryKey: ["customer-edit", tenantId, customerId] });
  };

  const m = useMutation({
    mutationFn: async () => {
      const payload = { tenantId, ...form };
      if (isEdit) {
        if (!customerId) throw new Error("Missing customer id");
        return updateFn({ data: { ...payload, id: customerId } });
      }
      const saveOffline = async () => {
        const res = await queueCustomerCreate({
          tenant_id: tenantId,
          name: form.name.trim(),
          phone: form.phone.trim(),
          email: form.email.trim() || null,
          type: form.type,
          opening_balance: form.opening_balance,
          credit_limit: form.credit_limit,
          address: form.address.trim() || null,
          area: form.area.trim() || null,
          district: form.district.trim() || null,
          notes: form.notes.trim() || null,
        });
        toast.info("অফলাইনে কাস্টমার সেভ হয়েছে — অনলাইনে এলে সিঙ্ক হবে");
        return res;
      };
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        return await saveOffline();
      }
      try {
        return await createFn({ data: payload });
      } catch (err) {
        if (isOfflineNetworkError(err)) {
          return await saveOffline();
        }
        throw err;
      }
    },
    onSuccess: () => {
      if (typeof navigator === "undefined" || navigator.onLine) {
        toast.success(isEdit ? "Customer updated" : "Customer created");
      }
      invalidateAll();
      onSaved?.();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const loading = isEdit && (q.isLoading || !q.data);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Edit Customer" : "New Customer"}</DialogTitle>
          <DialogDescription>
            {isEdit ? "Update customer profile." : "Create a complete customer profile."}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <Tabs value={tab} onValueChange={setTab} className="w-full">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="basic">Basic</TabsTrigger>
              <TabsTrigger value="financial">Financial</TabsTrigger>
              <TabsTrigger value="address">Address</TabsTrigger>
              <TabsTrigger value="medical">Medical</TabsTrigger>
              <TabsTrigger value="additional">Additional</TabsTrigger>
            </TabsList>

            {/* BASIC */}
            <TabsContent value="basic" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Customer Name *</Label>
                <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Mobile Number *</Label>
                <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Email</Label>
                <Input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Customer Type</Label>
                <Select value={form.type} onValueChange={(v) => set("type", v as FormState["type"])}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="retail">Retail</SelectItem>
                    <SelectItem value="dealer">Dealer</SelectItem>
                    <SelectItem value="wholesale">Wholesale</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Customer Code</Label>
                <Input value={customerCode} readOnly className="bg-muted font-mono" />
              </div>
            </TabsContent>

            {/* FINANCIAL */}
            <TabsContent value="financial" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Opening Balance (৳)</Label>
                <Input
                  type="number" min={0} value={form.opening_balance}
                  disabled={isEdit}
                  title={isEdit ? "Set only on creation" : ""}
                  onChange={(e) => set("opening_balance", Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Credit Limit (৳)</Label>
                <Input
                  type="number" min={0} value={form.credit_limit}
                  onChange={(e) => set("credit_limit", Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Payment Terms (Days)</Label>
                <Input
                  type="number" min={0} value={form.payment_terms_days}
                  onChange={(e) => set("payment_terms_days", Number(e.target.value) || 0)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Current Due (৳)</Label>
                <Input value={currentDue.toLocaleString()} readOnly className="bg-muted" />
              </div>
            </TabsContent>

            {/* ADDRESS */}
            <TabsContent value="address" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Address Line</Label>
                <Input value={form.address} onChange={(e) => set("address", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Area</Label>
                <Input value={form.area} onChange={(e) => set("area", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>District</Label>
                <Input value={form.district} onChange={(e) => set("district", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Division</Label>
                <Input value={form.division} onChange={(e) => set("division", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Postal Code</Label>
                <Input value={form.postal_code} onChange={(e) => set("postal_code", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Country</Label>
                <Input value={form.country} onChange={(e) => set("country", e.target.value)} />
              </div>
            </TabsContent>

            {/* MEDICAL */}
            <TabsContent value="medical" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Date of Birth</Label>
                <Input type="date" value={form.date_of_birth}
                  onChange={(e) => set("date_of_birth", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Gender</Label>
                <Select value={form.gender || "unset"} onValueChange={(v) => set("gender", v === "unset" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    <SelectItem value="male">Male</SelectItem>
                    <SelectItem value="female">Female</SelectItem>
                    <SelectItem value="other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Blood Group</Label>
                <Select value={form.blood_group || "unset"} onValueChange={(v) => set("blood_group", v === "unset" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unset">—</SelectItem>
                    {["A+","A-","B+","B-","AB+","AB-","O+","O-"].map((g) => (
                      <SelectItem key={g} value={g}>{g}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Doctor Reference</Label>
                <Input value={form.doctor_reference}
                  onChange={(e) => set("doctor_reference", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Allergies</Label>
                <Textarea rows={2} value={form.allergies}
                  onChange={(e) => set("allergies", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Chronic Diseases</Label>
                <Textarea rows={2} value={form.chronic_diseases}
                  onChange={(e) => set("chronic_diseases", e.target.value)} />
              </div>
            </TabsContent>

            {/* ADDITIONAL */}
            <TabsContent value="additional" className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label>NID / Passport</Label>
                <Input value={form.nid_passport}
                  onChange={(e) => set("nid_passport", e.target.value)} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label>Notes</Label>
                <Textarea rows={3} value={form.notes}
                  onChange={(e) => set("notes", e.target.value)} />
              </div>
              <div className="flex items-center justify-between rounded-md border p-3 sm:col-span-2">
                <div>
                  <Label>Status</Label>
                  <p className="text-xs text-muted-foreground">
                    {form.is_active ? "Active customer" : "Inactive — hidden from list"}
                  </p>
                </div>
                <Switch checked={form.is_active}
                  onCheckedChange={(v) => set("is_active", v)} />
              </div>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={() => m.mutate()}
            disabled={m.isPending || loading || !form.name.trim() || !form.phone.trim()}
          >
            {m.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              : isEdit ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
            {isEdit ? "Save Changes" : "Create Customer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
