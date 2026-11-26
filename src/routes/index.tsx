import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { getLandingCms } from "@/lib/api/landing-cms.functions";
import {
  Pill, Check, ArrowRight, Boxes, ShoppingCart, BarChart3, Bell, Database,
  Receipt, AlertTriangle, FileX, ClipboardList, FileText, PackageX, TrendingDown, ShieldAlert,
  Users, Truck, RotateCcw, Cloud, Zap, Shield, RefreshCw, WifiOff, Building2, UserCog,
  Layers, ShieldCheck, Globe, Headphones, Star, Smartphone, Apple, QrCode, Phone, MessageCircle, Mail, MapPin, Menu, X, Plus, Minus,
} from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { useThemeInit } from "@/hooks/use-theme-init";
import { WhatsAppChatbot } from "@/components/common/whatsapp-chatbot";
import { toast } from "sonner";

function useLandingCmsBootstrap() {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const cms = await getLandingCms();
        if (cancelled) return;
        const en = JSON.parse(cms.content_en);
        const bn = JSON.parse(cms.content_bn);
        if (en && typeof en === "object" && Object.keys(en).length) {
          i18n.addResourceBundle("en", "translation", { landing: en }, true, true);
        }
        if (bn && typeof bn === "object" && Object.keys(bn).length) {
          i18n.addResourceBundle("bn", "translation", { landing: bn }, true, true);
        }
        // force re-render of consumers
        await i18n.changeLanguage(i18n.language);
      } catch (err) {
        // CMS fetch failure is non-fatal — fall back to bundled JSON.
        console.warn("[landing-cms] using bundled translations:", err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
}


export const Route = createFileRoute("/")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({
    meta: [
      { title: "SohojPharma — ফার্মেসি ব্যবসা ম্যানেজ করা এখন সবচেয়ে সহজ" },
      { name: "description", content: "ইনভেন্টরি, POS এবং হিসাব নিকাশ এক জায়গায়। বাংলাদেশের ৫০০+ ফার্মেসি মালিকের প্রথম পছন্দ।" },
      { property: "og:title", content: "SohojPharma — Pharmacy ERP SaaS" },
      { property: "og:description", content: "Smart pharmacy management with inventory, POS, and reports." },
      { property: "og:url", content: "https://sohojpharma.cloud/" },
    ],
    links: [
      { rel: "canonical", href: "https://sohojpharma.cloud/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Hind+Siliguri:wght@400;500;600;700&display=swap" },
    ],
  }),
  component: Landing,
});

const T = (val: unknown): string => (typeof val === "string" ? val.replace(/\s*—\s*/g, ", ") : "");

function useT() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.resolvedLanguage ?? i18n.language ?? "bn") as "en" | "bn";
  return { t, i18n, lang };
}

function LangToggle() {
  const { i18n, lang } = useT();
  return (
    <div className="inline-flex items-center bg-slate-100 rounded-full p-1 text-xs font-bold">
      <button
        onClick={() => i18n.changeLanguage("bn")}
        className={`px-3 py-1.5 rounded-full transition ${lang === "bn" ? "bg-white text-[#0d5c46] shadow" : "text-slate-600"}`}
      >বাংলা</button>
      <button
        onClick={() => i18n.changeLanguage("en")}
        className={`px-3 py-1.5 rounded-full transition ${lang === "en" ? "bg-white text-[#0d5c46] shadow" : "text-slate-600"}`}
      >English</button>
    </div>
  );
}

