import { useEffect, useState } from "react";
import { Download, RefreshCw, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function PwaInstallButton({ className }: { className?: string }) {
  const [deferred, setDeferred] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferred(e as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    try {
      if (window.matchMedia("(display-mode: standalone)").matches) setInstalled(true);
    } catch {
      /* noop */
    }
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = async () => {
    if (!deferred) {
      toast.info(
        "Install prompt is not available here. Open the published app in Chrome/Edge (or use Share → Add to Home Screen on iOS).",
      );
      return;
    }
    await deferred.prompt();
    const choice = await deferred.userChoice;
    if (choice.outcome === "accepted") {
      setInstalled(true);
      toast.success("App installed");
    }
    setDeferred(null);
  };

  const update = async () => {
    setUpdating(true);
    try {
      if ("serviceWorker" in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map((r) => r.update()));
      }
      toast.success("Checked for updates — reloading");
      setTimeout(() => window.location.reload(), 600);
    } catch {
      toast.error("Update check failed");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2">
        <Button onClick={install} disabled={installed}>
          {installed ? <CheckCircle2 className="mr-2 h-4 w-4" /> : <Download className="mr-2 h-4 w-4" />}
          {installed ? "App installed" : "Install app (PWA)"}
        </Button>
        <Button variant="outline" onClick={update} disabled={updating}>
          <RefreshCw className={`mr-2 h-4 w-4 ${updating ? "animate-spin" : ""}`} />
          Check for updates
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Install works on the published site (not inside the editor preview). iOS: Share → Add to Home Screen.
      </p>
    </div>
  );
}
