import React, { useEffect, useRef, useState, useCallback } from "react";
import { RefreshCw, ShieldCheck, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";

interface ManualCaptchaProps {
  value: string;
  onChange: (value: string) => void;
  onRefresh?: () => void;
  onExpectedChange?: (expected: string) => void;
  error?: boolean;
  errorMessage?: string;
}

interface Challenge {
  text: string;
  answer: string;
}

export function ManualCaptcha({
  value,
  onChange,
  onExpectedChange,
  error,
  errorMessage,
}: ManualCaptchaProps) {
  const { i18n } = useTranslation();
  const isBn = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("bn");
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [challenge, setChallenge] = useState<Challenge>({ text: "", answer: "" });
  const [isSpinning, setIsSpinning] = useState(false);

  useEffect(() => {
    if (error && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [error]);

  const generateChallenge = useCallback((): Challenge => {
    // Generate simple arithmetic challenge (e.g. 7 + 8 or 23 - 9)
    const isAddition = Math.random() > 0.3;
    if (isAddition) {
      const a = Math.floor(Math.random() * 15) + 3;
      const b = Math.floor(Math.random() * 12) + 2;
      return {
        text: `${a} + ${b} = ?`,
        answer: String(a + b),
      };
    } else {
      const a = Math.floor(Math.random() * 20) + 10;
      const b = Math.floor(Math.random() * 9) + 1;
      return {
        text: `${a} - ${b} = ?`,
        answer: String(a - b),
      };
    }
  }, []);

  const drawCaptcha = useCallback((chal: Challenge) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. Background gradient
    const grad = ctx.createLinearGradient(0, 0, width, height);
    grad.addColorStop(0, "#f1f5f9");
    grad.addColorStop(0.5, "#e2e8f0");
    grad.addColorStop(1, "#cbd5e1");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, height);

    // 2. Random noise lines to prevent OCR scraping
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(${Math.floor(Math.random() * 150)}, ${Math.floor(
        Math.random() * 150
      )}, ${Math.floor(Math.random() * 150)}, 0.4)`;
      ctx.lineWidth = Math.random() * 1.5 + 1;
      ctx.beginPath();
      ctx.moveTo(Math.random() * width, Math.random() * height);
      ctx.bezierCurveTo(
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height,
        Math.random() * width,
        Math.random() * height
      );
      ctx.stroke();
    }

    // 3. Random noise dots
    for (let i = 0; i < 25; i++) {
      ctx.fillStyle = `rgba(${Math.floor(Math.random() * 180)}, ${Math.floor(
        Math.random() * 180
      )}, ${Math.floor(Math.random() * 180)}, 0.5)`;
      ctx.beginPath();
      ctx.arc(
        Math.random() * width,
        Math.random() * height,
        Math.random() * 1.5,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    // 4. Render tilted text characters
    ctx.font = "bold 20px 'Segoe UI', system-ui, sans-serif";
    ctx.textBaseline = "middle";

    const chars = chal.text.split("");
    const charWidth = (width - 24) / chars.length;

    chars.forEach((char, index) => {
      ctx.save();
      const x = 14 + index * charWidth;
      const y = height / 2 + (Math.random() * 4 - 2);
      const angle = (Math.random() * 14 - 7) * (Math.PI / 180);

      ctx.translate(x, y);
      ctx.rotate(angle);

      // Shadow
      ctx.fillStyle = "rgba(15, 23, 42, 0.25)";
      ctx.fillText(char, 1, 1);

      // Main character with dark slate color
      ctx.fillStyle = "#0f172a";
      ctx.fillText(char, 0, 0);

      ctx.restore();
    });
  }, []);

  const refresh = useCallback(() => {
    setIsSpinning(true);
    const newChal = generateChallenge();
    setChallenge(newChal);
    drawCaptcha(newChal);
    onExpectedChange?.(newChal.answer);
    setTimeout(() => setIsSpinning(false), 400);
  }, [drawCaptcha, generateChallenge, onExpectedChange]);

  useEffect(() => {
    const initial = generateChallenge();
    setChallenge(initial);
    drawCaptcha(initial);
    onExpectedChange?.(initial.answer);
  }, [drawCaptcha, generateChallenge, onExpectedChange]);

  return (
    <div className="space-y-2 rounded-xl border border-border/70 bg-muted/20 p-3">
      <div className="flex items-center justify-between text-xs">
        <Label htmlFor="captcha-input" className="flex items-center gap-1.5 font-semibold text-foreground/90">
          <ShieldCheck className="h-4 w-4 text-primary" />
          {isBn ? "সিকিউরিটি ক্যাপচা (CAPTCHA)" : "Security CAPTCHA"}
        </Label>
        <span className="text-[11px] text-muted-foreground">{isBn ? "বট সুরক্ষা" : "Bot Protection"}</span>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative overflow-hidden rounded-lg border border-slate-300 shadow-inner">
          <canvas
            ref={canvasRef}
            width={130}
            height={40}
            className="block select-none"
            title={isBn ? "সিকিউরিটি কোড" : "Security Code"}
          />
        </div>

        <Button
          type="button"
          variant="outline"
          size="icon"
          onClick={refresh}
          title={isBn ? "নতুন ক্যাপচা কোড লোড করুন" : "Refresh CAPTCHA"}
          className="h-10 w-10 shrink-0 rounded-lg hover:bg-muted"
        >
          <RefreshCw className={`h-4 w-4 text-muted-foreground ${isSpinning ? "animate-spin" : ""}`} />
        </Button>

        <Input
          ref={inputRef}
          id="captcha-input"
          name="captcha_answer"
          type="text"
          inputMode="numeric"
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className={`h-10 flex-1 rounded-lg text-center font-mono text-base font-bold tracking-wider transition-colors ${
            error
              ? "border-destructive ring-2 ring-destructive/20 bg-destructive/5 focus-visible:ring-destructive"
              : ""
          }`}
          required
        />
      </div>

      {errorMessage && (
        <div className="flex items-center gap-1.5 pt-1 text-xs font-semibold text-destructive animate-in fade-in slide-in-from-top-1">
          <AlertCircle className="h-3.5 w-3.5 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
}