function Navbar() {
  const { t } = useT();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll);
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  const links = [
    { href: "#home", k: "nav.home" },
    { href: "#features", k: "nav.features" },
    { href: "#modules", k: "nav.modules" },
    { href: "#pricing", k: "nav.pricing" },
    { href: "#customers", k: "nav.customers" },
  ];
  return (
    <nav className={`sticky top-0 z-50 transition-all ${scrolled ? "bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-[#0d5c46] rounded-xl flex items-center justify-center shadow-lg shadow-emerald-900/20">
              <Pill className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Sohoj<span className="text-[#0d5c46]">Pharma</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ERP & POS</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-8 text-sm font-semibold">
            {links.map((l) => (
              <a key={l.k} href={l.href} className="text-slate-700 hover:text-[#0d5c46] transition">{t(`landing.${l.k}`)}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <LangToggle />
            <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="text-sm font-bold text-slate-700 hover:text-[#0d5c46] px-3 py-2">{t("landing.nav.login")}</Link>
            <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white bg-gradient-to-r from-[#094735] to-[#0d5c46] hover:brightness-105 transition shadow-md shadow-emerald-900/20 active:scale-95">
              {t("landing.nav.trial")} <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
          <button onClick={() => setOpen(!open)} className="md:hidden p-2" aria-label="Menu">
            {open ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>
        {open && (
          <div className="md:hidden py-4 border-t border-slate-100 space-y-2">
            {links.map((l) => (
              <a key={l.k} href={l.href} onClick={() => setOpen(false)} className="block py-2 text-slate-700 font-semibold">{t(`landing.${l.k}`)}</a>
            ))}
            <div className="pt-3 flex flex-col gap-3">
              <LangToggle />
              <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-[#0d5c46] text-center">{t("landing.nav.trial")}</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function Hero() {
  const { t, lang } = useT();
  const isBn = lang === "bn";
  const heroImageRaw = t("landing.hero.heroImage", { defaultValue: "" });
  const heroImage = typeof heroImageRaw === "string" && heroImageRaw.trim() ? heroImageRaw.trim() : "";

  const previewKpis = isBn
    ? [
        { label: "আজকের বিক্রি", value: "৳৪৮,৯২০", note: "+১২.৪% গতকাল থেকে", tone: "text-[#0d5c46]" },
        { label: "স্টক মূল্য", value: "৳১২,৪৫,০০০", note: "১,৮৪০টি সক্রিয় আইটেম", tone: "text-slate-900" },
        { label: "হাতে নগদ", value: "৳১৯,৪০০", note: "ক্যাশ ড্রয়ার ব্যালেন্স", tone: "text-slate-900" },
        { label: "মেয়াদ সতর্কতা", value: "৩টি ব্যাচ", note: "আগামী ৩০ দিনে", tone: "text-amber-700" },
      ]
    : [
        { label: "Today's Sale", value: "৳48,920", note: "+12.4% vs yesterday", tone: "text-[#0d5c46]" },
        { label: "Stock Value", value: "৳12,45,000", note: "1,840 active items", tone: "text-slate-900" },
        { label: "Cash in Hand", value: "৳19,400", note: "Register drawer live", tone: "text-slate-900" },
        { label: "Expiring Soon", value: "3 Batches", note: "Within next 30 days", tone: "text-amber-700" },
      ];

  const sampleInvoices = [
    { inv: "INV-2084", item: "Napa Extend 665mg • 2 Strip", batch: "B-409", total: "৳240", status: isBn ? "পরিশোধিত" : "Paid" },
    { inv: "INV-2083", item: "Sergel 20mg • 1 Strip", batch: "S-118", total: "৳140", status: isBn ? "পরিশোধিত" : "Paid" },
    { inv: "INV-2082", item: "Maxpro 20mg • 3 Strip", batch: "M-882", total: "৳210", status: isBn ? "বাকি" : "Due" },
  ];

  return (
    <section id="home" className="relative overflow-hidden border-b border-slate-200/70 bg-white pt-16 pb-24">
      <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_80%_50%_at_50%_-10%,rgba(13,92,70,0.08),transparent)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-900 max-w-4xl mx-auto leading-[1.08]">
          {T(t("landing.hero.title"))}
        </h1>
        <p className="mt-5 text-base sm:text-lg text-slate-600 max-w-2xl mx-auto leading-relaxed">{T(t("landing.hero.subtitle"))}</p>
        <div className="mt-9 flex flex-col sm:flex-row items-center justify-center gap-3.5">
          <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm sm:text-base font-bold text-white bg-[#0d5c46] hover:bg-[#094735] shadow-sm transition">
            {t("landing.hero.ctaPrimary")} <ArrowRight className="w-4 h-4" />
          </Link>
          <a href="#contact" className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm sm:text-base font-bold text-slate-800 bg-white border border-slate-200 hover:bg-slate-50 transition">
            {t("landing.hero.ctaSecondary")}
          </a>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs sm:text-sm text-slate-500 font-medium">
          {["tag1", "tag2", "tag3"].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><Check className="w-3.5 h-3.5 text-[#0d5c46]" />{t(`landing.hero.${k}`)}</span>
          ))}
        </div>

        {/* Realistic Product Workspace Preview or CMS Hero Image */}
        <div className="mt-14 relative max-w-5xl mx-auto">
          <div className="rounded-2xl bg-slate-100/80 border border-slate-200/90 p-2 sm:p-3 shadow-[0_24px_60px_-20px_rgba(15,23,42,0.14)]">
            {heroImage ? (
              <img src={heroImage} alt="SohojPharma Dashboard" className="w-full rounded-xl object-cover max-h-[540px]" />
            ) : (
              <div className="rounded-xl bg-white border border-slate-200/80 overflow-hidden text-left">
                <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/70 px-4 sm:px-6 py-3">
                  <div className="flex items-center gap-2.5">
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-[#0d5c46] text-white">
                      <Pill className="h-3.5 w-3.5" />
                    </span>
                    <span className="text-xs font-bold text-slate-900">
                      {isBn ? "ফার্মেসি স্টোর ওভারভিউ" : "Pharmacy Store Overview"}
                    </span>
                  </div>
                  <div className="hidden sm:flex items-center gap-4 text-[11px] font-semibold text-slate-500">
                    <span className="text-[#0d5c46]">POS</span>
                    <span>Inventory</span>
                    <span>Accounts</span>
                  </div>
                </div>

                <div className="p-4 sm:p-6 space-y-4">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {previewKpis.map((kpi) => (
                      <div key={kpi.label} className="rounded-xl border border-slate-200/80 bg-slate-50/50 p-3.5">
                        <p className="text-[11px] font-semibold text-slate-500">{kpi.label}</p>
                        <p className={`mt-1 text-lg sm:text-xl font-extrabold tracking-tight ${kpi.tone}`}>{kpi.value}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400">{kpi.note}</p>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200/80 overflow-hidden">
                    <div className="flex items-center justify-between bg-slate-50/70 px-4 py-2 border-b border-slate-100">
                      <span className="text-xs font-bold text-slate-700">
                        {isBn ? "সাম্প্রতিক POS বিক্রি ও ব্যাচ" : "Recent POS Sales & Batches"}
                      </span>
                      <span className="text-[11px] font-medium text-slate-400">FEFO Auto-Batch</span>
                    </div>
                    <div className="divide-y divide-slate-100">
                      {sampleInvoices.map((row) => (
                        <div key={row.inv} className="flex items-center justify-between px-4 py-2.5 text-xs">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className="font-mono font-semibold text-slate-500">{row.inv}</span>
                            <span className="truncate font-semibold text-slate-800">{row.item}</span>
                            <span className="hidden sm:inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-mono text-slate-500">{row.batch}</span>
                          </div>
                          <div className="flex items-center gap-3 shrink-0">
                            <span className="font-bold text-slate-900">{row.total}</span>
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${row.status === "Due" || row.status === "বাকি" ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-[#0d5c46]"}`}>
                              {row.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function TrustedBy() {
  const { t } = useT();
  const [tenants, setTenants] = useState<{ id: string; name: string; logo_url: string }[]>([]);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { listTrustedTenantsPublic } = await import("@/lib/api/trusted-tenants.functions");
        const data = await listTrustedTenantsPublic({ data: { limit: 24 } });
        if (active && Array.isArray(data)) setTenants(data as typeof tenants);
      } catch { /* ignore */ }
    })();
    return () => { active = false; };
  }, []);

  const fallback = ((t("landing.trust.items", { returnObjects: true }) as string[]) ?? []).map((n, i) => ({ id: `f${i}`, name: n, logo_url: "" }));
  const items = tenants.length > 0 ? tenants : fallback;
  const loop = [...items, ...items];
  return (
    <section className="py-12 bg-white border-b border-slate-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-400 mb-7">
          {T(t("landing.trust.title"))}
        </p>
        <div className="relative overflow-hidden">
          <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent" />
          <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent" />
          <div className="flex w-max gap-4 animate-[marquee_34s_linear_infinite] hover:[animation-play-state:paused] items-center">
            {loop.map((it, i) => {
              const initials = it.name
                .split(/\s+/)
                .filter(Boolean)
                .slice(0, 2)
                .map((w) => w[0]?.toUpperCase() ?? "")
                .join("") || "SP";
              return (
                <div
                  key={`${it.id}-${i}`}
                  className="flex items-center gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-4 py-2.5 whitespace-nowrap shrink-0 transition hover:border-emerald-200 hover:bg-white"
                >
                  {it.logo_url ? (
                    <img
                      src={it.logo_url}
                      alt={it.name}
                      className="h-7 w-7 rounded-lg object-cover border border-slate-200/60"
                      loading="lazy"
                    />
                  ) : (
                    <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-[11px] font-extrabold text-[#0d5c46] ring-1 ring-emerald-200/60">
                      {initials}
                    </span>
                  )}
                  <span className="text-sm font-bold text-slate-700">{it.name}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <style>{`@keyframes marquee { 0%{transform:translateX(0)} 100%{transform:translateX(-50%)} }`}</style>
    </section>
  );
}


function Problems() {
  const { t } = useT();
  const list = (t("landing.problems.list", { returnObjects: true }) as { t: string; d: string }[]) ?? [];
  const icons = [Receipt, FileX, ClipboardList, FileText, PackageX, AlertTriangle, TrendingDown, ShieldAlert];
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 leading-tight">{T(t("landing.problems.title"))}</h2>
          <p className="mt-4 text-lg text-slate-600">{T(t("landing.problems.subtitle"))}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {list.map((it, i) => {
            const Icon = icons[i] ?? AlertTriangle;
            return (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-200/80 hover:border-emerald-300 transition">
                <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-[#0d5c46]" />
                </div>
                <h3 className="font-bold text-slate-900">{it.t}</h3>
                <p className="mt-1 text-sm text-slate-500 leading-relaxed">{it.d}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function WhySohojPharma() {
  const { t } = useT();
  const items = (t("landing.why.items", { returnObjects: true }) as { t: string; d: string }[]) ?? [];
  const icons = [Boxes, ShoppingCart, Truck, BarChart3, FileText, Database, Users, QrCode, Bell, Truck, RotateCcw, Cloud];
  return (
    <section id="features" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-16">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{T(t("landing.why.title"))}</h2>
          <p className="mt-4 text-lg text-slate-600">{T(t("landing.why.subtitle"))}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it, i) => {
            const Icon = icons[i] ?? Boxes;
            return (
              <div key={i} className="group rounded-2xl border border-slate-200 p-5 hover:border-emerald-300 hover:shadow-lg hover:-translate-y-1 transition">
                <Icon className="w-7 h-7 text-[#0d5c46] mb-3" />
                <h3 className="font-bold text-slate-900">{it.t}</h3>
                <p className="text-sm text-slate-500 mt-1">{it.d}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Modules() {
  const { t } = useT();
  const items = (t("landing.modules.items", { returnObjects: true }) as string[]) ?? [];
  const moduleIcons = [
    ShoppingCart, Boxes, Pill, Truck, Receipt, RotateCcw, QrCode,
    BarChart3, FileText, Users, Building2, UserCog, Database, ClipboardList,
  ];
  return (
    <section id="modules" className="py-24 bg-gradient-to-b from-slate-50 to-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{T(t("landing.modules.title"))}</h2>
          <p className="mt-4 text-lg text-slate-600">{T(t("landing.modules.subtitle"))}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {items.map((m, i) => {
            const Icon = moduleIcons[i % moduleIcons.length];
            return (
              <div key={i} className="aspect-square rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-emerald-300 hover:shadow-md transition">
                <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-[#0d5c46]" />
                </div>
                <span className="font-bold text-sm text-slate-800 text-center px-2">{m}</span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}


function Highlights() {
  const { t } = useT();
  const items = (t("landing.highlights.items", { returnObjects: true }) as { t: string; d: string; cta: string; image?: string }[]) ?? [];
  const icons = [ShoppingCart, Boxes, BarChart3, ShieldCheck];
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 text-center max-w-3xl mx-auto mb-20">{t("landing.highlights.title")}</h2>
        <div className="space-y-20">
          {items.map((it, i) => {
            const Icon = icons[i % icons.length];
            return (
              <div key={i} className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${i % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}>
                <div>
                  <div className="inline-flex items-center justify-center w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-200/70 text-[#0d5c46] mb-5">
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="text-2xl sm:text-4xl font-black text-slate-900">{it.t}</h3>
                  <p className="mt-4 text-base sm:text-lg text-slate-600 leading-relaxed">{it.d}</p>
                  <a href="#contact" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#0d5c46] hover:gap-3 transition-all">
                    {it.cta} <ArrowRight className="w-4 h-4" />
                  </a>
                </div>
                <div className="rounded-2xl bg-slate-50 border border-slate-200/80 aspect-[4/3] flex items-center justify-center overflow-hidden">
                  {it.image ? (
                    <img src={it.image} alt={it.t} className="w-full h-full object-cover" />
                  ) : (
                    <div className="w-4/5 rounded-xl bg-white border border-slate-200/80 p-5 shadow-sm space-y-3">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                        <div className="flex items-center gap-2">
                          <span className="grid h-7 w-7 place-items-center rounded-lg bg-emerald-50 text-[#0d5c46]">
                            <Icon className="h-4 w-4" />
                          </span>
                          <span className="text-xs font-bold text-slate-800">{it.t}</span>
                        </div>
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-[#0d5c46]">Active</span>
                      </div>
                      <p className="text-xs leading-relaxed text-slate-500">{it.d}</p>
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <div className="rounded-lg bg-slate-50 border border-slate-100 p-2.5">
                          <p className="text-[10px] text-slate-400">Sync Status</p>
                          <p className="text-xs font-bold text-slate-800 mt-0.5">Real-time Cloud</p>
                        </div>
                        <div className="rounded-lg bg-emerald-50/60 border border-emerald-100 p-2.5">
                          <p className="text-[10px] text-[#0d5c46]">Accuracy</p>
                          <p className="text-xs font-bold text-[#0d5c46] mt-0.5">FEFO & Audit Log</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function MobileApp() {
  const { t, lang } = useT();
  const isBn = lang === "bn";
  return (
    <section className="py-24 bg-[#071f18] text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_25%_50%,rgba(16,185,129,0.14),transparent_55%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl sm:text-5xl font-black leading-tight">{t("landing.mobile.title")}</h2>
          <p className="mt-4 text-lg text-emerald-100/80">{t("landing.mobile.subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/m" className="inline-flex items-center gap-2.5 bg-white text-slate-900 px-5 py-3 rounded-xl font-bold hover:bg-emerald-50 transition">
              <Smartphone className="w-5 h-5 text-[#0d5c46]" /> {t("landing.mobile.android")}
            </Link>
            <Link to="/m" className="inline-flex items-center gap-2.5 bg-white text-slate-900 px-5 py-3 rounded-xl font-bold hover:bg-emerald-50 transition">
              <Apple className="w-5 h-5 text-[#0d5c46]" /> {t("landing.mobile.ios")}
            </Link>
            <div className="inline-flex items-center gap-2.5 bg-white/10 border border-white/15 px-5 py-3 rounded-xl font-bold">
              <QrCode className="w-5 h-5 text-emerald-300" /> {t("landing.mobile.qr")}
            </div>
          </div>
        </div>
        <div className="flex justify-center lg:justify-end items-start pt-2">
          <div className="relative z-10 w-[215px] sm:w-[235px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 ring-1 ring-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.65)]">
            <img
              src="/images/app-home.png"
              alt="SohojPharma Mobile Home"
              className="w-full h-auto block rounded-[1.6rem]"
              loading="lazy"
            />
          </div>
          <div className="relative -ml-10 mt-8 hidden sm:block w-[200px] sm:w-[215px] overflow-hidden rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 ring-1 ring-white/15 shadow-[0_25px_60px_-15px_rgba(0,0,0,0.55)] opacity-95">
            <img
              src="/images/app-products.png"
              alt="SohojPharma Mobile Products"
              className="w-full h-auto block rounded-[1.6rem]"
              loading="lazy"
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Benefits() {
  const { t } = useT();
  const items = (t("landing.benefits.items", { returnObjects: true }) as { t: string; d: string }[]) ?? [];
  const icons = [Cloud, Zap, Shield, RefreshCw, WifiOff, Building2, UserCog, BarChart3, RefreshCw, Headphones];
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 text-center max-w-3xl mx-auto mb-16">{t("landing.benefits.title")}</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-5">
          {items.map((it, i) => {
            const Icon = icons[i] ?? Layers;
            return (
              <div key={i} className="rounded-2xl p-6 bg-white border border-slate-200/80 hover:border-emerald-300 transition">
                <Icon className="w-8 h-8 text-[#0d5c46] mb-3" />
                <h3 className="font-bold text-slate-900">{it.t}</h3>
                <p className="text-sm text-slate-500 mt-1">{it.d}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Stats() {
  const { t } = useT();
  const items = (t("landing.stats.items", { returnObjects: true }) as { n: string; l: string }[]) ?? [];
  return (
    <section className="py-20 bg-gradient-to-r from-[#094735] to-[#0d5c46] text-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-center text-2xl sm:text-3xl font-black mb-12 opacity-90">{t("landing.stats.title")}</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
          {items.map((s, i) => (
            <div key={i} className="text-center">
              <div className="text-4xl sm:text-6xl font-black tracking-tight">{s.n}</div>
              <div className="mt-2 text-sm sm:text-base font-medium opacity-90">{s.l}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Testimonials() {
  const { t } = useT();
  const items = (t("landing.testimonials.items", { returnObjects: true }) as { q: string; n: string; b: string; c: string }[]) ?? [];
  return (
    <section id="customers" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 text-center mb-16">{t("landing.testimonials.title")}</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((it, i) => (
            <div key={i} className="bg-white rounded-2xl p-8 border border-slate-100 shadow-sm hover:shadow-xl transition">
              <div className="flex gap-1 text-amber-400 mb-4">
                {[0,1,2,3,4].map(k => <Star key={k} className="w-5 h-5 fill-current" />)}
              </div>
              <p className="text-slate-700 leading-relaxed">"{it.q}"</p>
              <div className="mt-6 flex items-center gap-3 pt-6 border-t border-slate-100">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-[#094735] to-teal-500 text-white font-bold flex items-center justify-center">
                  {it.n.charAt(0)}
                </div>
                <div>
                  <div className="font-bold text-slate-900">{it.n}</div>
                  <div className="text-sm text-slate-500">{it.b} • {it.c}</div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Pricing() {
  const { t } = useT();
  const [yearly, setYearly] = useState(false);
  const plans = (t("landing.pricing.plans", { returnObjects: true }) as { name: string; price: string; priceYearly?: string; desc: string; popular?: boolean; features: string[] }[]) ?? [];
  return (
    <section id="pricing" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-12">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.pricing.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.pricing.subtitle")}</p>
          <div className="mt-8 inline-flex items-center bg-slate-100 rounded-full p-1 text-sm font-bold">
            <button onClick={() => setYearly(false)} className={`px-5 py-2 rounded-full transition ${!yearly ? "bg-white text-[#0d5c46] shadow" : "text-slate-600"}`}>{t("landing.pricing.monthly")}</button>
            <button onClick={() => setYearly(true)} className={`px-5 py-2 rounded-full transition ${yearly ? "bg-white text-[#0d5c46] shadow" : "text-slate-600"}`}>{t("landing.pricing.yearly")}</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto items-stretch">
          {plans.map((p, i) => {
            const popular = p.popular ?? (i === 2);
            const displayPrice = (yearly && p.priceYearly) ? p.priceYearly : p.price;
            return (
              <div key={i} className={`relative flex flex-col justify-between rounded-3xl p-6 sm:p-7 border-2 transition ${popular ? "border-[#0d5c46] shadow-2xl shadow-emerald-900/15 scale-[1.02] bg-white ring-2 ring-emerald-600/15" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg"}`}>
                {popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-[#0d5c46] text-white text-xs font-bold uppercase tracking-wider">{t("landing.pricing.popular")}</div>
                )}
                <div>
                  <h3 className="font-bold text-xl text-slate-900">{p.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 min-h-[38px]">{p.desc}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black text-slate-900">{displayPrice}</span>
                    {displayPrice.startsWith("৳") && <span className="text-slate-500 font-semibold text-xs sm:text-sm">{t("landing.pricing.month")}</span>}
                  </div>
                  <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className={`mt-6 block w-full py-3 rounded-full text-center text-sm font-bold transition ${popular ? "bg-[#0d5c46] text-white hover:bg-[#094735] shadow-md shadow-emerald-900/20" : "bg-slate-100 text-slate-900 hover:bg-slate-200"}`}>
                    {t("landing.pricing.cta")}
                  </Link>
                  <ul className="mt-6 space-y-2.5">
                    {p.features.map((f, k) => (
                      <li key={k} className="flex items-start gap-2 text-xs sm:text-sm text-slate-700">
                        <Check className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" /> {T(f)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Banner() {
  const { t } = useT();
  return (
    <section className="relative py-24 overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-[#0d624a]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(16,185,129,0.35),transparent_60%)]" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{t("landing.banner.title")}</h2>
        <p className="mt-4 text-lg opacity-90">{t("landing.banner.subtitle")}</p>
        <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-[#0d5c46] bg-white hover:scale-105 shadow-2xl transition">
          {t("landing.banner.cta")} <ArrowRight className="w-5 h-5" />
        </Link>
      </div>
    </section>
  );
}

function FAQ() {
  const { t } = useT();
  const items = (t("landing.faq.items", { returnObjects: true }) as { q: string; a: string }[]) ?? [];
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section className="py-24 bg-slate-50">
      <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 text-center mb-12">{t("landing.faq.title")}</h2>
        <div className="space-y-3">
          {items.map((it, i) => (
            <div key={i} className="bg-white rounded-2xl border border-slate-100 overflow-hidden">
              <button onClick={() => setOpen(open === i ? null : i)} className="w-full flex items-center justify-between p-5 text-left">
                <span className="font-bold text-slate-900">{it.q}</span>
                {open === i ? <Minus className="w-5 h-5 text-[#0d5c46]" /> : <Plus className="w-5 h-5 text-slate-400" />}
              </button>
              {open === i && <div className="px-5 pb-5 text-slate-600 leading-relaxed">{it.a}</div>}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Blog() {
  const { t } = useT();
  const items = (t("landing.blog.items", { returnObjects: true }) as { cat: string; date: string; t: string }[]) ?? [];
  return (
    <section id="blog" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-3xl mx-auto mb-14">
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.blog.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.blog.subtitle")}</p>
        </div>
        <div className="grid md:grid-cols-3 gap-6">
          {items.map((it, i) => (
            <article key={i} className="group rounded-2xl overflow-hidden border border-slate-100 hover:shadow-xl transition">
              <div className="aspect-[16/10] bg-gradient-to-br from-emerald-100 via-teal-50 to-sky-100 group-hover:scale-105 transition-transform duration-500" />
              <div className="p-6">
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  <span className="text-[#0d5c46]">{it.cat}</span>
                  <span>•</span>
                  <span>{it.date}</span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 group-hover:text-[#0d5c46] transition">{it.t}</h3>
                <a href="#" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-[#0d5c46]">{t("landing.blog.readMore")} <ArrowRight className="w-4 h-4" /></a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const { t, lang } = useT();
  const [sent, setSent] = useState(false);
  const supportPhone = t("landing.contact.supportPhone", { defaultValue: "01951413828" });
  const salesPhone = t("landing.contact.salesPhone", { defaultValue: "01951413828" });
  const whatsappPhone = t("landing.contact.whatsappPhone", { defaultValue: "01951413828" });
  const emailAddress = t("landing.contact.emailAddress", { defaultValue: "support@sohojpharma.cloud" });
  const officeAddress = t("landing.contact.officeAddress", { defaultValue: "Dhaka, Bangladesh" });

  return (
    <section id="contact" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
        <div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.contact.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.contact.subtitle")}</p>
          <div className="mt-8 space-y-4">
            {[
              { i: Headphones, l: t("landing.contact.support"), v: supportPhone },
              { i: Phone, l: t("landing.contact.sales"), v: salesPhone },
              { i: MessageCircle, l: t("landing.contact.whatsapp"), v: whatsappPhone },
              { i: Mail, l: "Email", v: emailAddress },
              { i: MapPin, l: "Office", v: officeAddress },
            ].map(({ i: Icon, l, v }, k) => (
              <div key={k} className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-emerald-100 text-[#0d5c46] flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{l}</div>
                  <div className="font-bold text-slate-900">{v}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            (e.currentTarget as HTMLFormElement).reset();
            setSent(true);
            toast.success(
              lang === "bn"
                ? "আপনার বার্তা গ্রহণ করা হয়েছে! আমাদের টিম শীঘ্রই যোগাযোগ করবে।"
                : "Message received! Our team will contact you shortly.",
            );
          }}
          className="bg-white rounded-3xl p-8 border border-slate-200/80 shadow-sm space-y-4"
        >
          {[
            { k: "name", type: "text" }, { k: "business", type: "text" }, { k: "phone", type: "tel" }, { k: "email", type: "email" },
          ].map(({ k, type }) => (
            <div key={k}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t(`landing.contact.${k}`)}</label>
              <input type={type} required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#0d5c46] focus:ring-2 focus:ring-emerald-100 outline-none transition" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("landing.contact.message")}</label>
            <textarea rows={4} required className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-[#0d5c46] focus:ring-2 focus:ring-emerald-100 outline-none transition resize-none" />
          </div>
          <button type="submit" className="w-full py-3.5 rounded-xl bg-gradient-to-r from-[#094735] via-[#0d5c46] to-[#117257] text-white font-bold hover:brightness-105 transition shadow-lg shadow-emerald-900/20">
            {sent ? (lang === "bn" ? "বার্তা পাঠানো হয়েছে ✓" : "Message Sent ✓") : t("landing.contact.send")}
          </button>
        </form>
      </div>
    </section>
  );
}

function FinalCTA() {
  const { t } = useT();
  return (
    <section className="py-24 bg-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.finalCta.title")}</h2>
        <p className="mt-4 text-lg text-slate-600">{t("landing.finalCta.subtitle")}</p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-white bg-gradient-to-r from-[#094735] to-[#0d5c46] hover:brightness-105 shadow-xl shadow-emerald-900/25 transition hover:scale-105">
            {t("landing.finalCta.primary")} <ArrowRight className="w-5 h-5" />
          </Link>
          <a href="#contact" className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-slate-900 bg-slate-100 hover:bg-slate-200 transition">
            {t("landing.finalCta.secondary")}
          </a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const { t } = useT();
  const cols = [
    { title: "footer.products", links: ["nav.features", "nav.modules", "nav.pricing"] },
    { title: "footer.resources", links: ["footer.blog", "footer.help", "nav.contact"] },
    { title: "footer.legal", links: ["footer.privacy", "footer.terms", "footer.refund"] },
  ];
  return (
    <footer className="bg-slate-900 text-slate-300 pt-20 pb-10">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-10">
          <div className="col-span-2">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#0d5c46] rounded-xl flex items-center justify-center">
                <Pill className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-extrabold text-white">Sohoj<span className="text-emerald-400">Pharma</span></span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs">{t("landing.footer.tagline")}</p>
            <div className="mt-6">
              <h4 className="font-bold text-white text-sm">{t("landing.footer.newsletter")}</h4>
              <p className="text-xs text-slate-400 mt-1">{t("landing.footer.newsletterDesc")}</p>
              <form className="mt-3 flex gap-2">
                <input type="email" placeholder={t("landing.footer.emailPlaceholder")} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-[#0d5c46] outline-none" />
                <button type="submit" className="px-4 py-2.5 rounded-lg bg-gradient-to-r from-[#094735] to-[#0d5c46] hover:brightness-105 text-white text-sm font-bold transition">{t("landing.footer.subscribe")}</button>
              </form>
            </div>
          </div>
          {cols.map((c, i) => (
            <div key={i}>
              <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider">{t(`landing.${c.title}`)}</h4>
              <ul className="space-y-2 text-sm">
                {c.links.map((l) => <li key={l}><a href="#" className="hover:text-emerald-400 transition">{t(`landing.${l}`)}</a></li>)}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-14 pt-8 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-500">
          <span>{t("landing.footer.copyright")}</span>
          <LangToggle />
        </div>
      </div>
    </footer>
  );
}

function Landing() {
  useThemeInit();
  useLandingCmsBootstrap();
  const { t, lang } = useT();
  const whatsappPhone = t("landing.contact.whatsappPhone", { defaultValue: "01951413828" });
  return (
    <div
      className="w-full antialiased text-slate-900 bg-[#FAFAFA]"
      style={{ fontFamily: lang === "bn" ? "'Hind Siliguri', 'Inter', sans-serif" : "'Inter', sans-serif" }}
    >
      <Navbar />
      <Hero />
      <TrustedBy />
      <Problems />
      <WhySohojPharma />
      <Modules />
      <Highlights />
      <MobileApp />
      <Benefits />
      <Stats />
      <Testimonials />
      <Pricing />
      <Banner />
      <FAQ />
      <FinalCTA />
      <Footer />
      <WhatsAppChatbot phone={typeof whatsappPhone === "string" ? whatsappPhone : "01951413828"} />
    </div>
  );
}
