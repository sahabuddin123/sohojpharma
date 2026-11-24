import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { RouteErrorPanel } from "@/components/route-error";
import { useAuth } from "@/hooks/use-auth";
import { listCampaigns, createCampaign, sendCampaign } from "@/lib/api/customer-settings.functions";
import { Loader2, Plus, Send } from "lucide-react";

export const Route = createFileRoute("/customers/campaigns")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Customer Campaigns — SohojPharma" }] }),
  component: Page,
});

const SEGMENTS = [
  "all", "vip", "dealer", "wholesale", "retail", "inactive", "due", "birthday_month",
] as const;
const CHANNELS = ["in_app", "sms", "whatsapp", "email"] as const;
type Channel = (typeof CHANNELS)[number];
type Segment = (typeof SEGMENTS)[number];

function Page() {
  const { currentTenantId } = useAuth();
  const tenantId = currentTenantId ?? "";
  const qc = useQueryClient();
  const listFn = useServerFn(listCampaigns);
  const createFn = useServerFn(createCampaign);
  const sendFn = useServerFn(sendCampaign);

  const q = useQuery({
    queryKey: ["campaigns", tenantId],
    queryFn: () => listFn({ data: { tenantId } }),
    enabled: !!tenantId,
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", channel: "in_app" as Channel, segment: "all" as Segment, message: "", scheduledAt: "",
  });

  const createMut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          tenantId,
          name: form.name,
          channel: form.channel,
          segment: form.segment,
          message: form.message,
          scheduledAt: form.scheduledAt || undefined,
        },
      }),
    onSuccess: () => {
      toast.success("Campaign created");
      setOpen(false);
      setForm({ name: "", channel: "in_app", segment: "all", message: "", scheduledAt: "" });
      qc.invalidateQueries({ queryKey: ["campaigns", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const sendMut = useMutation({
    mutationFn: (id: string) => sendFn({ data: { tenantId, campaignId: id } }),
    onSuccess: (r) => {
      toast.success(`Sent to ${r.recipient_count} customers`);
      qc.invalidateQueries({ queryKey: ["campaigns", tenantId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <AppShell variant="store">
      <PageHeader
        title="Marketing Campaigns"
        description="Send in-app messages to customer segments (SMS/WhatsApp/Email require integration setup)"
        actions={
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button><Plus className="mr-2 h-4 w-4" />New Campaign</Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader><DialogTitle>New Campaign</DialogTitle></DialogHeader>
              <div className="grid gap-3">
                <div><Label>Name</Label><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Channel</Label>
                    <Select value={form.channel} onValueChange={(v) => setForm({ ...form, channel: v as Channel })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CHANNELS.map((c) => <SelectItem key={c} value={c}>{c.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Segment</Label>
                    <Select value={form.segment} onValueChange={(v) => setForm({ ...form, segment: v as Segment })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {SEGMENTS.map((s) => <SelectItem key={s} value={s}>{s.replace("_", " ")}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div><Label>Message</Label><Textarea rows={4} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} /></div>
                <div><Label>Schedule (optional)</Label><Input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} /></div>
              </div>
              <DialogFooter>
                <Button onClick={() => createMut.mutate()} disabled={createMut.isPending || !form.name || !form.message}>
                  {createMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card>
        <CardHeader><CardTitle>Campaign History</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead><TableHead>Channel</TableHead><TableHead>Segment</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Recipients</TableHead>
                <TableHead>Sent At</TableHead><TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data ?? []).map((c) => (
                <TableRow key={c.id}>
                  <TableCell>
                    <div className="font-medium">{c.name}</div>
                    <div className="text-xs text-muted-foreground line-clamp-1">{c.message}</div>
                  </TableCell>
                  <TableCell><Badge variant="outline">{c.channel.replace("_", " ")}</Badge></TableCell>
                  <TableCell><Badge variant="outline">{c.segment.replace("_", " ")}</Badge></TableCell>
                  <TableCell>
                    <Badge variant={c.status === "sent" ? "default" : "secondary"}>{c.status}</Badge>
                  </TableCell>
                  <TableCell className="text-right">{c.recipient_count}</TableCell>
                  <TableCell className="text-xs">{c.sent_at ? new Date(c.sent_at).toLocaleString() : "—"}</TableCell>
                  <TableCell className="text-right">
                    {c.status !== "sent" && (
                      <Button size="sm" onClick={() => sendMut.mutate(c.id)} disabled={sendMut.isPending}>
                        <Send className="mr-1 h-3 w-3" />Send
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {(q.data ?? []).length === 0 && (
                <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-6">No campaigns yet.</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </AppShell>
  );
}
