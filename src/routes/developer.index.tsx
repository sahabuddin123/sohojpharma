import { createFileRoute, Link } from "@tanstack/react-router";
import { RouteErrorPanel } from "@/components/route-error";
import { useTranslation } from "react-i18next";
import { KeyRound, BookOpen, Webhook, BarChart3, Shield, Code2 } from "lucide-react";

export const Route = createFileRoute("/developer/")({ errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />, component: OverviewPage });

const cards = [
  { to: "/developer/keys", icon: KeyRound, k: "apiKeys" },
  { to: "/developer/docs", icon: BookOpen, k: "apiDocs" },
  { to: "/developer/webhooks", icon: Webhook, k: "webhooks" },
  { to: "/developer/analytics", icon: BarChart3, k: "analytics" },
] as const;

const sdks = [
  { name: "Flutter", cmd: "flutter pub add sohojpharma" },
  { name: "React / Next.js", cmd: "npm i @sohojpharma/sdk" },
  { name: "Android (Kotlin)", cmd: "implementation(\"cloud.pharma:sdk:1.0\")" },
  { name: "iOS (Swift)", cmd: ".package(url: \"github.com/sohojpharma/swift\", from: \"1.0.0\")" },
];

function OverviewPage() {
  const { t } = useTranslation();
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border bg-gradient-to-br from-primary/10 to-card p-6">
        <div className="flex items-center gap-3">
          <Shield className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-semibold">{t("sections.developer.baseUrl")}</h2>
        </div>
        <code className="mt-2 inline-block rounded-md bg-muted px-3 py-1.5 text-sm">https://api.pharma.cloud/v1</code>
        <p className="mt-3 text-sm text-muted-foreground">{t("sections.developer.baseUrlDesc")}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((c) => (
          <Link key={c.to} to={c.to} className="rounded-2xl border bg-card p-5 hover:border-primary/50 transition">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary"><c.icon className="h-5 w-5" /></span>
            <p className="mt-3 text-sm font-semibold">{t(`sections.developer.${c.k}`)}</p>
            <p className="text-xs text-muted-foreground">{t(`sections.developer.${c.k}Desc`)}</p>
          </Link>
        ))}
      </div>

      <section className="rounded-2xl border bg-card p-5">
        <div className="mb-3 flex items-center gap-2"><Code2 className="h-4 w-4 text-primary" /><h3 className="text-sm font-semibold">{t("sections.developer.sdks")}</h3></div>
        <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
          {sdks.map((s) => (
            <div key={s.name} className="rounded-lg border bg-background p-3">
              <p className="text-xs font-medium text-muted-foreground">{s.name}</p>
              <code className="mt-1 block text-xs">{s.cmd}</code>
            </div>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">{t("sections.developer.downloadPostman")}</button>
          <button className="rounded-md border px-3 py-1.5 text-xs hover:bg-muted">{t("sections.developer.downloadOpenapi")}</button>
        </div>
      </section>
    </div>
  );
}
