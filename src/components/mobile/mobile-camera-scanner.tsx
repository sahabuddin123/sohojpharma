import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, CheckCircle2, Loader2, Plus, ScanBarcode, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { findCachedProductByBarcode, searchCachedProducts } from "@/lib/offline/db";
import { toast } from "sonner";

export interface ScannedProductMatch {
  product_id: string;
  name: string;
  form: string | null;
  strength: string | null;
  cost: number;
  price: number;
  vat_rate: number;
  stock: number;
}

interface MobileCameraScannerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tenantId: string;
  onAddProduct: (product: ScannedProductMatch) => void;
}

const NOISE_WORDS = new Set([
  "tablet", "tablets", "tab", "capsule", "capsules", "cap", "syrup", "susp",
  "suspension", "injection", "inj", "drops", "cream", "ointment", "gel",
  "strip", "box", "pack", "batch", "mfg", "exp", "mrp", "price", "date",
  "ltd", "limited", "pharma", "pharmaceuticals", "bangladesh", "usp", "bp",
  "ip", "each", "film", "coated", "contains", "store", "keep", "out", "reach",
  "children", "only", "for", "use", "oral", "mg", "ml", "gm", "mcg", "iu",
]);

function extractCandidateQueries(ocrText: string): string[] {
  const lines = ocrText
    .split(/\r?\n/)
    .map((l) => l.replace(/[^a-zA-Z0-9\s+-]/g, " ").trim())
    .filter((l) => l.length >= 3);

  const candidates: string[] = [];
  for (const line of lines) {
    const words = line
      .split(/\s+/)
      .filter((w) => w.length >= 3 && !/^\d+$/.test(w) && !NOISE_WORDS.has(w.toLowerCase()));
    if (words.length > 0) {
      candidates.push(words.slice(0, 2).join(" "));
      if (words[0].length >= 3) candidates.push(words[0]);
    }
  }
  return Array.from(new Set(candidates)).slice(0, 5);
}

