import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, CheckCircle2, XCircle, Printer, Send, AlertTriangle, Sparkles, RefreshCw, Pill } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useAuth } from "@/hooks/use-auth";
import { toast } from "sonner";
import ReactMarkdown from "react-markdown";
import {
  getPrescription, verifyPrescription, signedPrescriptionUrl,
  findAlternatives, summarizePrescription, getCustomerHistory,
} from "@/lib/api/prescriptions.functions";
import {
  checkPrescriptionInteractions, checkPrescriptionAllergies, validatePrescriptionDosage,
  acknowledgePrescriptionSafety, logSafetyWarnings,
  type InteractionAlert, type AllergyAlert, type DosageAlert,
} from "@/lib/api/clinical-safety.functions";
import { getActiveBusinessRules } from "@/lib/api/business-rules.functions";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { ShieldAlert, ShieldCheck } from "lucide-react";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/prescriptions/$id")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  component: PrescriptionDetail,
});

type Item = {
  id: string;
  raw_text: string;
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration_days: number | null;
  quantity: number;
  confidence: number;
  matched_product_id: string | null;
  products: { id: string; name: string; retail_price: number; generic_id: string | null; generics: { id: string; name: string } | null } | null;
};

function PrescriptionDetail() {

  const { t } = useTranslation();
  const { id } = Route.useParams();
  const { currentTenantId } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const get = useServerFn(getPrescription);
  const verify = useServerFn(verifyPrescription);
  const sign = useServerFn(signedPrescriptionUrl);
  const altFn = useServerFn(findAlternatives);
  const summarize = useServerFn(summarizePrescription);
  const historyFn = useServerFn(getCustomerHistory);
  const [imgUrl, setImgUrl] = useState<string | null>(null);
  const [altsFor, setAltsFor] = useState<string | null>(null);

  const q = useQuery({
    queryKey: ["prescription", id, currentTenantId],
    queryFn: () => get({ data: { id, tenantId: currentTenantId! } }),
    enabled: !!currentTenantId,
  });

  const rx = q.data?.prescription as (Record<string, unknown> & { id: string; image_path: string | null; ocr_text: string | null; status: string; ai_summary: string | null; customer_id: string | null; customers: { id: string; name: string; allergies: string | null } | null; patient_name: string | null; doctor_name: string | null; prescription_date: string | null; created_at: string }) | undefined;
  const items = (q.data?.items ?? []) as Item[];

  useEffect(() => {
    const path = rx?.image_path;
    if (!path) return;
    sign({ data: { path } }).then((r) => setImgUrl(r.url));
  }, [rx?.image_path, sign]);

  // Duplicate generic detection
  const duplicateGenerics = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const it of items) {
      const gid = it.products?.generic_id;
      const gname = it.products?.generics?.name;
      if (!gid || !gname) continue;
      const arr = map.get(gid) ?? [];
      arr.push(it.brand_name || it.raw_text);
      map.set(gid, arr);
    }
    return [...map.entries()]
      .filter(([, names]) => names.length > 1)
      .map(([gid, names]) => ({
        generic_id: gid,
        generic_name: items.find((i) => i.products?.generic_id === gid)?.products?.generics?.name ?? "",
        items: names,
      }));
  }, [items]);

  // Allergy collision (simple substring match between allergy list and medicine names/generics)
  const allergyHits = useMemo(() => {
    const allergies = rx?.customers?.allergies?.toLowerCase().split(/[,;\n]+/).map((s) => s.trim()).filter(Boolean) ?? [];
    if (!allergies.length) return [];
    const hits: { allergy: string; medicine: string }[] = [];
    for (const it of items) {
      const blob = [it.brand_name, it.generic_name, it.products?.name, it.products?.generics?.name].filter(Boolean).join(" ").toLowerCase();
      for (const a of allergies) {
        if (a && blob.includes(a)) hits.push({ allergy: a, medicine: it.brand_name || it.products?.name || it.raw_text });
      }
    }
    return hits;
  }, [items, rx?.customers?.allergies]);

  // Customer history
  const history = useQuery({
    queryKey: ["customer-history", rx?.customer_id, currentTenantId],
    queryFn: () => historyFn({ data: { tenantId: currentTenantId!, customer_id: rx!.customer_id! } }),
    enabled: !!currentTenantId && !!rx?.customer_id,
  });

  // Alternatives for one row
  const alts = useQuery({
    queryKey: ["alternatives", altsFor, currentTenantId],
    queryFn: () => {
      const it = items.find((i) => i.id === altsFor);
      return altFn({ data: { tenantId: currentTenantId!, generic_id: it?.products?.generic_id ?? null, exclude_product_id: it?.matched_product_id ?? null } });
    },
    enabled: !!altsFor && !!currentTenantId,
  });

  const summaryMutation = useMutation({
    mutationFn: () => summarize({ data: { tenantId: currentTenantId!, id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["prescription", id] }),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Summary failed"),
  });

  // Clinical Safety Engine — server-side checks
  const interactionsFn = useServerFn(checkPrescriptionInteractions);
  const allergyFn = useServerFn(checkPrescriptionAllergies);
  const dosageFn = useServerFn(validatePrescriptionDosage);
  const ackFn = useServerFn(acknowledgePrescriptionSafety);
  const logFn = useServerFn(logSafetyWarnings);

  const safetyItems = useMemo(() => items.map((i) => ({
    medicine: i.brand_name || i.products?.name || i.raw_text,
    generic: i.generic_name ?? i.products?.generics?.name ?? null,
    generic_id: i.products?.generic_id ?? null,
    strength: i.strength,
    frequency: i.frequency,
    duration_days: i.duration_days,
  })), [items]);

  const safety = useQuery({
    queryKey: ["clinical-safety", id, currentTenantId, items.length],
    enabled: !!currentTenantId && items.length > 0,
    queryFn: async () => {
      const gids = items.map((i) => i.products?.generic_id).filter((g): g is string => !!g);
      const gnames = items.map((i) => i.generic_name ?? i.products?.generics?.name).filter((g): g is string => !!g);
      const [interactions, allergies, dosage] = await Promise.all([
        interactionsFn({ data: { tenantId: currentTenantId!, generic_ids: gids, generic_names: gnames } }),
        allergyFn({ data: { tenantId: currentTenantId!, customer_id: rx?.customer_id ?? null, items: safetyItems.map(({ medicine, generic }) => ({ medicine, generic })) } }),
        dosageFn({ data: { tenantId: currentTenantId!, customer_id: rx?.customer_id ?? null, items: safetyItems } }),
      ]);
      return { interactions, allergies, dosage } as { interactions: InteractionAlert[]; allergies: AllergyAlert[]; dosage: DosageAlert[] };
    },
  });

  const rulesFn = useServerFn(getActiveBusinessRules);
  const businessRules = useQuery({
    queryKey: ["business-rules", currentTenantId],
    enabled: !!currentTenantId,
    queryFn: () => rulesFn({ data: { tenant_id: currentTenantId! } }),
  });
  const requireSafetyAck = businessRules.data?.require_safety_ack ?? true;

  const needsAck = useMemo(() => {
    if (!requireSafetyAck) return false;
    const i = safety.data?.interactions ?? [];
    const a = safety.data?.allergies ?? [];
    const d = safety.data?.dosage ?? [];
    return i.some((x) => x.severity === "major" || x.severity === "contraindicated")
      || a.some((x) => x.level === "critical")
      || d.some((x) => x.level === "critical");
  }, [safety.data, requireSafetyAck]);

  const alreadyAcked = !!(rx as { safety_ack_at?: string | null } | undefined)?.safety_ack_at;
  const [ackChecked, setAckChecked] = useState(false);
  const [ackNote, setAckNote] = useState("");
  const [ackBusy, setAckBusy] = useState(false);

  // Log warnings to audit trail once when surfaced
  useEffect(() => {
    if (!safety.data || !currentTenantId) return;
    const events = [
      ...safety.data.interactions.map((x) => ({ type: "interaction" as const, severity: x.severity, details: { generic_a: x.generic_a, generic_b: x.generic_b, effect: x.effect } })),
      ...safety.data.allergies.map((x) => ({ type: "allergy" as const, severity: x.level, details: { allergy: x.allergy, medicine: x.medicine } })),
      ...safety.data.dosage.map((x) => ({ type: "dosage" as const, severity: x.level, details: { medicine: x.medicine, reason: x.reason } })),
    ];
    if (events.length) logFn({ data: { tenantId: currentTenantId, prescription_id: id, events } }).catch(() => {});
  }, [safety.data, currentTenantId, id, logFn]);

  async function acknowledge() {
    if (!currentTenantId || !safety.data) return;
    if (!ackChecked || ackNote.trim().length < 3) { toast.error(t("clinical.ackRequired", "Acknowledgement and note required")); return; }
    setAckBusy(true);
    try {
      const events = [
        ...safety.data.interactions.filter((x) => x.severity === "major" || x.severity === "contraindicated")
          .map((x) => ({ type: "interaction" as const, severity: x.severity, details: { generic_a: x.generic_a, generic_b: x.generic_b } })),
        ...safety.data.allergies.filter((x) => x.level === "critical")
          .map((x) => ({ type: "allergy" as const, severity: x.level, details: { allergy: x.allergy, medicine: x.medicine } })),
        ...safety.data.dosage.filter((x) => x.level === "critical")
          .map((x) => ({ type: "dosage" as const, severity: x.level, details: { medicine: x.medicine, reason: x.reason } })),
      ];
      await ackFn({ data: { tenantId: currentTenantId, prescription_id: id, severity: "critical", note: ackNote.trim(), events } });
      toast.success(t("clinical.acked", "Safety review acknowledged"));
      qc.invalidateQueries({ queryKey: ["prescription", id] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setAckBusy(false);
    }
  }

  async function act(status: "verified" | "rejected" | "converted") {
    if (!currentTenantId) return;
    try {
      await verify({ data: { tenantId: currentTenantId, id, status } });
      qc.invalidateQueries({ queryKey: ["prescription", id] });
      qc.invalidateQueries({ queryKey: ["prescriptions"] });
      toast.success(`Marked ${status}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    }
  }

  function sendToPos() {
    if (needsAck && !alreadyAcked) {
      toast.error(t("clinical.ackBeforePos", "Acknowledge critical safety warnings before sending to POS"));
      return;
    }
    const cart = items.filter((i) => i.matched_product_id).map((i) => ({
      product_id: i.matched_product_id, qty: Number(i.quantity) || 1, note: i.dosage ?? "",
    }));
    if (!cart.length) { toast.error(t("toast.noMatchedProducts")); return; }
    sessionStorage.setItem("pc:pos:pending_cart", JSON.stringify(cart));
    navigate({ to: "/sales/pos", search: { edit: undefined, recall: undefined, ref: undefined } });
  }

  return (
    <AppShell variant="store" title="Prescription">
      <PageHeader
        title={rx?.patient_name || "Prescription"}
        description={rx ? `${rx.doctor_name || "Doctor unknown"} · ${rx.prescription_date || new Date(rx.created_at).toLocaleDateString()}` : "Loading…"}
        actions={
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" asChild><Link to="/prescriptions"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
            <Button variant="outline" size="sm" onClick={() => window.print()}><Printer className="h-4 w-4" /></Button>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-4">
          {/* Clinical Safety Review */}
          {safety.data && (safety.data.interactions.length + safety.data.allergies.length + safety.data.dosage.length > 0) && (
            <Card className="shadow-card border-l-4" style={{ borderLeftColor: needsAck ? "hsl(var(--destructive))" : "hsl(var(--warning, 38 92% 50%))" }}>
              <CardHeader className="flex flex-row items-center justify-between gap-2">
                <CardTitle className="text-base flex items-center gap-2">
                  {needsAck ? <ShieldAlert className="h-4 w-4 text-destructive" /> : <ShieldCheck className="h-4 w-4 text-amber-600" />}
                  {t("clinical.safetyReview", "Clinical Safety Review")}
                </CardTitle>
                {alreadyAcked && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> {t("clinical.acked", "Acknowledged")}</Badge>}
              </CardHeader>
              <CardContent className="space-y-3">
                {safety.data.interactions.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("clinical.interactions", "Drug interactions")}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {safety.data.interactions.map((x, idx) => (
                        <li key={idx} className={`rounded-md border p-2 ${x.level === "critical" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{x.generic_a} ⇄ {x.generic_b}</span>
                            <Badge variant={x.level === "critical" ? "destructive" : "secondary"} className="capitalize">{x.severity}</Badge>
                          </div>
                          {x.effect && <p className="text-xs text-muted-foreground">{x.effect}</p>}
                          {x.management && <p className="text-xs">{x.management}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {safety.data.allergies.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("clinical.allergies", "Allergy alerts")}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {safety.data.allergies.map((x, idx) => (
                        <li key={idx} className="rounded-md border border-destructive/40 bg-destructive/5 p-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{x.medicine}</span>
                            <Badge variant="destructive">{x.allergy}</Badge>
                          </div>
                          <p className="text-xs text-muted-foreground">{x.note}</p>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {safety.data.dosage.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold uppercase text-muted-foreground">{t("clinical.dosage", "Dosage warnings")}</p>
                    <ul className="mt-1 space-y-1 text-sm">
                      {safety.data.dosage.map((x, idx) => (
                        <li key={idx} className={`rounded-md border p-2 ${x.level === "critical" ? "border-destructive/40 bg-destructive/5" : "border-amber-500/40 bg-amber-500/5"}`}>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-medium">{x.medicine}</span>
                            <Badge variant={x.level === "critical" ? "destructive" : "secondary"} className="capitalize">{x.level}</Badge>
                          </div>
                          <p className="text-xs">{x.reason}</p>
                          {x.note && <p className="text-xs text-muted-foreground">{x.note}</p>}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {needsAck && !alreadyAcked && (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-3 space-y-2">
                    <p className="text-sm font-medium text-destructive">
                      {t("clinical.ackTitle", "Pharmacist acknowledgement required")}
                    </p>
                    <Textarea
                      placeholder={t("clinical.ackPlaceholder", "Clinical note (why dispensing is safe to proceed)…")}
                      value={ackNote}
                      onChange={(e) => setAckNote(e.target.value)}
                      rows={2}
                    />
                    <label className="flex items-start gap-2 text-xs">
                      <Checkbox checked={ackChecked} onCheckedChange={(v) => setAckChecked(!!v)} />
                      <span>{t("clinical.ackCheckbox", "I reviewed all warnings and accept clinical responsibility for dispensing.")}</span>
                    </label>
                    <div className="flex justify-end">
                      <Button size="sm" onClick={acknowledge} disabled={ackBusy || !ackChecked || ackNote.trim().length < 3}>
                        {t("clinical.acknowledge", "Acknowledge")}
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}


          {allergyHits.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Allergy alert</AlertTitle>
              <AlertDescription>
                Patient is allergic to <strong>{[...new Set(allergyHits.map((h) => h.allergy))].join(", ")}</strong>.
                Matching medicines on this prescription: {[...new Set(allergyHits.map((h) => h.medicine))].join(", ")}.
              </AlertDescription>
            </Alert>
          )}
          {duplicateGenerics.length > 0 && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Duplicate generic detected</AlertTitle>
              <AlertDescription>
                {duplicateGenerics.map((d) => (
                  <div key={d.generic_id}>
                    <strong>{d.generic_name}</strong> appears in: {d.items.join(", ")}
                  </div>
                ))}
              </AlertDescription>
            </Alert>
          )}

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">Medicines</CardTitle>
              {rx && <Badge variant="outline" className="capitalize">{rx.status}</Badge>}
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Prescribed</TableHead>
                      <TableHead>Matched</TableHead>
                      <TableHead className="w-32">Freq · Days</TableHead>
                      <TableHead className="w-16">Qty</TableHead>
                      <TableHead className="w-28">Confidence</TableHead>
                      <TableHead className="w-24" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((i) => (
                      <TableRow key={i.id}>
                        <TableCell>
                          <div className="text-sm font-medium">{i.brand_name || i.raw_text}</div>
                          <div className="text-xs text-muted-foreground">{[i.generic_name, i.strength, i.dosage].filter(Boolean).join(" · ")}</div>
                        </TableCell>
                        <TableCell className="text-sm">
                          {i.products?.name ?? <span className="italic text-muted-foreground">Unmatched</span>}
                        </TableCell>
                        <TableCell className="text-xs">
                          {(i.frequency || "—")}{i.duration_days ? ` × ${i.duration_days}d` : ""}
                        </TableCell>
                        <TableCell>{Number(i.quantity) || 1}</TableCell>
                        <TableCell className="text-xs tabular-nums">{Math.round(Number(i.confidence))}%</TableCell>
                        <TableCell>
                          {i.products?.generic_id && (
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-xs" onClick={() => setAltsFor(altsFor === i.id ? null : i.id)}>
                              <Pill className="h-3 w-3" /> Alt
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {altsFor && (
                <div className="mt-3 rounded-md border border-border bg-muted/30 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-sm font-medium">Same-generic alternatives</p>
                    <Button variant="ghost" size="sm" onClick={() => setAltsFor(null)}>Close</Button>
                  </div>
                  {alts.isLoading && <p className="text-xs text-muted-foreground">Searching…</p>}
                  {alts.data?.length === 0 && <p className="text-xs text-muted-foreground">No other products with the same generic.</p>}
                  <ul className="space-y-1 text-sm">
                    {alts.data?.map((a) => (
                      <li key={a.id} className="flex items-center justify-between">
                        <span>{a.name}</span>
                        <span className="text-xs text-muted-foreground">৳{Number(a.retail_price).toFixed(2)} · stock {a.stock_qty}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Button variant="outline" onClick={() => act("rejected")} className="gap-1"><XCircle className="h-4 w-4" /> Reject</Button>
                <Button variant="outline" onClick={() => act("verified")} className="gap-1"><CheckCircle2 className="h-4 w-4" /> Pharmacist verify</Button>
                <Button
                  onClick={sendToPos}
                  className="gap-1"
                  disabled={needsAck && !alreadyAcked}
                  title={needsAck && !alreadyAcked ? t("clinical.ackBeforePos", "Acknowledge critical safety warnings before sending to POS") : undefined}
                >
                  <Send className="h-4 w-4" /> Send to POS
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card className="shadow-card">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-base flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> AI summary</CardTitle>
              <Button size="sm" variant="outline" onClick={() => summaryMutation.mutate()} disabled={summaryMutation.isPending} className="gap-1">
                <RefreshCw className={`h-3 w-3 ${summaryMutation.isPending ? "animate-spin" : ""}`} />
                {rx?.ai_summary ? "Regenerate" : "Generate"}
              </Button>
            </CardHeader>
            <CardContent>
              {rx?.ai_summary ? (
                <div className="prose prose-sm max-w-none dark:prose-invert">
                  <ReactMarkdown>{rx.ai_summary}</ReactMarkdown>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No summary yet. Click Generate to get an AI review.</p>
              )}
            </CardContent>
          </Card>
        </section>

        <aside className="space-y-3">
          {rx?.customers && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">Patient</CardTitle></CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p className="font-medium">{rx.customers.name}</p>
                {rx.customers.allergies ? (
                  <div className="rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs">
                    <p className="font-medium text-destructive">Allergies</p>
                    <p>{rx.customers.allergies}</p>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground">No allergies recorded.</p>
                )}
                {history.data?.prescriptions && history.data.prescriptions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Previous prescriptions</p>
                    <ul className="mt-1 space-y-1 text-xs">
                      {history.data.prescriptions.slice(0, 5).map((p) => (
                        <li key={p.id} className="flex justify-between">
                          <span className="truncate">{p.doctor_name || "—"}</span>
                          <span className="text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {history.data?.frequent && history.data.frequent.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-muted-foreground">Frequent medicines</p>
                    <ul className="mt-1 space-y-0.5 text-xs">
                      {history.data.frequent.map((f, idx) => (
                        <li key={idx} className="flex justify-between"><span className="truncate">{f.name}</span><span className="text-muted-foreground">×{f.count}</span></li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="shadow-card">
            <CardHeader><CardTitle className="text-base">Prescription image</CardTitle></CardHeader>
            <CardContent>
              {imgUrl ? (
                <img src={imgUrl} alt="Prescription" className="w-full rounded-md border border-border bg-muted/30 object-contain" />
              ) : (
                <p className="text-sm text-muted-foreground">{rx?.image_path ? "Loading…" : "No image attached."}</p>
              )}
            </CardContent>
          </Card>
          {rx?.ocr_text && (
            <Card className="shadow-card">
              <CardHeader><CardTitle className="text-base">OCR text</CardTitle></CardHeader>
              <CardContent>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-muted/40 p-3 text-xs">{rx.ocr_text}</pre>
              </CardContent>
            </Card>
          )}
        </aside>
      </div>
    </AppShell>
  );
}
