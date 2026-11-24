import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Save, RefreshCw, ExternalLink, Code2, FormInput } from "lucide-react";

import { AppShell } from "@/components/layout/app-shell";
import { PageHeader } from "@/components/dashboard/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { RouteErrorPanel } from "@/components/route-error";
import { LandingCmsEditor } from "@/components/admin/landing-cms-editor";
import { toast } from "sonner";

import { getLandingCms, updateLandingCms } from "@/lib/api/landing-cms.functions";

export const Route = createFileRoute("/admin/landing-cms")({
  errorComponent: (p) => <RouteErrorPanel error={p.error as Error} reset={p.reset} />,
  head: () => ({ meta: [{ title: "Landing CMS — Super Admin" }] }),
  component: LandingCmsPage,
});

const SECTION_KEYS = [
  "nav", "hero", "trust", "problems", "why", "modules", "highlights",
  "mobile", "benefits", "stats", "testimonials", "pricing", "banner",
  "faq", "blog", "contact", "finalCta", "footer",
] as const;

type Lang = "en" | "bn";
type Mode = "form" | "json";

type Doc = Record<string, unknown>;

function LandingCmsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [enDoc, setEnDoc] = useState<Doc>({});
  const [bnDoc, setBnDoc] = useState<Doc>({});
  const [activeLang, setActiveLang] = useState<Lang>("bn");
  const [activeSection, setActiveSection] = useState<string>(SECTION_KEYS[0]);
  const [mode, setMode] = useState<Mode>("form");
  const [jsonDraft, setJsonDraft] = useState<string>("{}");
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const currentDoc = activeLang === "en" ? enDoc : bnDoc;
  const sectionValue = (currentDoc as Doc)[activeSection];

  useEffect(() => {
    setJsonDraft(JSON.stringify(sectionValue ?? {}, null, 2));
    setJsonError(null);
  }, [activeSection, activeLang, enDoc, bnDoc]);

  async function reload() {
    setLoading(true);
    try {
      const res = await getLandingCms();
      setEnDoc(JSON.parse(res.content_en));
      setBnDoc(JSON.parse(res.content_bn));
      setUpdatedAt(res.updated_at);
      setDirty(false);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void reload();
  }, []);

  function setSectionValue(v: unknown) {
    const setter = activeLang === "en" ? setEnDoc : setBnDoc;
    setter((prev) => ({ ...prev, [activeSection]: v }));
    setDirty(true);
  }

  function commitJsonDraft(): boolean {
    try {
      const parsed = JSON.parse(jsonDraft);
      setSectionValue(parsed);
      setJsonError(null);
      return true;
    } catch (e) {
      setJsonError((e as Error).message);
      return false;
    }
  }

  async function saveAll() {
    if (mode === "json" && !commitJsonDraft()) {
      toast.error("Fix JSON error before saving");
      return;
    }
    setSaving(true);
    try {
      // pull latest doc state synchronously
      let nextEn = enDoc;
      let nextBn = bnDoc;
      if (mode === "json") {
        try {
          const parsed = JSON.parse(jsonDraft);
          if (activeLang === "en") nextEn = { ...enDoc, [activeSection]: parsed };
          else nextBn = { ...bnDoc, [activeSection]: parsed };
        } catch {
          /* already handled */
        }
      }
      await updateLandingCms({
        data: {
          content_en: JSON.stringify(nextEn),
          content_bn: JSON.stringify(nextBn),
        },
      });
      toast.success("Landing content saved — live on home page");
      await reload();
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const sectionTabs = useMemo(() => SECTION_KEYS, []);

  return (
    <AppShell variant="admin">
      <PageHeader
        title="Landing CMS"
        description="Edit every section of the public landing page. Upload images, change text, manage lists — no code or JSON needed."
      />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Button variant="outline" size="sm" onClick={() => void reload()} disabled={loading || saving}>
          <RefreshCw className={`mr-2 h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Reload
        </Button>
        <Button size="sm" onClick={() => void saveAll()} disabled={saving || loading}>
          {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save changes
        </Button>
        {dirty && <Badge variant="outline" className="text-amber-600 border-amber-300">Unsaved changes</Badge>}
        <a
          href="/"
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center text-sm text-primary hover:underline"
        >
          <ExternalLink className="mr-1 h-4 w-4" /> Preview home
        </a>
        {updatedAt && (
          <Badge variant="secondary" className="ml-auto">
            Last updated: {new Date(updatedAt).toLocaleString()}
          </Badge>
        )}
      </div>

      <Card>
        <CardHeader className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle className="flex items-center gap-3">
              <Tabs value={activeLang} onValueChange={(v) => setActiveLang(v as Lang)}>
                <TabsList>
                  <TabsTrigger value="bn">বাংলা</TabsTrigger>
                  <TabsTrigger value="en">English</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardTitle>
            <Tabs value={mode} onValueChange={(v) => setMode(v as Mode)}>
              <TabsList>
                <TabsTrigger value="form">
                  <FormInput className="mr-1.5 h-3.5 w-3.5" /> Form
                </TabsTrigger>
                <TabsTrigger value="json">
                  <Code2 className="mr-1.5 h-3.5 w-3.5" /> JSON
                </TabsTrigger>
              </TabsList>
            </Tabs>
          </div>
          <Tabs value={activeSection} onValueChange={setActiveSection}>
            <TabsList className="flex h-auto flex-wrap">
              {sectionTabs.map((s) => (
                <TabsTrigger key={s} value={s} className="capitalize">
                  {s}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : mode === "form" ? (
            <LandingCmsEditor
              section={activeSection}
              value={(sectionValue as never) ?? {}}
              onChange={(v) => setSectionValue(v)}
            />
          ) : (
            <div>
              <p className="mb-2 text-xs text-muted-foreground">
                Advanced JSON for <strong>{activeSection}</strong> ({activeLang === "en" ? "English" : "বাংলা"}). Keep
                keys identical between languages.
              </p>
              <Textarea
                value={jsonDraft}
                onChange={(e) => {
                  setJsonDraft(e.target.value);
                  setJsonError(null);
                  setDirty(true);
                }}
                onBlur={() => commitJsonDraft()}
                spellCheck={false}
                className="min-h-[480px] font-mono text-xs"
              />
              {jsonError && <p className="mt-2 text-xs text-destructive">JSON error: {jsonError}</p>}
            </div>
          )}
        </CardContent>
      </Card>
    </AppShell>
  );
}
