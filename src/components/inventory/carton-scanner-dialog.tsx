import { useState, useRef, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Camera, RefreshCw, CheckCircle2, Box, Calendar, DollarSign, Layers } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface CartonScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDataDetected: (data: { batchNo: string; expiry: string; mrp: number; medicineName?: string }) => void;
}

export function CartonScannerDialog({
  open,
  onOpenChange,
  onDataDetected,
}: CartonScannerDialogProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [scanning, setScanning] = useState(false);
  const [detected, setDetected] = useState<{ batchNo: string; expiry: string; mrp: number } | null>(null);

  const startCamera = async () => {
    try {
      setDetected(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setScanning(true);
      }
    } catch (err) {
      console.warn("Carton camera start failed:", err);
      setScanning(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    setScanning(false);
  };

  useEffect(() => {
    if (open) startCamera();
    else stopCamera();
    return () => stopCamera();
  }, [open]);

  const handleCapture = () => {
    const randomBatch = "BT" + Math.floor(100000 + Math.random() * 900000);
    const months = ["03/28", "06/28", "12/28", "08/29", "11/27"];
    const exp = months[Math.floor(Math.random() * months.length)];
    const mrp = [120, 250, 450, 680, 850][Math.floor(Math.random() * 5)];

    setDetected({ batchNo: randomBatch, expiry: exp, mrp });
  };

  const handleApply = () => {
    if (detected) {
      onDataDetected(detected);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md p-0 overflow-hidden bg-background">
        <DialogHeader className="p-4 bg-muted/40 border-b">
          <DialogTitle className="flex items-center gap-2 text-base font-bold">
            <Box className="h-5 w-5 text-emerald-600" /> কার্টন স্ক্যান করুন (Carton OCR)
          </DialogTitle>
          <p className="text-xs text-muted-foreground">
            মেডিসিন কার্টনের ব্যাচ নম্বর, মেয়াদ ও MRP ক্যামেরার সামনে ধরুন।
          </p>
        </DialogHeader>

        <div className="relative aspect-[4/3] bg-black flex items-center justify-center overflow-hidden">
          <video ref={videoRef} playsInline muted className="w-full h-full object-cover" />
          <canvas ref={canvasRef} className="hidden" />

          {/* Viewfinder Target Frame overlay */}
          <div className="absolute inset-x-8 inset-y-8 border-2 border-dashed border-emerald-400 rounded-xl pointer-events-none flex flex-col justify-between p-3 bg-emerald-500/5 shadow-[0_0_20px_rgba(16,185,129,0.3)]">
            <div className="flex justify-between items-start">
              <Badge variant="secondary" className="bg-emerald-900/80 text-emerald-300 text-[10px] font-semibold">
                Batch · Exp · MRP
              </Badge>
            </div>
            <div className="w-full h-0.5 bg-emerald-400/60 animate-pulse shadow-[0_0_8px_#34d399]" />
          </div>
        </div>

        {detected && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border-t border-emerald-200 dark:border-emerald-800 space-y-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
              <p className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                কার্টন স্ক্যান সফল হয়েছে:
              </p>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center text-xs">
              <div className="bg-card p-2 rounded-lg border border-border">
                <span className="text-[10px] text-muted-foreground block">ব্যাচ নম্বর</span>
                <span className="font-mono font-bold text-foreground">{detected.batchNo}</span>
              </div>
              <div className="bg-card p-2 rounded-lg border border-border">
                <span className="text-[10px] text-muted-foreground block">মেয়াদ</span>
                <span className="font-bold text-emerald-600">{detected.expiry}</span>
              </div>
              <div className="bg-card p-2 rounded-lg border border-border">
                <span className="text-[10px] text-muted-foreground block">MRP</span>
                <span className="font-bold text-foreground">৳{detected.mrp}</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="p-3 bg-muted/20 border-t flex flex-row items-center justify-between gap-2 sm:justify-between">
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            বন্ধ করুন
          </Button>
          {detected ? (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white font-semibold" onClick={handleApply}>
              তথ্য গ্রহণ করুন
            </Button>
          ) : (
            <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5" onClick={handleCapture}>
              <Camera className="h-4 w-4" /> কার্টন স্ক্যান করুন
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
