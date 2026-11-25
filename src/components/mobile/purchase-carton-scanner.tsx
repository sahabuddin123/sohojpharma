import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Box, Camera, CheckCircle2, Loader2, Plus, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { buildProductDisplayName } from "@/lib/product-display";
import { toast } from "sonner";

export interface ScannedCartonResult {
  product: {
    id: string;
    name: string;
    purchase_price: number;
    retail_price: number;
  } | null;
  batch_no: string;
  expiry_date: string; // YYYY-MM-DD
  mrp: number | null;
}

interface PurchaseCartonScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  manufacturerId?: string | null;
  onScanned: (result: ScannedCartonResult) => void;
}

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function parseExpiryToIso(raw: string): string {
  const s = raw.trim();
  // e.g. "NOV 27" or "NOV-2027" or "DEC 2026"
  const m1 = s.match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-/]*(\d{2,4})\b/i);
  if (m1) {
    const mm = MONTHS[m1[1].slice(0, 3).toLowerCase()];
    const yy = m1[2].length === 2 ? `20${m1[2]}` : m1[2];
    if (mm) return `${yy}-${mm}-28`;
  }
  // e.g. "11/27" or "11-2027"
  const m2 = s.match(/\b(0?[1-9]|1[0-2])[\s\-/]+(\d{2,4})\b/);
  if (m2) {
    const mm = m2[1].padStart(2, "0");
    const yy = m2[2].length === 2 ? `20${m2[2]}` : m2[2];
    return `${yy}-${mm}-28`;
  }
  return "";
}

export function parseCartonOcrText(text: string): {
  batch_no: string;
  expiry_date: string;
  mrp: number | null;
  productQueries: string[];
} {
  let batch_no = "";
  let expiry_date = "";
  let mrp: number | null = null;

  // Batch No.
  const batchMatch = text.match(
    /(?:batch(?:\s*no\.?)?|b\.?\s*no\.?)\s*[:.\-\s]+([A-Z0-9][A-Z0-9\-/]{2,15})/i,
  );
  if (batchMatch) {
    batch_no = batchMatch[1].trim().toUpperCase();
  }

  // Exp. Date (avoid matching Mfg. Date)
  const expMatch = text.match(
    /(?:exp(?:iry)?(?:\s*date)?)\s*[:.\-\s]+([A-Z]{3,9}[\s\-/]*\d{2,4}|\d{1,2}[\s\-/]+\d{2,4})/i,
  );
  if (expMatch) {
    expiry_date = parseExpiryToIso(expMatch[1]);
  } else {
    // Fallback: look for month+year lines after Mfg
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
      if (/mfg/i.test(line)) continue;
      if (/exp/i.test(line)) {
        const parsed = parseExpiryToIso(line);
        if (parsed) {
          expiry_date = parsed;
          break;
        }
      }
    }
  }

  // MRP / Indicative Price
  const mrpMatch = text.match(
    /(?:indicative\s*price(?:\s*\(?tk\.?\)?)?|m\.?r\.?p\.?|price)\s*(?:\([^)]*\))?\s*[:.\-\s]*(?:tk\.?|৳)?\s*(\d+(?:\.\d{1,2})?)/i,
  );
  if (mrpMatch) {
    const val = Number(mrpMatch[1]);
    if (Number.isFinite(val) && val > 0) mrp = val;
  }

  // Candidate product name queries
  const skip = new Set([
    "batch", "mfg", "exp", "expiry", "date", "indicative", "price", "including",
    "vat", "mrp", "tablet", "capsule", "syrup", "injection", "pharma", "ltd",
  ]);
  const productQueries: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (/(?:batch|mfg|exp|indicative|price|vat)/i.test(line)) continue;
    const words = line
      .replace(/[^a-zA-Z0-9\s+-]/g, " ")
      .trim()
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !skip.has(w.toLowerCase()));
    if (words.length > 0) {
      productQueries.push(words.slice(0, 2).join(" "));
      if (words[0].length >= 3) productQueries.push(words[0]);
    }
  }

  return {
    batch_no,
    expiry_date,
    mrp,
    productQueries: Array.from(new Set(productQueries)).slice(0, 4),
  };
}

