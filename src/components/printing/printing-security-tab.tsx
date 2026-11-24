import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ShieldCheck, RefreshCw, KeyRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  loadQzSecurity, saveQzSecurity, fetchCertificate, getCertificateStatus,
  getSignStatus,
  type QzSecurityConfig,
} from "@/lib/printing/qz/security";

export function PrintingSecurityTab() {
  const [cfg, setCfg] = useState<QzSecurityConfig>(() => loadQzSecurity());
  const [certStatus, setCertStatus] = useState(getCertificateStatus());
  const [signStatus, setSignStatus] = useState<"idle" | "ok" | "error">(getSignStatus());
  const [checking, setChecking] = useState(false);
  const [testing, setTesting] = useState(false);

  const refresh = async () => {
    setChecking(true);
    try { await fetchCertificate(); } finally {
      setCertStatus(getCertificateStatus());
      setChecking(false);
    }
  };

  const testSign = async () => {
    setTesting(true);
    try {
      const res = await fetch(cfg.signEndpoint, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          ...(cfg.signEndpoint.includes("/functions/v1/") && import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY
            ? {
                apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string,
                authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string}`,
              }
            : {}),
        },
        body: JSON.stringify({ toSign: `test-${Date.now()}` }),
      });
      const json = await res.json().catch(() => ({}));
      setSignStatus(res.ok && json.signature ? "ok" : "error");
    } catch {
      setSignStatus("error");
    } finally {
      setTesting(false);
    }
  };

  useEffect(() => { void refresh(); }, []);

  const update = (patch: Partial<QzSecurityConfig>) => {
    const next = saveQzSecurity(patch);
    setCfg(next);
  };

  const statusBadge =
    certStatus.status === "loaded" ? <Badge variant="default">Loaded</Badge>
    : certStatus.status === "error" ? <Badge variant="destructive">Error</Badge>
    : <Badge variant="secondary">Missing</Badge>;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" /> QZ Tray Security
        </CardTitle>
        <CardDescription>
          Production-grade request signing for QZ Tray. When the signing endpoint
          is unavailable, the system automatically falls back to development mode
          and printing continues to work.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="flex items-center justify-between rounded-md border border-primary/30 bg-primary/5 p-3">
          <div>
            <Label className="text-sm font-medium">Security Setup Wizard</Label>
            <p className="text-xs text-muted-foreground">
              Paste your QZ private key &amp; certificate to (re)configure production signing.
            </p>
          </div>
          <Button asChild size="sm">
            <Link to="/settings/printing/security-setup">
              <KeyRound className="h-3.5 w-3.5 mr-1" /> Open Wizard
            </Link>
          </Button>
        </div>

        <div className="flex items-center justify-between rounded-md border p-3">
          <div>
            <Label className="text-sm font-medium">Enable Secure Printing</Label>
            <p className="text-xs text-muted-foreground">
              Configures QZ certificate &amp; signature promises before connect.
            </p>
          </div>
          <Switch
            checked={cfg.enabled}
            onCheckedChange={(v) => update({ enabled: v })}
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label className="text-sm">Current Mode</Label>
            <Select
              value={cfg.mode}
              onValueChange={(v) => update({ mode: v as QzSecurityConfig["mode"] })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="development">Development (unsigned)</SelectItem>
                <SelectItem value="production">Production (signed)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-sm">Signing Endpoint</Label>
            <Input
              value={cfg.signEndpoint}
              onChange={(e) => update({ signEndpoint: e.target.value })}
              placeholder="/api/printing/qz/sign"
            />
          </div>
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Certificate Status</Label>
              {statusBadge}
            </div>
            <Button size="sm" variant="outline" onClick={refresh} disabled={checking}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${checking ? "animate-spin" : ""}`} />
              Reload
            </Button>
          </div>
          <div className="text-xs text-muted-foreground">
            Path: <code>/qz/certificate.pem</code>
          </div>
          {certStatus.fingerprint && (
            <div className="text-xs">
              <span className="text-muted-foreground">SHA-256:</span>{" "}
              <code className="break-all">{certStatus.fingerprint}</code>
            </div>
          )}
          {certStatus.status !== "loaded" && (
            <p className="text-xs text-muted-foreground">
              Place your QZ certificate at <code>public/qz/certificate.pem</code>.
              Without a certificate and signing endpoint, QZ will show its
              anonymous-request popup (printing still works).
            </p>
          )}
        </div>

        <div className="rounded-md border p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Label className="text-sm font-medium">Signing Endpoint Test</Label>
              {signStatus === "ok" ? <Badge variant="default">Signing OK</Badge>
                : signStatus === "error" ? <Badge variant="destructive">Failed</Badge>
                : <Badge variant="secondary">Not tested</Badge>}
            </div>
            <Button size="sm" variant="outline" onClick={testSign} disabled={testing}>
              <RefreshCw className={`h-3.5 w-3.5 mr-1 ${testing ? "animate-spin" : ""}`} />
              Test Sign
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            POSTs a test payload to <code className="break-all">{cfg.signEndpoint}</code>.
            Configure the <code>QZ_PRIVATE_KEY</code> secret in Lovable Cloud to enable production signing.
          </p>
          <div className="text-xs text-muted-foreground">
            Production Ready:{" "}
            {cfg.enabled && cfg.mode === "production" && certStatus.status === "loaded" && signStatus === "ok"
              ? <Badge variant="default">Yes</Badge>
              : <Badge variant="secondary">No</Badge>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
