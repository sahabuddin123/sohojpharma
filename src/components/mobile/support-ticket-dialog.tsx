import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LifeBuoy, Loader2, Send } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";

interface SupportTicketDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SupportTicketDialog({ open, onOpenChange }: SupportTicketDialogProps) {
  const { currentTenantId, user } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();

  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("technical");
  const [priority, setPriority] = useState("normal");
  const [body, setBody] = useState("");

  const { data: recentTickets = [] } = useQuery({
    queryKey: ["m-support-tickets", tenantId],
    enabled: open && !!tenantId,
    queryFn: async () => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id, subject, status, priority, created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(5);
      return data ?? [];
    },
  });

  const submitMut = useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("স্টোর পাওয়া যায়নি");
      if (!subject.trim()) throw new Error("সমস্যার বিষয় লিখুন");
      if (!body.trim()) throw new Error("সমস্যার বিস্তারিত লিখুন");

      const { data: ticket, error: tErr } = await supabase
        .from("support_tickets")
        .insert({
          tenant_id: tenantId,
          subject: subject.trim(),
          category,
          priority,
          status: "open",
          created_by: user?.id ?? null,
        })
        .select("id")
        .single();
      if (tErr || !ticket) throw new Error(tErr?.message || "টিকেট তৈরি করা যায়নি");

      const { error: mErr } = await supabase.from("support_ticket_messages").insert({
        ticket_id: ticket.id,
        author_id: user?.id ?? null,
        body: body.trim(),
        is_staff: false,
      });
      if (mErr) throw new Error(mErr.message);

      return ticket.id;
    },
    onSuccess: () => {
      toast.success("সাপোর্ট টিকেট সফলভাবে জমা হয়েছে! SaaS অ্যাডমিন শীঘ্রই দেখবেন।");
      setSubject("");
      setBody("");
      qc.invalidateQueries({ queryKey: ["m-support-tickets", tenantId] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto rounded-3xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-[#0d5c46]">
            <LifeBuoy className="h-5 w-5" />
            সাপোর্ট টিকেট (SaaS Admin)
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-1">
          <div className="space-y-1">
            <Label className="text-xs font-semibold">সমস্যার বিষয় *</Label>
            <Input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="যেমন: প্রিন্টার বা ইনভয়েস সংক্রান্ত সমস্যা"
              className="h-10 rounded-xl"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-semibold">ধরন</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="technical">টেকনিক্যাল</SelectItem>
                  <SelectItem value="pos">POS / ইনভয়েস</SelectItem>
                  <SelectItem value="inventory">ইনভেন্টরি</SelectItem>
                  <SelectItem value="billing">বিলিং / সাবস্ক্রিপশন</SelectItem>
                  <SelectItem value="general">সাধারণ</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1">
              <Label className="text-xs font-semibold">গুরুত্ব</Label>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-10 rounded-xl text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="normal">সাধারণ</SelectItem>
                  <SelectItem value="high">জরুরি</SelectItem>
                  <SelectItem value="urgent">অতি জরুরি</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1">
            <Label className="text-xs font-semibold">বিস্তারিত লিখুন *</Label>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="আপনার সমস্যাটি বিস্তারিত লিখুন..."
              className="rounded-xl"
            />
          </div>

          <Button
            type="button"
            onClick={() => submitMut.mutate()}
            disabled={submitMut.isPending}
            className="h-11 w-full rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-semibold gap-2"
          >
            {submitMut.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                জমা হচ্ছে...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                টিকেট সাবমিট করুন
              </>
            )}
          </Button>

          {recentTickets.length > 0 && (
            <div className="border-t border-slate-100 pt-3 space-y-1.5">
              <p className="text-[11px] font-bold text-slate-500">সাম্প্রতিক টিকেট</p>
              <div className="space-y-1.5">
                {recentTickets.map((t) => (
                  <div
                    key={t.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-xs"
                  >
                    <span className="font-medium text-slate-800 truncate">{t.subject}</span>
                    <span className="shrink-0 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-[#0d5c46] uppercase">
                      {t.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
