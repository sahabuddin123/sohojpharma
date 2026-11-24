import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useTranslation } from "react-i18next";
import { AppShell } from "@/components/layout/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { listSmsTemplates } from "@/lib/api/subscriptions.functions";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/sms")({
  component: AdminSmsPage,
  errorComponent: ({ error }) => <div className="p-6 text-destructive">{error instanceof Error ? error.message : "Something went wrong"}</div>,
  notFoundComponent: () => <div className="p-6">Not found</div>,
});

function AdminSmsPage() {
  const { t, i18n } = useTranslation();
  const tplFn = useServerFn(listSmsTemplates);
  const { data: templates = [] } = useQuery({ queryKey: ["sms-templates"], queryFn: () => tplFn() });
  const { data: queue = [] } = useQuery({
    queryKey: ["sms-queue"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_queue")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const { data: logs = [] } = useQuery({
    queryKey: ["sms-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("sms_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw new Error(error.message);
      return data ?? [];
    },
  });
  const fmt = (d?: string | null) => (d ? new Date(d).toLocaleString(i18n.language) : "—");
  const lang = i18n.language?.startsWith("bn") ? "bn" : "en";

  return (
    <AppShell variant="admin" title={t("saas.sms.title")}>
      <Card>
        <CardHeader><CardTitle>{t("saas.sms.title")}</CardTitle></CardHeader>
        <CardContent>
          <Tabs defaultValue="templates">
            <TabsList>
              <TabsTrigger value="templates">{t("saas.sms.tabs.templates")}</TabsTrigger>
              <TabsTrigger value="queue">{t("saas.sms.tabs.queue")}</TabsTrigger>
              <TabsTrigger value="logs">{t("saas.sms.tabs.logs")}</TabsTrigger>
            </TabsList>
            <TabsContent value="templates">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("saas.sms.code")}</TableHead>
                  <TableHead>{t("saas.sms.body")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(templates as any[]).map((tpl) => (
                    <TableRow key={tpl.id}>
                      <TableCell><Badge>{tpl.code}</Badge></TableCell>
                      <TableCell className="whitespace-pre-wrap">{lang === "bn" ? tpl.body_bn : tpl.body_en}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="queue">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("saas.sms.created")}</TableHead>
                  <TableHead>{t("saas.sms.code")}</TableHead>
                  <TableHead>{t("saas.sms.to")}</TableHead>
                  <TableHead>{t("saas.sms.status")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(queue as any[]).map((q) => (
                    <TableRow key={q.id}>
                      <TableCell>{fmt(q.created_at)}</TableCell>
                      <TableCell>{q.template_code}</TableCell>
                      <TableCell>{q.to_number}</TableCell>
                      <TableCell><Badge variant="outline">{q.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
            <TabsContent value="logs">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>{t("saas.sms.created")}</TableHead>
                  <TableHead>{t("saas.sms.code")}</TableHead>
                  <TableHead>{t("saas.sms.to")}</TableHead>
                  <TableHead>{t("saas.sms.status")}</TableHead>
                </TableRow></TableHeader>
                <TableBody>
                  {(logs as any[]).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell>{fmt(l.created_at)}</TableCell>
                      <TableCell>{l.template_code}</TableCell>
                      <TableCell>{l.to_number}</TableCell>
                      <TableCell><Badge variant="outline">{l.status}</Badge></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </AppShell>
  );
}