export function MobileCameraScanner({
  open,
  onOpenChange,
  tenantId,
  onAddProduct,
}: MobileCameraScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastCodeRef = useRef<{ code: string; at: number }>({ code: "", at: 0 });

  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [ocrBusy, setOcrBusy] = useState(false);
  const [statusText, setStatusText] = useState("বক্সের বারকোড ক্যামেরার সামনে ধরুন অথবা স্ট্রিপ/বক্স স্ক্যান করুন");
  const [matches, setMatches] = useState<ScannedProductMatch[]>([]);
  const [hasBarcodeApi, setHasBarcodeApi] = useState(false);

  const mapRow = (p: any): ScannedProductMatch => ({
    product_id: p.id,
    name: p.name,
    form: p.medicine_type ?? null,
    strength: p.strength ?? null,
    cost: Number(p.purchase_price ?? 0),
    price: Number(p.effective_price ?? p.retail_price ?? 0),
    vat_rate: Number(p.vat_rate ?? 0),
    stock: Number(p.qty_on_hand ?? 0),
  });

  const lookupByBarcode = async (code: string) => {
    const clean = code.trim();
    if (!clean || !tenantId) return;

    // Cooldown for same code (1.8s)
    const now = Date.now();
    if (lastCodeRef.current.code === clean && now - lastCodeRef.current.at < 1800) {
      return;
    }
    lastCodeRef.current = { code: clean, at: now };

    setStatusText(`বারকোড পাওয়া গেছে: ${clean} — খোঁজা হচ্ছে...`);

    let rows: ScannedProductMatch[] = [];
    if (typeof navigator !== "undefined" && !navigator.onLine) {
      const hit = await findCachedProductByBarcode(tenantId, clean);
      if (hit) {
        rows = [{ product_id: hit.id, name: hit.name, form: hit.form ?? null, strength: hit.strength ?? null, cost: hit.cost, price: hit.price, vat_rate: hit.vat_rate, stock: hit.stock }];
      }
    } else {
      try {
        const { data } = await supabase.rpc("search_products" as never, {
          _tenant_id: tenantId,
          _query: clean,
          _branch_id: null,
          _limit: 5,
          _warehouse_id: null,
          _offset: 0,
        } as never);
        rows = ((data ?? []) as any[]).map(mapRow);
      } catch {
        const hit = await findCachedProductByBarcode(tenantId, clean);
        if (hit) {
          rows = [{ product_id: hit.id, name: hit.name, form: hit.form ?? null, strength: hit.strength ?? null, cost: hit.cost, price: hit.price, vat_rate: hit.vat_rate, stock: hit.stock }];
        }
      }
    }
    if (rows.length > 0) {
      navigator.vibrate?.(60);
      onAddProduct(rows[0]);
      toast.success(`POS-এ যোগ হয়েছে: ${rows[0].name}`);
      setStatusText(`যোগ হয়েছে: ${rows[0].name}`);
      setMatches([]);
    } else {
      setStatusText(`"${clean}" বারকোডে কোনো পণ্য পাওয়া যায়নি`);
      toast.error(`বারকোড "${clean}" পাওয়া যায়নি`);
    }
  };

  useEffect(() => {
    if (!open) {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
      setCameraReady(false);
      setMatches([]);
      return;
    }

    let cancelled = false;
    setCameraError(null);
    setMatches([]);
    setStatusText("ক্যামেরা চালু হচ্ছে...");

    const init = async () => {
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
          setStatusText("বারকোড ধরলে অটো যোগ হবে, অথবা নিচের বাটনে স্ট্রিপ/বক্স স্ক্যান করুন");
        }
      } catch {
        setCameraError("ক্যামেরা চালু করা যায়নি। অনুগ্রহ করে ব্রাউজারে ক্যামেরা পারমিশন দিন।");
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open]);

  // Continuous BarcodeDetector loop when supported
  useEffect(() => {
    if (!open || !cameraReady) return;
    const DetectorCtor = (window as any).BarcodeDetector;
    if (!DetectorCtor) {
      setHasBarcodeApi(false);
      return;
    }
    setHasBarcodeApi(true);

    let detector: any;
    try {
      detector = new DetectorCtor({
        formats: ["ean_13", "ean_8", "code_128", "code_39", "upc_a", "upc_e", "qr_code"],
      });
    } catch {
      return;
    }

    let active = true;
    const interval = setInterval(async () => {
      if (!active || !videoRef.current || videoRef.current.readyState < 2) return;
      try {
        const codes = await detector.detect(videoRef.current);
        if (codes && codes.length > 0 && codes[0].rawValue) {
          await lookupByBarcode(String(codes[0].rawValue));
        }
      } catch {
        // Ignore single-frame detection errors
      }
    }, 300);

    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [open, cameraReady, tenantId]);

  // Manual Box / Strip OCR capture using Tesseract.js
  const handleOcrCapture = async () => {
    if (!videoRef.current || !canvasRef.current || ocrBusy) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Also try BarcodeDetector on captured canvas once
    const DetectorCtor = (window as any).BarcodeDetector;
    if (DetectorCtor) {
      try {
        const det = new DetectorCtor();
        const codes = await det.detect(canvas);
        if (codes?.[0]?.rawValue) {
          await lookupByBarcode(String(codes[0].rawValue));
          return;
        }
      } catch {
        // fallback to OCR
      }
    }

    setOcrBusy(true);
    setMatches([]);
    setStatusText("বক্স/স্ট্রিপের লেখা পড়া হচ্ছে...");
    try {
      const { createWorker } = await import("tesseract.js");
      const worker = await createWorker("eng");
      const { data } = await worker.recognize(canvas);
      await worker.terminate();

      const queries = extractCandidateQueries(data.text || "");
      if (queries.length === 0) {
        setStatusText("স্পষ্ট নাম পাওয়া যায়নি। আলোতে ধরে আবার চেষ্টা করুন।");
        return;
      }

      const foundMap = new Map<string, ScannedProductMatch>();
      for (const q of queries) {
        if (typeof navigator !== "undefined" && !navigator.onLine) {
          const cached = await searchCachedProducts(tenantId, q, 5);
          for (const c of cached) {
            if (!foundMap.has(c.id)) {
              foundMap.set(c.id, { product_id: c.id, name: c.name, form: c.form ?? null, strength: c.strength ?? null, cost: c.cost, price: c.price, vat_rate: c.vat_rate, stock: c.stock });
            }
          }
        } else {
          try {
            const { data: res } = await supabase.rpc("search_products" as never, {
              _tenant_id: tenantId,
              _query: q,
              _branch_id: null,
              _limit: 5,
              _warehouse_id: null,
              _offset: 0,
            } as never);
            for (const r of (res ?? []) as any[]) {
              if (!foundMap.has(r.id)) foundMap.set(r.id, mapRow(r));
            }
          } catch {
            const cached = await searchCachedProducts(tenantId, q, 5);
            for (const c of cached) {
              if (!foundMap.has(c.id)) {
                foundMap.set(c.id, { product_id: c.id, name: c.name, form: c.form ?? null, strength: c.strength ?? null, cost: c.cost, price: c.price, vat_rate: c.vat_rate, stock: c.stock });
              }
            }
          }
        }
        if (foundMap.size >= 6) break;
      }

      const list = Array.from(foundMap.values());
      if (list.length === 1) {
        navigator.vibrate?.(60);
        onAddProduct(list[0]);
        toast.success(`POS-এ যোগ হয়েছে: ${list[0].name}`);
        setStatusText(`যোগ হয়েছে: ${list[0].name}`);
      } else if (list.length > 1) {
        setMatches(list.slice(0, 6));
        setStatusText("নিচের তালিকা থেকে সঠিক ওষুধটি ট্যাপ করে যোগ করুন:");
      } else {
        setStatusText(`"${queries[0]}" নামে স্টকে কোনো ওষুধ পাওয়া যায়নি।`);
      }
    } catch (err) {
      console.error("[MobileScanner OCR]", err);
      setStatusText("স্ক্যান করতে সমস্যা হয়েছে, আবার চেষ্টা করুন।");
    } finally {
      setOcrBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden rounded-3xl">
        <DialogHeader className="px-4 py-3 bg-[#0d5c46] text-white flex flex-row items-center justify-between">
          <DialogTitle className="flex items-center gap-2 text-base font-bold text-white">
            <ScanBarcode className="h-5 w-5" />
            বক্স ও স্ট্রিপ ক্যামেরা স্ক্যানার
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
              <div className="pointer-events-none absolute inset-6 rounded-2xl border-2 border-dashed border-emerald-400/90 shadow-[0_0_25px_rgba(16,185,129,0.25)] flex flex-col justify-between p-2.5">
                <span className="self-start rounded-full bg-black/60 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-300">
                  {hasBarcodeApi ? "Auto Barcode + OCR Ready" : "Box / Strip OCR Mode"}
                </span>
                <div className="h-0.5 w-full bg-emerald-400/70 animate-pulse" />
              </div>
            </>
          )}
          <canvas ref={canvasRef} className="hidden" />
        </div>

        <div className="p-4 space-y-3 bg-white">
          <p className="text-xs text-center font-medium text-slate-600">{statusText}</p>

          {matches.length > 0 && (
            <div className="max-h-40 overflow-y-auto space-y-1.5 border rounded-xl p-2 bg-slate-50">
              {matches.map((m) => (
                <button
                  key={m.product_id}
                  type="button"
                  onClick={() => {
                    onAddProduct(m);
                    toast.success(`যোগ হয়েছে: ${m.name}`);
                    setMatches([]);
                    setStatusText(`যোগ হয়েছে: ${m.name}`);
                  }}
                  className="w-full flex items-center justify-between gap-2 rounded-lg bg-white border border-slate-200 px-3 py-2 text-left hover:border-[#0d5c46] active:scale-[0.98] transition"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-slate-900 truncate">{m.name}</p>
                    <p className="text-[11px] text-slate-500">
                      স্টক: {m.stock} · ৳{m.price.toFixed(2)}
                    </p>
                  </div>
                  <span className="shrink-0 rounded-full bg-[#0d5c46] p-1 text-white">
                    <Plus className="h-3.5 w-3.5" />
                  </span>
                </button>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              onClick={() => void handleOcrCapture()}
              disabled={!cameraReady || ocrBusy}
              className="flex-1 h-11 rounded-xl bg-[#0d5c46] hover:bg-[#094735] text-white font-semibold gap-2"
            >
              {ocrBusy ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  স্ক্যান হচ্ছে...
                </>
              ) : (
                <>
                  <Camera className="h-4 w-4" />
                  স্ট্রিপ / বক্স স্ক্যান করুন
                </>
              )}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="h-11 rounded-xl px-4"
            >
              <CheckCircle2 className="h-4 w-4 mr-1 text-[#0d5c46]" />
              শেষ
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
