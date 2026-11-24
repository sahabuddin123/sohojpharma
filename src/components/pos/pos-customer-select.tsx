import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ChevronsUpDown, Plus, User } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

type CustomerType = "retail" | "dealer" | "wholesale";
export type CustomerRow = {
  id: string;
  name: string;
  phone: string | null;
  type: CustomerType;
  due_balance: number;
};

const TYPE_LABEL_KEY: Record<CustomerType, string> = {
  retail: "ipos.retailType",
  dealer: "ipos.dealerType",
  wholesale: "ipos.wholesaleType",
};
const TYPE_DISCOUNT: Record<CustomerType, number> = { retail: 0, dealer: 10, wholesale: 5 };

export function POSCustomerSelect({
  value, onChange,
}: { value: CustomerRow | null; onChange: (c: CustomerRow | null) => void }) {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const [open, setOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);

  const { data: customers = [] } = useQuery({
    queryKey: ["pos-customers", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customers")
        .select("id,name,phone,type,due_balance")
        .eq("tenant_id", tenantId).eq("is_active", true)
        .order("name").limit(500);
      if (error) throw error;
      return (data ?? []) as CustomerRow[];
    },
    enabled: !!tenantId,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <User className="h-4 w-4 text-muted-foreground shrink-0" />
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <Button variant="outline" role="combobox" className="h-9 flex-1 justify-between font-normal">
              <span className="truncate">
                {value ? value.name : t("ipos.walkInCustomer")}
                {value?.phone && <span className="ml-1 text-xs text-muted-foreground">· {value.phone}</span>}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 opacity-50 shrink-0" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
            <Command
              filter={(v, search) => {
                const q = search.toLowerCase();
                return v.toLowerCase().includes(q) ? 1 : 0;
              }}
            >
              <CommandInput placeholder={t("ipos.searchCustomerPh")} />
              <CommandList>
                <CommandEmpty>{t("ipos.noCustomerFound")}</CommandEmpty>
                <CommandGroup>
                  <CommandItem value="walk-in walkin" onSelect={() => { onChange(null); setOpen(false); }}>
                    <Check className={`mr-2 h-4 w-4 ${!value ? "opacity-100" : "opacity-0"}`} />
                    {t("ipos.walkInCustomer")}
                  </CommandItem>
                  {customers.map((c) => (
                    <CommandItem
                      key={c.id}
                      value={`${c.name} ${c.phone ?? ""}`}
                      onSelect={() => { onChange(c); setOpen(false); }}
                    >
                      <Check className={`mr-2 h-4 w-4 ${value?.id === c.id ? "opacity-100" : "opacity-0"}`} />
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{c.name}</div>
                        <div className="text-xs text-muted-foreground">{c.phone ?? "—"} · {t(TYPE_LABEL_KEY[c.type])}</div>
                      </div>
                      {Number(c.due_balance) > 0 && (
                        <Badge variant="outline" className="ml-2 text-warning border-warning/40">
                          ৳ {Number(c.due_balance).toFixed(0)}
                        </Badge>
                      )}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0"
          aria-label={t("ipos.addCustomerAria")}
          onClick={() => setCreateOpen(true)}
        >
          <Plus className="h-4 w-4" />
        </Button>
      </div>

      {value && (
        <div className="flex flex-wrap gap-1.5 text-xs">
          <Badge variant="outline">{t(TYPE_LABEL_KEY[value.type])}</Badge>
          <Badge variant="outline" className={Number(value.due_balance) > 0 ? "text-warning border-warning/40" : ""}>
            {t("ipos.dueBadge", { amt: Number(value.due_balance).toFixed(2) })}
          </Badge>
          {TYPE_DISCOUNT[value.type] > 0 && (
            <Badge variant="outline" className="text-success border-success/40">
              {t("ipos.percentDiscount", { n: TYPE_DISCOUNT[value.type] })}
            </Badge>
          )}
        </div>
      )}

      <QuickCreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        tenantId={tenantId}
        onCreated={(c) => onChange(c)}
      />
    </div>
  );
}

function QuickCreateDialog({
  open, onOpenChange, tenantId, onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  tenantId: string;
  onCreated: (c: CustomerRow) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [type, setType] = useState<CustomerType>("retail");
  const [address, setAddress] = useState("");
  const [email, setEmail] = useState("");
  const [opening, setOpening] = useState("");
  const [notes, setNotes] = useState("");

  function reset() {
    setName(""); setPhone(""); setType("retail");
    setAddress(""); setEmail(""); setOpening(""); setNotes("");
  }

  const cleanPhone = useMemo(() => phone.trim().replace(/\s+/g, ""), [phone]);

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error(t("toast.customerNameRequired"));
      if (!cleanPhone) throw new Error(t("toast.mobileRequired"));
      if (cleanPhone.length < 6 || cleanPhone.length > 20) throw new Error(t("toast.mobileInvalid"));
      if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(t("toast.emailInvalid"));

      const { data: dup } = await supabase
        .from("customers").select("id,name")
        .eq("tenant_id", tenantId).eq("phone", cleanPhone).maybeSingle();
      if (dup) throw new Error(t("toast.mobileTaken", { name: dup.name }));

      const opening_balance = Number(opening) || 0;
      const { data, error } = await supabase
        .from("customers")
        .insert({
          tenant_id: tenantId,
          name: name.trim(),
          phone: cleanPhone,
          type,
          address: address.trim() || null,
          email: email.trim() || null,
          due_balance: opening_balance,
          credit_limit: 0,
        })
        .select("id,name,phone,type,due_balance")
        .single();
      if (error) throw new Error(error.message);
      if (notes.trim()) {
        await supabase.from("audit_log").insert({
          tenant_id: tenantId,
          action: "customer.create.quick",
          entity_table: "customers",
          entity_id: data.id,
          after_data: { notes: notes.trim() } as never,
        });
      }
      return data as CustomerRow;
    },
    onSuccess: (c) => {
      toast.success(t("toast.customerCreated", { name: c.name }));
      qc.invalidateQueries({ queryKey: ["pos-customers", tenantId] });
      onCreated(c);
      reset();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>{t("dialog.addNewCustomer")}</DialogTitle></DialogHeader>

        <div className="space-y-3">
          <Field label={t("ipos.customerNameStar")}>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={100} autoFocus placeholder={t("ipos.customerNamePh")} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ipos.mobileStar")}>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder={t("ipos.mobilePh")} />
            </Field>
            <Field label={t("ipos.customerType")}>
              <Select value={type} onValueChange={(v) => setType(v as CustomerType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="retail">{t("ipos.retailType")}</SelectItem>
                  <SelectItem value="dealer">{t("ipos.dealerType")}</SelectItem>
                  <SelectItem value="wholesale">{t("ipos.wholesaleType")}</SelectItem>
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label={t("ipos.addressLbl")}>
            <Input value={address} onChange={(e) => setAddress(e.target.value)} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t("ipos.emailLbl")}>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={120} />
            </Field>
            <Field label={t("ipos.openingBalance")}>
              <Input type="number" step="0.01" value={opening} onChange={(e) => setOpening(e.target.value)} />
            </Field>
          </div>
          <Field label={t("ipos.notesLbl")}>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("ipos.cancelBtn")}</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? t("ipos.saving") : t("ipos.saveCustomer")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><Label className="text-xs">{label}</Label>{children}</div>;
}
