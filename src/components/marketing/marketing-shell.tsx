import { Link } from "@tanstack/react-router";
import { Pill, ArrowRight, LayoutDashboard } from "lucide-react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";

export function MarketingShell({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const { i18n } = useTranslation();
  const isBn = (i18n.resolvedLanguage ?? i18n.language ?? "en").startsWith("bn");
  const isLoggedIn = Boolean(session?.user);
  const dashLabel = isBn ? "ড্যাশবোর্ড" : "Dashboard";

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-4 px-4 lg:px-8">
          <Link to="/" className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-xl bg-brand-gradient text-white shadow-glow">
              <Pill className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">SohojPharma</span>
          </Link>
          <nav className="ml-8 hidden items-center gap-6 text-sm font-medium text-muted-foreground md:flex">
            <Link to="/features" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Features</Link>
            <Link to="/pricing" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Pricing</Link>
            <Link to="/faq" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>FAQ</Link>
            <Link to="/contact" className="hover:text-foreground" activeProps={{ className: "text-foreground" }}>Contact</Link>
          </nav>
          <div className="ml-auto flex items-center gap-2">
            {isLoggedIn ? (
              <Button asChild size="sm">
                <Link to="/dashboard">
                  <LayoutDashboard className="mr-1.5 h-4 w-4" />
                  {dashLabel} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="ghost" size="sm">
                  <Link to="/auth" search={{ redirect: undefined, blocked: undefined }}>Sign in</Link>
                </Button>
                <Button asChild size="sm">
                  <Link to="/auth" search={{ redirect: undefined, blocked: undefined }}>
                    Start free trial <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </header>
      <main>{children}</main>
      <footer className="border-t border-border py-10">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-3 px-4 text-sm text-muted-foreground lg:flex-row lg:px-8">
          <p>© 2026 SohojPharma. All rights reserved.</p>
          <div className="flex gap-5">
            <Link to="/features">Features</Link>
            <Link to="/pricing">Pricing</Link>
            <Link to="/faq">FAQ</Link>
            <Link to="/contact">Contact</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
