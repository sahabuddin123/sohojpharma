import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useState, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Camera, Upload, Loader2, ScanLine, CheckCircle2, AlertCircle, FileText, Sparkles } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useActiveBranch } from "@/hooks/use-active-branch";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  extractPrescription,
  matchPrescriptionItems,
  createPrescription,
  listPrescriptions,
} from "@/lib/api/prescriptions.functions";

export const Route = createFileRoute("/prescriptions/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  component: PrescriptionsIndex,
});

type MatchRow = {
  raw_text: string;
  brand_name?: string | null;
  generic_name?: string | null;
  strength?: string | null;
  dosage?: string | null;
  quantity?: number | null;
  product_id: string | null;
  name: string;
  confidence: number;
  status: "auto" | "review" | "manual" | "unmatched" | "approved" | "rejected";
};

function PrescriptionsIndex() {
  const { t } = useTranslation();
  const { currentTenantId } = useAuth();
  const { branchId } = useActiveBranch();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);

  const extract = useServerFn(extractPrescription);
  const match = useServerFn(matchPrescriptionItems);
  const create = useServerFn(createPrescription);
  const listFn = useServerFn(listPrescriptions);

  const [preview, setPreview] = useState<string | null>(null);
  const [fileKind, setFileKind] = useState<"image" | "pdf">("image");
  const [busy, setBusy] = useState<"idle" | "uploading" | "ocr" | "matching" | "saving">("idle");
  const [meta, setMeta] = useState<{ patient_name?: string | null; doctor_name?: string | null; prescription_date?: string | null; ocr_text?: string }>({});
  const [items, setItems] = useState<MatchRow[]>([]);
  const [imagePath, setImagePath] = useState<string | null>(null);

  const history = useQuery({
    queryKey: ["prescriptions", currentTenantId],
    queryFn: () => listFn({ data: { tenantId: currentTenantId! } }),
    enabled: !!currentTenantId,
  });

  function reset() {
    setPreview(null); setItems([]); setMeta({}); setImagePath(null); setBusy("idle");
  }

  async function onPickFile(file: File) {
    if (!currentTenantId) { toast.error(t("pages.prescriptions.errNoPharmacy")); return; }
    reset();
    const kind: "image" | "pdf" = file.type === "application/pdf" ? "pdf" : "image";
    setFileKind(kind);

    // preview (images only)
    if (kind === "image") {
      const r = new FileReader();
      r.onload = () => setPreview(r.result as string);
      r.readAsDataURL(file);
    }

    try {
      setBusy("uploading");
      const path = `${currentTenantId}/${crypto.randomUUID()}-${file.name}`;
      const { error } = await supabase.storage.from("prescriptions").upload(path, file, { upsert: false });
      if (error) throw error;
      setImagePath(path);

      if (kind === "pdf") {
        toast.info(t("pages.prescriptions.errPdfOcr"));
        setBusy("idle");
        return;
      }

      // Convert to data URL for AI (cheap & works for small images)
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result as string);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });

      setBusy("ocr");
      const ex = await extract({ data: { imageUrl: dataUrl } });
      setMeta({
        patient_name: ex.patient_name,
        doctor_name: ex.doctor_name,
        prescription_date: ex.prescription_date,
        ocr_text: ex.ocr_text,
      });

      if (!ex.items.length) {
        toast.warning(t("pages.prescriptions.warnNoMedicines"));
        setBusy("idle");
        return;
      }

      setBusy("matching");
      const matched = await match({
        data: {
          tenantId: currentTenantId,
          items: ex.items.map((i) => ({
            raw_text: i.raw_text,
            brand_name: i.brand_name ?? null,
            generic_name: i.generic_name ?? null,
            strength: i.strength ?? null,
          })),
        },
      });

      setItems(
        ex.items.map((it, idx) => ({
          ...it,
          ...matched[idx],
        })) as MatchRow[],
      );
      toast.success(t("pages.prescriptions.extracted", { n: ex.items.length }));
      setBusy("idle");
    } catch (err) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : t("pages.prescriptions.failProcess"));
      setBusy("idle");
    }
  }

  async function save(thenGoToPos = false) {
    if (!currentTenantId) return;
    if (!branchId) { toast.error("Please select a branch first."); return; }
    if (items.length === 0) { toast.error(t("pages.prescriptions.nothingToSave")); return; }
    try {
      setBusy("saving");
      const { id } = await create({
        data: {
          tenantId: currentTenantId,
          branch_id: branchId,
          image_path: imagePath,
          file_kind: fileKind,
          patient_name: meta.patient_name ?? null,
          doctor_name: meta.doctor_name ?? null,
          prescription_date: meta.prescription_date ?? null,
          ocr_text: meta.ocr_text ?? null,
          items: items.map((i) => ({
            raw_text: i.raw_text,
            brand_name: i.brand_name ?? null,
            generic_name: i.generic_name ?? null,
            strength: i.strength ?? null,
            dosage: i.dosage ?? null,
            quantity: i.quantity ?? 1,
            matched_product_id: i.product_id,
            confidence: i.confidence,
            status: i.status,
          })),
        },
      });
      qc.invalidateQueries({ queryKey: ["prescriptions"] });

      if (thenGoToPos) {
        // Hand off to POS via sessionStorage
        sessionStorage.setItem(
          "pc:pos:pending_cart",
          JSON.stringify(items.filter((i) => i.product_id).map((i) => ({
            product_id: i.product_id,
            qty: i.quantity ?? 1,
            note: i.dosage ?? "",
          }))),
        );
        toast.success(t("pages.prescriptions.savedOpenPos"));
        navigate({ to: "/sales/pos", search: { edit: undefined, recall: undefined, ref: undefined } });
      } else {
        toast.success(t("pages.prescriptions.saved"));
        navigate({ to: "/prescriptions/$id", params: { id } });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("pages.prescriptions.failSave"));
      setBusy("idle");
    }
  }

  return (
    <AppShell variant="store" title={t("pages.prescriptions.title")}>
      <PageHeader
        title={t("pages.prescriptions.title")}
        description={t("pages.prescriptions.desc")}
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" asChild>
              <Link to="/prescriptions/new"><FileText className="h-4 w-4 mr-1" /> {t("pages.prescriptions.newManual", "Manual entry")}</Link>
            </Button>
            <Badge variant="secondary" className="gap-1"><Sparkles className="h-3 w-3" /> {t("pages.prescriptions.poweredBy")}</Badge>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <section className="space-y-6">
          {/* Upload / scan */}
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">{t("pages.prescriptions.uploadTitle")}</CardTitle>
              <CardDescription>{t("pages.prescriptions.uploadDesc")}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => cameraRef.current?.click()} disabled={busy !== "idle"} className="gap-2">
                  <Camera className="h-4 w-4" /> {t("pages.prescriptions.camera")}
                </Button>
                <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={busy !== "idle"} className="gap-2">
                  <Upload className="h-4 w-4" /> {t("pages.prescriptions.uploadBtn")}
                </Button>
                {preview && (
                  <Button variant="ghost" onClick={reset} disabled={busy !== "idle"}>{t("pages.prescriptions.clear")}</Button>
                )}
                <input
                  ref={cameraRef} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
                />
                <input
                  ref={inputRef} type="file" accept="image/jpeg,image/png,application/pdf" className="hidden"
                  onChange={(e) => e.target.files?.[0] && onPickFile(e.target.files[0])}
                />
              </div>

              {busy !== "idle" && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {busy === "uploading" && t("pages.prescriptions.busyUploading")}
                  {busy === "ocr" && t("pages.prescriptions.busyOcr")}
                  {busy === "matching" && t("pages.prescriptions.busyMatching")}
                  {busy === "saving" && t("pages.prescriptions.busySaving")}
                </div>
              )}

              {preview && (
                <div className="mt-4 overflow-hidden rounded-md border border-border">
                  <img src={preview} alt="Prescription preview" className="max-h-[420px] w-full object-contain bg-muted/30" />
                </div>
              )}
              {!preview && fileKind === "pdf" && imagePath && (
                <div className="mt-4 flex items-center gap-2 rounded-md border border-border p-3 text-sm">
                  <FileText className="h-4 w-4 text-primary" /> {t("pages.prescriptions.pdfUploaded")}
                </div>
              )}
            </CardContent>
          </Card>

          {/* OCR meta */}
          {(meta.patient_name || meta.doctor_name || meta.prescription_date) && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t("pages.prescriptions.extractedTitle")}</CardTitle>
                <CardDescription>{t("pages.prescriptions.extractedDesc")}</CardDescription>
              </CardHeader>
              <CardContent className="grid gap-3 sm:grid-cols-3">
                <div>
                  <Label className="text-xs">{t("pages.prescriptions.patientName")}</Label>
                  <Input value={meta.patient_name ?? ""} onChange={(e) => setMeta((m) => ({ ...m, patient_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptions.doctorName")}</Label>
                  <Input value={meta.doctor_name ?? ""} onChange={(e) => setMeta((m) => ({ ...m, doctor_name: e.target.value }))} />
                </div>
                <div>
                  <Label className="text-xs">{t("pages.prescriptions.rxDate")}</Label>
                  <Input type="date" value={meta.prescription_date ?? ""} onChange={(e) => setMeta((m) => ({ ...m, prescription_date: e.target.value }))} />
                </div>
              </CardContent>
            </Card>
          )}

          {/* Match table */}
          {items.length > 0 && (
            <Card className="shadow-card">
              <CardHeader>
                <CardTitle className="text-base">{t("pages.prescriptions.matchTitle")}</CardTitle>
                <CardDescription>
                  <span className="inline-flex items-center gap-3 text-xs">
                    <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3 text-emerald-600" /> {t("pages.prescriptions.autoLabel")}</span>
                    <span className="inline-flex items-center gap-1"><AlertCircle className="h-3 w-3 text-amber-600" /> {t("pages.prescriptions.reviewLabel")}</span>
                    <span className="inline-flex items-center gap-1"><ScanLine className="h-3 w-3 text-rose-600" /> {t("pages.prescriptions.manualLabel")}</span>
                  </span>
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="overflow-x-auto rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>{t("pages.prescriptions.colPrescribed")}</TableHead>
                        <TableHead>{t("pages.prescriptions.colMatched")}</TableHead>
                        <TableHead className="w-24">{t("pages.prescriptions.colQty")}</TableHead>
                        <TableHead className="w-32">{t("pages.prescriptions.colConfidence")}</TableHead>
                        <TableHead className="w-24">{t("pages.prescriptions.colStatus")}</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {items.map((it, i) => (
                        <TableRow key={i}>
                          <TableCell>
                            <div className="text-sm font-medium">{it.brand_name || it.raw_text}</div>
                            <div className="text-xs text-muted-foreground">{[it.generic_name, it.strength, it.dosage].filter(Boolean).join(" · ")}</div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {it.product_id ? it.name : <span className="text-muted-foreground italic">{t("pages.prescriptions.noMatch")}</span>}
                          </TableCell>
                          <TableCell>
                            <Input
                              type="number" min={1}
                              value={it.quantity ?? 1}
                              onChange={(e) => {
                                const v = Number(e.target.value) || 1;
                                setItems((prev) => prev.map((p, idx) => idx === i ? { ...p, quantity: v } : p));
                              }}
                              className="h-8 w-20"
                            />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                                <div
                                  className={`h-full ${it.confidence >= 95 ? "bg-emerald-500" : it.confidence >= 80 ? "bg-amber-500" : "bg-rose-500"}`}
                                  style={{ width: `${Math.min(100, it.confidence)}%` }}
                                />
                              </div>
                              <span className="text-xs tabular-nums">{Math.round(it.confidence)}%</span>
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge variant={it.status === "auto" ? "default" : it.status === "review" ? "secondary" : "outline"} className="capitalize">
                              {it.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>

                <Separator />
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <Button variant="outline" onClick={() => save(false)} disabled={busy !== "idle"}>
                    {t("pages.prescriptions.saveBtn")}
                  </Button>
                  <Button onClick={() => save(true)} disabled={busy !== "idle"} className="gap-2">
                    {t("pages.prescriptions.sendPos")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  {t("pages.prescriptions.pharmacistNote")}
                </p>
              </CardContent>
            </Card>
          )}
        </section>

        {/* History sidebar */}
        <aside className="space-y-3">
          <Card className="shadow-card">
            <CardHeader>
              <CardTitle className="text-base">{t("pages.prescriptions.recent")}</CardTitle>
              <CardDescription>{t("pages.prescriptions.recentDesc")}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              {history.isLoading && <p className="text-sm text-muted-foreground">{t("pages.prescriptions.loading")}</p>}
              {history.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("pages.prescriptions.noneYet")}</p>}
              {history.data?.map((p) => (
                <Link
                  key={p.id} to="/prescriptions/$id" params={{ id: p.id }}
                  className="flex items-start justify-between rounded-md border border-border p-2 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.patient_name || t("pages.prescriptions.walkIn")}</p>
                    <p className="truncate text-xs text-muted-foreground">{p.doctor_name || "—"}</p>
                    <p className="text-[11px] text-muted-foreground">{new Date(p.created_at).toLocaleString()}</p>
                  </div>
                  <Badge variant="outline" className="ml-2 capitalize">{p.status}</Badge>
                </Link>
              ))}
            </CardContent>
          </Card>
        </aside>
      </div>
    </AppShell>
  );
}
