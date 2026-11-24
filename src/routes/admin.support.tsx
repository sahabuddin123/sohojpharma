import { createFileRoute } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Send, MessageSquare } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { StatCard } from "@/components/dashboard/stat-card";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Inbox, CheckCircle2, Clock, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin/support")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Support — Super Admin" }] }),
  component: SupportPage,
});

interface Ticket {
  id: string;
  tenant: string;
  subject: string;
  preview: string;
  status: "Open" | "Pending" | "Solved" | "Closed";
  priority: "Low" | "Medium" | "High";
  updated: string;
}

const tickets: Ticket[] = [
  { id: "TCK-204", tenant: "MedPlus", subject: "Invoice print issue", preview: "When I print an invoice on thermal…", status: "Open", priority: "High", updated: "2m ago" },
  { id: "TCK-205", tenant: "Lazz Pharma", subject: "Add user limit", preview: "Can we increase user limit to 20…", status: "Pending", priority: "Medium", updated: "1h ago" },
  { id: "TCK-206", tenant: "Care Pharmacy", subject: "bKash payment stuck", preview: "Made a bKash payment but plan didn't…", status: "Open", priority: "High", updated: "3h ago" },
  { id: "TCK-207", tenant: "RxOne", subject: "How to export CSV?", preview: "Step by step instructions…", status: "Solved", priority: "Low", updated: "yesterday" },
  { id: "TCK-208", tenant: "Apollo", subject: "API key rotation", preview: "Need to rotate the API key…", status: "Closed", priority: "Low", updated: "2d ago" },
];

function SupportPage() {
  const { t } = useTranslation();
  const [active, setActive] = useState<Ticket>(tickets[0]);
  const [tab, setTab] = useState("all");

  const list = tab === "all" ? tickets : tickets.filter((tk) => tk.status.toLowerCase() === tab);

  return (
    <AppShell variant="admin" title={t("nav.support")}>
      <PageHeader title={t("admin.support.title")} description={t("admin.support.desc")} />

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label={t("admin.support.open")} value="14" icon={Inbox} tone="primary" />
        <StatCard label={t("admin.support.pending")} value="6" icon={Clock} tone="warning" />
        <StatCard label={t("admin.support.solvedMo")} value="84" icon={CheckCircle2} tone="success" />
        <StatCard label={t("admin.support.closed")} value="42" icon={XCircle} tone="secondary" />
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-[360px_minmax(0,1fr)]">
        <Card className="shadow-card">
          <CardContent className="p-3">
            <Tabs value={tab} onValueChange={setTab}>
              <TabsList className="w-full">
                <TabsTrigger value="all" className="flex-1">{t("admin.support.all")}</TabsTrigger>
                <TabsTrigger value="open" className="flex-1">{t("admin.support.open")}</TabsTrigger>
                <TabsTrigger value="pending" className="flex-1">{t("admin.support.pending")}</TabsTrigger>
                <TabsTrigger value="solved" className="flex-1">{t("admin.support.solved")}</TabsTrigger>
              </TabsList>
            </Tabs>
            <ul className="mt-3 space-y-1">
              {list.map((tk) => (
                <li key={tk.id}>
                  <button
                    onClick={() => setActive(tk)}
                    className={cn(
                      "w-full rounded-lg p-3 text-left transition-colors",
                      active.id === tk.id ? "bg-primary-soft" : "hover:bg-muted/60",
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <Avatar className="h-7 w-7"><AvatarFallback className="bg-primary/10 text-[10px] font-semibold text-primary">{tk.tenant[0]}</AvatarFallback></Avatar>
                      <p className="min-w-0 flex-1 truncate text-sm font-semibold">{tk.tenant}</p>
                      <span className="text-[10px] text-muted-foreground">{tk.updated}</span>
                    </div>
                    <p className="mt-1 truncate text-sm">{tk.subject}</p>
                    <p className="truncate text-xs text-muted-foreground">{tk.preview}</p>
                    <div className="mt-2 flex gap-1.5">
                      <TicketStatus status={tk.status} />
                      <Badge variant="outline" className="text-[10px]">{tk.priority}</Badge>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card className="flex flex-col shadow-card">
          <div className="flex items-center justify-between border-b border-border p-4">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-semibold">{active.subject}</h2>
                <TicketStatus status={active.status} />
              </div>
              <p className="text-xs text-muted-foreground">{active.tenant} · {active.id}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm">{t("admin.support.assign")}</Button>
              <Button size="sm">{t("admin.support.markSolved")}</Button>
            </div>
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto p-4">
            <Message who="customer" name={active.tenant}>{active.preview}</Message>
            <Message who="agent" name="Support">Hi! Thanks for reaching out — could you share a screenshot?</Message>
          </div>

          <div className="border-t border-border p-3">
            <div className="flex items-end gap-2">
              <Textarea placeholder={t("admin.support.replyPh")} className="min-h-[60px] resize-none" />
              <Button size="icon"><Send className="h-4 w-4" /></Button>
            </div>
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MessageSquare className="h-3 w-3" /> {t("admin.support.liveChat")}
            </p>
          </div>
        </Card>
      </div>
    </AppShell>
  );
}

function Message({ who, name, children }: { who: "customer" | "agent"; name: string; children: React.ReactNode }) {
  const isAgent = who === "agent";
  return (
    <div className={cn("flex gap-3", isAgent && "flex-row-reverse")}>
      <Avatar className="h-8 w-8">
        <AvatarFallback className={cn("text-xs font-semibold", isAgent ? "bg-primary text-primary-foreground" : "bg-muted")}>
          {name[0]}
        </AvatarFallback>
      </Avatar>
      <div className={cn("max-w-md rounded-2xl px-4 py-2.5 text-sm", isAgent ? "bg-primary text-primary-foreground" : "bg-muted")}>
        <p className="mb-1 text-[10px] font-semibold opacity-80">{name}</p>
        {children}
      </div>
    </div>
  );
}

function TicketStatus({ status }: { status: Ticket["status"] }) {
  const { t } = useTranslation();
  const map = {
    Open: "border-info/30 bg-info/10 text-info",
    Pending: "border-warning/30 bg-warning/10 text-warning",
    Solved: "border-success/30 bg-success/10 text-success",
    Closed: "border-muted-foreground/30 bg-muted text-muted-foreground",
  };
  const labels: Record<Ticket["status"], string> = {
    Open: t("admin.support.open"),
    Pending: t("admin.support.pending"),
    Solved: t("admin.support.solved"),
    Closed: t("admin.support.closed"),
  };
  return <Badge variant="outline" className={cn("text-[10px]", map[status])}>{labels[status]}</Badge>;
}