export function PurchaseCartonScanner({
  open,
  onOpenChange,
  tenantId,
  manufacturerId,
  onScanned,
}: PurchaseCartonScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("কার্টনের গায়ে থাকা Batch, Exp ও Price ক্যামেরার সামনে ধরুন");
  const [parsedFields, setParsedFields] = useState<{
    batch_no: string;
    expiry_date: string;
    mrp: number | null;
  } | null>(null);
  const [candidates, setCandidates] = useState<
    Array<{ id: string; name: string; purchase_price: number; retail_price: number }>
  >([]);

  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setParsedFields(null);
      setCandidates([]);
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setParsedFields(null);
    setCandidates([]);
    setStatusText("ক্যামেরা চালু হচ্ছে...");

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          setCameraReady(true);
          setStatusText("কার্টনের Batch, Exp ও MRP ফ্রেমে রেখে স্ক্যান বাটনে চাপুন");
        }
      } catch {
        setCameraError("ক্যামেরা চালু করা যায়নি। ব্রাউজার পারমিশন দিন।");
      }
    };
    void start();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  const searchProductsForCarton = async (queries: string[]) => {
    const found = new Map<
      string,
      { id: string; name: string; purchase_price: number; retail_price: number }
    >();

    for (const q of queries) {
      let queryBuilder = supabase
        .from("products")
        .select("id, name, strength, medicine_type, volume, pack_size, purchase_price, retail_price, manufacturer_id")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .ilike("name", `%${q}%`)
        .limit(6);
      if (manufacturerId) {
        queryBuilder = queryBuilder.eq("manufacturer_id", manufacturerId);
      }
      const { data } = await queryBuilder;
      for (const r of (data ?? []) as any[]) {
        if (!found.has(r.id)) {
          found.set(r.id, {
            id: r.id,
            name: buildProductDisplayName(r),
            purchase_price: Number(r.purchase_price ?? 0),
            retail_price: Number(r.retail_price ?? 0),
          });
        }
      }
      if (found.size >= 5) break;
    }
    return Array.from(found.values());
  };

  const handleScan = async () => {
    if (!videoRef.current || !canvasRef.current || busy) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    setBusy(true);
    setCandidates([]);
    setStatusText("কার্টনের তথ্য স্ক্যান করা হচ্ছে...");

    try {
      // 1. Check barcode first if supported
      let barcodeValue = "";
      const DetectorCtor = (window as any).BarcodeDetector;
      if (DetectorCtor) {
        try {
          const det = new DetectorCtor();
          const codes = await det.detect(canvas);
          if (codes?.[0]?.rawValue) barcodeValue = String(codes[0].rawValue).trim();
        } catch {
          // ignore
        }
      }

      // 2. Run Tesseract OCR for Batch, Exp, MRP, and Product Name
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(canvas);
      await worker.terminate();

      const parsed = parseCartonOcrText(data.text || "");
      setParsedFields({
        batch_no: parsed.batch_no,
        expiry_date: parsed.expiry_date,
        mrp: parsed.mrp,
      });

      const queries = barcodeValue ? [barcodeValue, ...parsed.productQueries] : parsed.productQueries;
      const matches = queries.length > 0 ? await searchProductsForCarton(queries) : [];

      if (matches.length === 1) {
        navigator.vibrate?.(60);
        onScanned({
          product: matches[0],
          batch_no: parsed.batch_no,
          expiry_date: parsed.expiry_date,
          mrp: parsed.mrp,
        });
        toast.success(`কার্টন স্ক্যান সম্পন্ন: ${matches[0].name}`);
        onOpenChange(false);
        return;
      }

      if (matches.length > 1) {
        setCandidates(matches);
        setStatusText("তালিকা থেকে সঠিক পণ্যটি সিলেক্ট করুন (ব্যাচ/মেয়াদ/MRP অটো বসবে):");
        return;
      }

      if (parsed.batch_no || parsed.expiry_date || parsed.mrp) {
        setStatusText("ব্যাচ/মেয়াদ/MRP পাওয়া গেছে! চাইলে পণ্য ছাড়াই প্রয়োগ করুন বা আবার স্ক্যান করুন।");
      } else {
        setStatusText("তথ্য স্পষ্ট পড়া যায়নি। আলোতে ধরে আবার চেষ্টা করুন।");
      }
    } catch (err) {
      console.error("[CartonScanner]", err);
      setStatusText("স্ক্যান করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-4 py-3 bg-[#0d5c46] text-white flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <Box className="h-5 w-5" />
            কার্টন স্ক্যান করুন
          </DialogTitle>
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-full p-1 hover:bg-white/15"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </DialogHeader>

        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          {cameraError ? (
            <div className="p-6 text-center text-sm text-rose-200">{cameraError}</div>
          ) : (
            <>
              <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-emerald-400 shadow-[0_0_25px_rgba(16,185,129,0.35)] flex flex-col justify-between p-2.5 bg-emerald-500/5">
                <span className="self-start rounded-full bg-black/65 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  Batch · Mfg · Exp · MRP
                </span>
                <div className="h-0.5 w-full bg-emerald-400/70 animate-pulse" />
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="p-4 space-y-3 bg-white">
          <p className="text-xs text-center font-medium text-slate-600">{statusText}</p>

          {parsedFields && (parsedFields.batch_no || parsedFields.expiry_date || parsedFields.mrp) && (
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-emerald-200 bg-emerald-50/60 p-2.5 text-center text-[11px]">
              <div>
                <p className="text-slate-500">ব্যাচ</p>
                <p className="font-bold text-slate-900">{parsedFields.batch_no || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">মেয়াদ</p>
                <p className="font-bold text-slate-900">{parsedFields.expiry_date || "—"}</p>
              </div>
              <div>
                <p className="text-slate-500">MRP</p>
                <p className="font-bold text-[#0d5c46]">
                  {parsedFields.mrp ? `৳${parsedFields.mrp}` : "—"}
                </p>
              </div>
            </div>
          )}

          {candidates.length > 0 && (
            <div className="max-h-36 overflow-y-auto space-y-1.5 rounded-xl border border-slate-200 bg-slate-50 p-2">
              {candidates.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    onScanned({
                      product: m,
                      batch_no: parsedFields?.batch_no ?? "",
                      expiry_date: parsedFields?.expiry_date ?? "",
                      mrp: parsedFields?.mrp ?? null,
                    });
                    onOpenChange(false);
                  }}
                  className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-xs hover:border-[#0d5c46]"
                >
                  <span className="font-bold text-slate-900 truncate">{m.name}</span>
                  <Plus className="h-4 w-4 shrink-0 text-[#0d5c46]" />
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleScan()}
              disabled={!cameraReady || busy}
              className="flex-1 h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-semibold gap-2"
            >
              {busy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  স্ক্যান হচ্ছে...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  কার্টন স্ক্যান করুন
                </>
              )}
            </Button>
            {parsedFields && (parsedFields.batch_no || parsedFields.expiry_date || parsedFields.mrp) && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  onScanned({
                    product: null,
                    batch_no: parsedFields.batch_no,
                    expiry_date: parsedFields.expiry_date,
                    mrp: parsedFields.mrp,
                  });
                  onOpenChange(false);
                }}
                className="h-11 rounded-xl px-3 text-xs font-semibold"
              >
                <CheckCircle2 className="h-4 w-4 mr-1 text-[#0d5c46]" />
                ব্যাচ বসান
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
