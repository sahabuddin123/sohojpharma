import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "@/i18n";
import { getLandingCms } from "@/lib/api/landing-cms.functions";
import {
  Pill, Check, ArrowRight, Boxes, ShoppingCart, BarChart3, Bell, Database,
  Receipt, AlertTriangle, FileX, ClipboardList, FileText, PackageX, TrendingDown, ShieldAlert,
  Users, Truck, RotateCcw, Cloud, Zap, Shield, RefreshCw, WifiOff, Building2, UserCog,
  Sparkles, Globe, Headphones, Star, Smartphone, Apple, QrCode, Phone, MessageCircle, Mail, MapPin, Menu, X, Plus, Minus,
} from "lucide-react";
import { RouteErrorPanel } from "@/components/route-error";
import { useThemeInit } from "@/hooks/use-theme-init";

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
      { property: "og:url", content: "https://cloudpharama.lovable.app/" },
    ],
    links: [
      { rel: "canonical", href: "https://cloudpharama.lovable.app/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Hind+Siliguri:wght@400;500;600;700&display=swap" },
    ],
  }),
  component: Landing,
});

const T = (val: unknown): string => (typeof val === "string" ? val : "");

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
        className={`px-3 py-1.5 rounded-full transition ${lang === "bn" ? "bg-white text-rose-600 shadow" : "text-slate-600"}`}
      >বাংলা</button>
      <button
        onClick={() => i18n.changeLanguage("en")}
        className={`px-3 py-1.5 rounded-full transition ${lang === "en" ? "bg-white text-rose-600 shadow" : "text-slate-600"}`}
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
    { href: "#blog", k: "nav.resources" },
    { href: "#contact", k: "nav.contact" },
  ];
  return (
    <nav className={`sticky top-0 z-50 transition-all ${scrolled ? "bg-white/90 backdrop-blur-md border-b border-slate-100 shadow-sm" : "bg-transparent"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20 items-center">
          <Link to="/" className="flex items-center gap-3 shrink-0">
            <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center shadow-lg shadow-rose-200">
              <Pill className="w-6 h-6 text-white" strokeWidth={2.5} />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="text-xl font-extrabold tracking-tight text-slate-900">
                Sohoj<span className="text-rose-600">Pharma</span>
              </span>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">ERP & POS</span>
            </div>
          </Link>
          <div className="hidden lg:flex items-center gap-8 text-sm font-semibold">
            {links.map((l) => (
              <a key={l.k} href={l.href} className="text-slate-700 hover:text-rose-600 transition">{t(`landing.${l.k}`)}</a>
            ))}
          </div>
          <div className="hidden md:flex items-center gap-3">
            <LangToggle />
            <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="text-sm font-bold text-slate-700 hover:text-rose-600 px-3 py-2">{t("landing.nav.login")}</Link>
            <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold text-white bg-rose-600 hover:bg-rose-700 transition shadow-md shadow-rose-200 active:scale-95">
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
              <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="px-5 py-2.5 rounded-full text-sm font-bold text-white bg-rose-600 text-center">{t("landing.nav.trial")}</Link>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}

function Hero() {
  const { t } = useT();
  const cards = [
    { i: Boxes, k: "card1" }, { i: ShoppingCart, k: "card2" }, { i: BarChart3, k: "card3" },
    { i: TrendingDown, k: "card4" }, { i: Bell, k: "card5" }, { i: Database, k: "card6" },
  ];
  return (
    <section id="home" className="relative overflow-hidden pt-16 pb-24">
      <div className="absolute inset-0 -z-10 bg-gradient-to-b from-rose-50/70 via-white to-slate-50" />
      <div className="absolute top-20 -left-32 w-96 h-96 bg-rose-200/40 rounded-full blur-3xl -z-10" />
      <div className="absolute top-40 right-0 w-80 h-80 bg-orange-200/40 rounded-full blur-3xl -z-10" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-rose-100 text-rose-700 text-xs font-bold mb-6 animate-fade-in">
          <Sparkles className="w-3.5 h-3.5" /> {t("landing.hero.badge")}
        </div>
        <h1 className="text-4xl sm:text-5xl lg:text-7xl font-black tracking-tight text-slate-900 max-w-5xl mx-auto leading-[1.05] animate-fade-in">
          {t("landing.hero.title")}
        </h1>
        <p className="mt-6 text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto leading-relaxed">{t("landing.hero.subtitle")}</p>
        <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4">
          <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xl shadow-rose-300/50 transition hover:scale-105">
            {t("landing.hero.ctaPrimary")} <ArrowRight className="w-5 h-5" />
          </Link>
          <a href="#contact" className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-slate-900 bg-white border border-slate-200 hover:border-slate-300 shadow-sm transition">
            {t("landing.hero.ctaSecondary")}
          </a>
        </div>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-slate-500 font-medium">
          {["tag1", "tag2", "tag3"].map((k) => (
            <span key={k} className="inline-flex items-center gap-1.5"><Check className="w-4 h-4 text-emerald-500" />{t(`landing.hero.${k}`)}</span>
          ))}
        </div>
        {/* Dashboard mockup */}
        <div className="mt-16 relative max-w-5xl mx-auto">
          <div className="absolute -inset-4 bg-gradient-to-r from-rose-300/40 to-orange-300/40 blur-2xl rounded-3xl -z-10" />
          <div className="rounded-3xl bg-white border border-slate-200 shadow-2xl shadow-slate-300/40 p-4 sm:p-6">
            <div className="rounded-2xl bg-gradient-to-br from-slate-900 to-slate-800 p-6 sm:p-10 text-left">
              <div className="flex items-center justify-between mb-6">
                <div className="flex gap-1.5">
                  <span className="w-3 h-3 rounded-full bg-red-400" />
                  <span className="w-3 h-3 rounded-full bg-yellow-400" />
                  <span className="w-3 h-3 rounded-full bg-green-400" />
                </div>
                <span className="text-xs text-slate-400 font-mono">app.sohojpharma.cloud/dashboard</span>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
                {cards.map(({ i: Icon, k }, idx) => (
                  <div key={k} className="bg-white/5 backdrop-blur border border-white/10 rounded-xl p-4 hover:bg-white/10 transition" style={{ animationDelay: `${idx * 100}ms` }}>
                    <Icon className="w-5 h-5 text-rose-400 mb-2" />
                    <div className="text-white text-sm font-bold">{t(`landing.hero.${k}`)}</div>
                    <div className="text-slate-400 text-xs mt-0.5">{t(`landing.hero.${k}Sub`)}</div>
                  </div>
                ))}
              </div>
              <div className="mt-4 grid grid-cols-3 gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-24 bg-white/5 border border-white/10 rounded-xl flex items-end p-3 gap-1">
                    {[40, 65, 35, 80, 55, 70, 90].map((h, j) => (
                      <div key={j} className="flex-1 bg-rose-400/60 rounded-sm" style={{ height: `${h}%` }} />
                    ))}
                  </div>
                ))}
              </div>
            </div>
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
    <section className="py-14 bg-white border-y border-slate-100 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <p className="text-center text-xs font-bold uppercase tracking-widest text-slate-500 mb-8">{t("landing.trust.title")}</p>
        <div className="relative">
          <div className="flex gap-12 animate-[marquee_30s_linear_infinite] items-center">
            {loop.map((it, i) => (
              <div key={`${it.id}-${i}`} className="flex items-center gap-3 text-slate-500 font-bold text-lg whitespace-nowrap shrink-0">
                {it.logo_url ? (
                  <img src={it.logo_url} alt={it.name} className="h-10 w-auto max-w-[140px] object-contain grayscale hover:grayscale-0 transition" loading="lazy" />
                ) : (
                  <><Building2 className="w-5 h-5" /> {it.name}</>
                )}
              </div>
            ))}
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
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900 leading-tight">{t("landing.problems.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.problems.subtitle")}</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {list.map((it, i) => {
            const Icon = icons[i] ?? AlertTriangle;
            return (
              <div key={i} className="bg-white rounded-2xl p-6 border border-slate-100 hover:border-rose-200 hover:shadow-lg transition">
                <div className="w-12 h-12 rounded-xl bg-rose-50 flex items-center justify-center mb-4">
                  <Icon className="w-6 h-6 text-rose-600" />
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
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.why.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.why.subtitle")}</p>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {items.map((it, i) => {
            const Icon = icons[i] ?? Boxes;
            return (
              <div key={i} className="group rounded-2xl border border-slate-200 p-5 hover:border-rose-300 hover:shadow-lg hover:-translate-y-1 transition">
                <Icon className="w-7 h-7 text-rose-600 mb-3" />
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
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.modules.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.modules.subtitle")}</p>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
          {items.map((m, i) => {
            const Icon = moduleIcons[i % moduleIcons.length];
            return (
              <div key={i} className="aspect-square rounded-2xl bg-white border border-slate-200 flex flex-col items-center justify-center gap-2 hover:border-rose-300 hover:shadow-md transition">
                <div className="w-10 h-10 rounded-xl bg-rose-50 flex items-center justify-center">
                  <Icon className="w-5 h-5 text-rose-600" />
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
  return (
    <section className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <h2 className="text-3xl sm:text-5xl font-black text-slate-900 text-center max-w-3xl mx-auto mb-20">{t("landing.highlights.title")}</h2>
        <div className="space-y-24">
          {items.map((it, i) => (
            <div key={i} className={`grid lg:grid-cols-2 gap-10 lg:gap-16 items-center ${i % 2 ? "lg:[&>div:first-child]:order-2" : ""}`}>
              <div>
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-rose-100 text-rose-600 mb-5">
                  <Sparkles className="w-6 h-6" />
                </div>
                <h3 className="text-2xl sm:text-4xl font-black text-slate-900">{it.t}</h3>
                <p className="mt-4 text-lg text-slate-600 leading-relaxed">{it.d}</p>
                <a href="#contact" className="mt-6 inline-flex items-center gap-2 font-bold text-rose-600 hover:gap-3 transition-all">
                  {it.cta} <ArrowRight className="w-4 h-4" />
                </a>
              </div>
              <div className="rounded-3xl bg-gradient-to-br from-slate-100 to-slate-50 border border-slate-200 aspect-[4/3] flex items-center justify-center shadow-xl overflow-hidden">
                {it.image ? (
                  <img src={it.image} alt={it.t} className="w-full h-full object-cover" />
                ) : (
                  <div className="w-3/4 h-3/4 rounded-2xl bg-white shadow-lg p-5 flex flex-col gap-3">
                    <div className="h-3 w-1/3 bg-slate-200 rounded" />
                    <div className="h-2 w-2/3 bg-slate-100 rounded" />
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[0,1,2,3,4,5].map((k) => <div key={k} className="h-16 bg-rose-100/50 rounded-lg" />)}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function MobileApp() {
  const { t } = useT();
  return (
    <section className="py-24 bg-slate-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_50%,rgba(244,63,94,0.2),transparent_60%)]" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 relative grid lg:grid-cols-2 gap-12 items-center">
        <div>
          <h2 className="text-3xl sm:text-5xl font-black leading-tight">{t("landing.mobile.title")}</h2>
          <p className="mt-4 text-lg text-slate-300">{t("landing.mobile.subtitle")}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <a href="#" className="inline-flex items-center gap-3 bg-white text-slate-900 px-5 py-3 rounded-xl font-bold hover:scale-105 transition">
              <Smartphone className="w-6 h-6" /> {t("landing.mobile.android")}
            </a>
            <a href="#" className="inline-flex items-center gap-3 bg-white text-slate-900 px-5 py-3 rounded-xl font-bold hover:scale-105 transition">
              <Apple className="w-6 h-6" /> {t("landing.mobile.ios")}
            </a>
            <div className="inline-flex items-center gap-3 bg-white/10 border border-white/20 px-5 py-3 rounded-xl font-bold">
              <QrCode className="w-6 h-6" /> {t("landing.mobile.qr")}
            </div>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <div className="w-56 h-[420px] bg-gradient-to-b from-slate-700 to-slate-800 rounded-[2.5rem] border-8 border-slate-900 shadow-2xl p-3 -rotate-6">
            <div className="h-full bg-white rounded-[1.8rem] p-3 flex flex-col gap-2">
              <div className="h-2 w-1/3 bg-rose-200 rounded" />
              {[0,1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-100 rounded-lg" />)}
            </div>
          </div>
          <div className="w-56 h-[420px] bg-gradient-to-b from-slate-700 to-slate-800 rounded-[2.5rem] border-8 border-slate-900 shadow-2xl p-3 rotate-6 mt-10">
            <div className="h-full bg-rose-600 rounded-[1.8rem] p-3 text-white flex flex-col gap-2">
              <div className="h-2 w-1/2 bg-white/40 rounded" />
              <div className="text-2xl font-black mt-4">৳ 24,500</div>
              <div className="text-xs opacity-80">Today's sales</div>
              <div className="grid grid-cols-2 gap-2 mt-3">
                {[0,1,2,3].map(i => <div key={i} className="h-14 bg-white/10 rounded-lg" />)}
              </div>
            </div>
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
            const Icon = icons[i] ?? Sparkles;
            return (
              <div key={i} className="rounded-2xl p-6 bg-gradient-to-br from-white to-slate-50 border border-slate-100 hover:shadow-lg hover:border-rose-200 transition">
                <Icon className="w-8 h-8 text-rose-600 mb-3" />
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
    <section className="py-20 bg-gradient-to-r from-rose-600 to-rose-700 text-white">
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
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-rose-400 to-orange-400 text-white font-bold flex items-center justify-center">
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
            <button onClick={() => setYearly(false)} className={`px-5 py-2 rounded-full transition ${!yearly ? "bg-white text-rose-600 shadow" : "text-slate-600"}`}>{t("landing.pricing.monthly")}</button>
            <button onClick={() => setYearly(true)} className={`px-5 py-2 rounded-full transition ${yearly ? "bg-white text-rose-600 shadow" : "text-slate-600"}`}>{t("landing.pricing.yearly")}</button>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-7xl mx-auto items-stretch">
          {plans.map((p, i) => {
            const popular = p.popular ?? (i === 2);
            const displayPrice = (yearly && p.priceYearly) ? p.priceYearly : p.price;
            return (
              <div key={i} className={`relative flex flex-col justify-between rounded-3xl p-6 sm:p-7 border-2 transition ${popular ? "border-rose-600 shadow-2xl shadow-rose-200/50 scale-[1.02] bg-white ring-2 ring-rose-600/20" : "border-slate-200 bg-white hover:border-slate-300 hover:shadow-lg"}`}>
                {popular && (
                  <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-4 py-1 rounded-full bg-rose-600 text-white text-xs font-bold uppercase tracking-wider">{t("landing.pricing.popular")}</div>
                )}
                <div>
                  <h3 className="font-bold text-xl text-slate-900">{p.name}</h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-1 min-h-[38px]">{p.desc}</p>
                  <div className="mt-4 flex items-baseline gap-1">
                    <span className="text-4xl sm:text-5xl font-black text-slate-900">{displayPrice}</span>
                    {displayPrice.startsWith("৳") && <span className="text-slate-500 font-semibold text-xs sm:text-sm">{t("landing.pricing.month")}</span>}
                  </div>
                  <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className={`mt-6 block w-full py-3 rounded-full text-center text-sm font-bold transition ${popular ? "bg-rose-600 text-white hover:bg-rose-700 shadow-md shadow-rose-200" : "bg-slate-100 text-slate-900 hover:bg-slate-200"}`}>
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
      <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-rose-900" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_30%,rgba(244,63,94,0.4),transparent_60%)]" />
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center text-white">
        <h2 className="text-3xl sm:text-5xl font-black leading-tight">{t("landing.banner.title")}</h2>
        <p className="mt-4 text-lg opacity-90">{t("landing.banner.subtitle")}</p>
        <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="mt-8 inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-rose-600 bg-white hover:scale-105 shadow-2xl transition">
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
                {open === i ? <Minus className="w-5 h-5 text-rose-600" /> : <Plus className="w-5 h-5 text-slate-400" />}
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
              <div className="aspect-[16/10] bg-gradient-to-br from-rose-100 via-orange-100 to-amber-100 group-hover:scale-105 transition-transform duration-500" />
              <div className="p-6">
                <div className="flex items-center gap-3 text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                  <span className="text-rose-600">{it.cat}</span>
                  <span>•</span>
                  <span>{it.date}</span>
                </div>
                <h3 className="font-bold text-lg text-slate-900 group-hover:text-rose-600 transition">{it.t}</h3>
                <a href="#" className="mt-4 inline-flex items-center gap-1 text-sm font-bold text-rose-600">{t("landing.blog.readMore")} <ArrowRight className="w-4 h-4" /></a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

function Contact() {
  const { t } = useT();
  return (
    <section id="contact" className="py-24 bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 grid lg:grid-cols-2 gap-12">
        <div>
          <h2 className="text-3xl sm:text-5xl font-black text-slate-900">{t("landing.contact.title")}</h2>
          <p className="mt-4 text-lg text-slate-600">{t("landing.contact.subtitle")}</p>
          <div className="mt-8 space-y-4">
            {[
              { i: Headphones, l: t("landing.contact.support"), v: "+880 1700-000000" },
              { i: Phone, l: t("landing.contact.sales"), v: "+880 1800-000000" },
              { i: MessageCircle, l: t("landing.contact.whatsapp"), v: "+880 1900-000000" },
              { i: Mail, l: "Email", v: "hello@sohojpharma.cloud" },
              { i: MapPin, l: "Office", v: "Dhaka, Bangladesh" },
            ].map(({ i: Icon, l, v }, k) => (
              <div key={k} className="flex items-center gap-4">
                <div className="w-11 h-11 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center"><Icon className="w-5 h-5" /></div>
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">{l}</div>
                  <div className="font-bold text-slate-900">{v}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-8 rounded-2xl overflow-hidden border border-slate-200 aspect-[16/9] bg-slate-200 flex items-center justify-center text-slate-400">
            <MapPin className="w-10 h-10" />
          </div>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); }} className="bg-white rounded-3xl p-8 border border-slate-100 shadow-sm space-y-4">
          {[
            { k: "name", type: "text" }, { k: "business", type: "text" }, { k: "phone", type: "tel" }, { k: "email", type: "email" },
          ].map(({ k, type }) => (
            <div key={k}>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">{t(`landing.contact.${k}`)}</label>
              <input type={type} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none transition" />
            </div>
          ))}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">{t("landing.contact.message")}</label>
            <textarea rows={4} className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:border-rose-500 focus:ring-2 focus:ring-rose-100 outline-none transition resize-none" />
          </div>
          <button type="submit" className="w-full py-3.5 rounded-xl bg-rose-600 text-white font-bold hover:bg-rose-700 transition shadow-lg shadow-rose-200">
            {t("landing.contact.send")}
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
          <Link to="/auth" search={{ redirect: undefined, blocked: undefined }} className="inline-flex items-center gap-2 px-8 py-4 rounded-full text-base font-bold text-white bg-rose-600 hover:bg-rose-700 shadow-xl shadow-rose-300/50 transition hover:scale-105">
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
              <div className="w-10 h-10 bg-rose-600 rounded-xl flex items-center justify-center">
                <Pill className="w-6 h-6 text-white" strokeWidth={2.5} />
              </div>
              <span className="text-xl font-extrabold text-white">Sohoj<span className="text-rose-500">Pharma</span></span>
            </div>
            <p className="text-sm text-slate-400 max-w-xs">{t("landing.footer.tagline")}</p>
            <div className="mt-6">
              <h4 className="font-bold text-white text-sm">{t("landing.footer.newsletter")}</h4>
              <p className="text-xs text-slate-400 mt-1">{t("landing.footer.newsletterDesc")}</p>
              <form className="mt-3 flex gap-2">
                <input type="email" placeholder={t("landing.footer.emailPlaceholder")} className="flex-1 px-4 py-2.5 rounded-lg bg-slate-800 border border-slate-700 text-sm focus:border-rose-500 outline-none" />
                <button type="submit" className="px-4 py-2.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold transition">{t("landing.footer.subscribe")}</button>
              </form>
            </div>
          </div>
          {cols.map((c, i) => (
            <div key={i}>
              <h4 className="font-bold text-white text-sm mb-4 uppercase tracking-wider">{t(`landing.${c.title}`)}</h4>
              <ul className="space-y-2 text-sm">
                {c.links.map((l) => <li key={l}><a href="#" className="hover:text-rose-400 transition">{t(`landing.${l}`)}</a></li>)}
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
  const { lang } = useT();
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
      <Blog />
      <Contact />
      <FinalCTA />
      <Footer />
    </div>
  );
}
