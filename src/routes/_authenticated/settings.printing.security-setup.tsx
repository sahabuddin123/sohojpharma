import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ShieldCheck, CheckCircle2, XCircle, Loader2, ArrowRight, ArrowLeft, Save } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { RouteErrorPanel } from "@/components/route-error";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { saveQzCredentials } from "@/lib/printing/qz-credentials.functions";
import {
  fetchCertificate, clearCertificateCache, getCertificateStatus,
  loadQzSecurity, saveQzSecurity,
} from "@/lib/printing/qz/security";

export const Route = createFileRoute("/_authenticated/settings/printing/security-setup")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "QZ Security Setup — SohojPharma" }] }),
  component: SecuritySetupPage,
});

type CheckState = "pending" | "ok" | "fail";
type Diagnostics = {
  cert: CheckState; secret: CheckState; sign: CheckState; pair: CheckState; ready: CheckState;
  fingerprint?: string | null; error?: string;
};

function SecuritySetupPage() {
  const navigate = useNavigate();
  const save = useServerFn(saveQzCredentials);
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [privateKey, setPrivateKey] = useState("");
  const [certificate, setCertificate] = useState("");
  const [busy, setBusy] = useState(false);
  const [diag, setDiag] = useState<Diagnostics | null>(null);

  const onSave = async () => {
    if (!privateKey.includes("PRIVATE KEY") || !privateKey.includes("BEGIN")) {
      toast.error("Private key must be a PEM block"); return;
    }
    if (!certificate.includes("BEGIN CERTIFICATE")) {
      toast.error("Certificate must be a PEM block"); return;
    }
    setBusy(true);
    const d: Diagnostics = { cert: "pending", secret: "pending", sign: "pending", pair: "pending", ready: "pending" };
    setDiag(d); setStep(3);
    try {
      // Save (admin RLS) — preserves exact bytes.
      await save({ data: { privateKey, certificate } });
      d.secret = "ok";
      setDiag({ ...d });

      // Reload cert from server (DB-backed endpoint).
      clearCertificateCache();
      const loaded = await fetchCertificate();
      d.cert = loaded ? "ok" : "fail";
      d.fingerprint = getCertificateStatus().fingerprint;
      setDiag({ ...d });

      // Test signing endpoint with the new key.
      const cfg = loadQzSecurity();
      const toSign = `setup-${Date.now()}`;
      const anon = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
      const headers: Record<string, string> = { "content-type": "application/json" };
      if (anon && cfg.signEndpoint.includes("/functions/v1/")) {
        headers.apikey = anon;
        headers.authorization = `Bearer ${anon}`;
      }
      const r = await fetch(cfg.signEndpoint, {
        method: "POST", headers, body: JSON.stringify({ toSign }),
      });
      const json = await r.json().catch(() => ({}));
      const sig: string | undefined = json?.signature;
      d.sign = r.ok && sig ? "ok" : "fail";
      setDiag({ ...d });

      // Pair-match: verify signature with public key extracted from cert.
      if (sig && loaded) {
        d.pair = (await verifyPair(loaded, toSign, sig)) ? "ok" : "fail";
      } else {
        d.pair = "fail";
      }
      setDiag({ ...d });

      // Flip to production mode if everything passed.
      if (d.cert === "ok" && d.sign === "ok" && d.pair === "ok") {
        saveQzSecurity({ enabled: true, mode: "production" });
        d.ready = "ok";
      } else {
        d.ready = "fail";
      }
      setDiag({ ...d });
      toast.success("Security setup complete");
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Save failed";
      toast.error(msg);
      setDiag({ ...d, error: msg, secret: d.secret === "pending" ? "fail" : d.secret });
    } finally {
      setBusy(false);
    }
  };

  return (
    <AppShell variant="store" title="QZ Security Setup">
      <PageHeader
        title="QZ Security Setup"
        description="One-time wizard to paste your existing QZ Tray private key and certificate. Values are stored exactly as pasted."
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" /> Step {step} of 3
            </CardTitle>
            <CardDescription>
              {step === 1 && "Paste your complete private key (PEM)."}
              {step === 2 && "Paste your complete certificate (PEM)."}
              {step === 3 && "Running diagnostic checks…"}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {step === 1 && (
              <>
                <Label>QZ_PRIVATE_KEY</Label>
                <Textarea
                  value={privateKey}
                  onChange={(e) => setPrivateKey(e.target.value)}
                  placeholder={"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"}
                  className="min-h-[260px] font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                />
                <p className="text-xs text-muted-foreground">
                  Pasted bytes are preserved exactly. Nothing is trimmed or reformatted.
                </p>
                <div className="flex justify-end">
                  <Button onClick={() => setStep(2)} disabled={!privateKey.trim()}>
                    Next <ArrowRight className="h-4 w-4 ml-1" />
                  </Button>
                </div>
              </>
            )}
            {step === 2 && (
              <>
                <Label>certificate.pem</Label>
                <Textarea
                  value={certificate}
                  onChange={(e) => setCertificate(e.target.value)}
                  placeholder={"-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----"}
                  className="min-h-[260px] font-mono text-xs"
                  spellCheck={false}
                  autoComplete="off"
                />
                <div className="flex justify-between">
                  <Button variant="outline" onClick={() => setStep(1)}>
                    <ArrowLeft className="h-4 w-4 mr-1" /> Back
                  </Button>
                  <Button onClick={onSave} disabled={busy || !certificate.trim()}>
                    {busy ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
                    Save & Verify
                  </Button>
                </div>
              </>
            )}
            {step === 3 && diag && (
              <div className="space-y-2">
                <Row label="Certificate Loaded" state={diag.cert} />
                <Row label="Secret Saved" state={diag.secret} />
                <Row label="Signing Endpoint OK" state={diag.sign} />
                <Row label="Key Pair Match" state={diag.pair} />
                <Row label="Production Ready" state={diag.ready} />
                {diag.fingerprint && (
                  <div className="text-xs pt-2">
                    <span className="text-muted-foreground">SHA-256:</span>{" "}
                    <code className="break-all">{diag.fingerprint}</code>
                  </div>
                )}
                {diag.error && (
                  <p className="text-xs text-destructive">Error: {diag.error}</p>
                )}
                <div className="flex justify-between pt-3">
                  <Button variant="outline" onClick={() => { setStep(1); setDiag(null); }}>
                    Restart
                  </Button>
                  <Button onClick={() => navigate({ to: "/settings/printing" })}>
                    Back to Printing
                  </Button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function Row({ label, state }: { label: string; state: CheckState }) {
  return (
    <div className="flex items-center justify-between rounded-md border p-2">
      <span className="text-sm">{label}</span>
      {state === "ok" ? <Badge variant="default" className="gap-1"><CheckCircle2 className="h-3 w-3" /> OK</Badge>
        : state === "fail" ? <Badge variant="destructive" className="gap-1"><XCircle className="h-3 w-3" /> Failed</Badge>
        : <Badge variant="secondary" className="gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Checking</Badge>}
    </div>
  );
}

// Verify the signature against the public key extracted from the X.509 cert.
async function verifyPair(certPem: string, data: string, sigB64: string): Promise<boolean> {
  try {
    const certDer = pemToDer(certPem);
    const spki = extractSpkiFromCert(new Uint8Array(certDer));
    if (!spki) return false;
    const pub = await crypto.subtle.importKey(
      "spki", spki, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-512" }, false, ["verify"],
    );
    const sig = Uint8Array.from(atob(sigB64), (c) => c.charCodeAt(0));
    return await crypto.subtle.verify(
      "RSASSA-PKCS1-v1_5", pub, sig, new TextEncoder().encode(data),
    );
  } catch { return false; }
}

function pemToDer(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----BEGIN [^-]+-----/g, "")
    .replace(/-----END [^-]+-----/g, "").replace(/\s+/g, "");
  const bin = atob(b64);
  const buf = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) buf[i] = bin.charCodeAt(i);
  return buf.buffer;
}

// Minimal DER walker: find the SubjectPublicKeyInfo SEQUENCE inside the
// Certificate's TBSCertificate. We scan for the rsaEncryption OID and back up
// to the enclosing SEQUENCE.
function extractSpkiFromCert(der: Uint8Array): ArrayBuffer | null {
  // rsaEncryption OID: 1.2.840.113549.1.1.1 → DER: 06 09 2A 86 48 86 F7 0D 01 01 01
  const needle = [0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01];
  outer: for (let i = 0; i < der.length - needle.length; i++) {
    for (let j = 0; j < needle.length; j++) if (der[i + j] !== needle[j]) continue outer;
    // The OID lives inside AlgorithmIdentifier SEQUENCE, which lives inside SPKI SEQUENCE.
    // Walk backward for two SEQUENCE (0x30) starts whose length envelopes our position.
    const algSeqStart = findEnclosingSeq(der, i);
    if (algSeqStart < 0) return null;
    const spkiSeqStart = findEnclosingSeq(der, algSeqStart);
    if (spkiSeqStart < 0) return null;
    const { totalLen } = readLen(der, spkiSeqStart + 1);
    const headerLen = lenHeaderBytes(der, spkiSeqStart + 1);
    const end = spkiSeqStart + 1 + headerLen + totalLen;
    return der.slice(spkiSeqStart, end).buffer;
  }
  return null;
}

function findEnclosingSeq(der: Uint8Array, pos: number): number {
  for (let i = pos - 1; i >= 0; i--) {
    if (der[i] !== 0x30) continue;
    const { totalLen } = readLen(der, i + 1);
    const headerLen = lenHeaderBytes(der, i + 1);
    const end = i + 1 + headerLen + totalLen;
    if (end > pos) return i;
  }
  return -1;
}

function readLen(der: Uint8Array, at: number): { totalLen: number } {
  const b = der[at];
  if (b < 0x80) return { totalLen: b };
  const n = b & 0x7f;
  let len = 0;
  for (let i = 0; i < n; i++) len = (len << 8) | der[at + 1 + i];
  return { totalLen: len };
}

function lenHeaderBytes(der: Uint8Array, at: number): number {
  const b = der[at];
  return b < 0x80 ? 1 : 1 + (b & 0x7f);
}
