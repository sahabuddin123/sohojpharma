import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Mail, Phone, MapPin, Loader2 } from "lucide-react";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useTranslation } from "react-i18next";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact SohojPharma — Talk to Sales" },
      { name: "description", content: "Get in touch with the SohojPharma team for demos, pricing questions, partnerships and support." },
      { property: "og:title", content: "Contact SohojPharma" },
      { property: "og:description", content: "We typically reply within one business day." },
    ],
    links: [{ rel: "canonical", href: "/contact" }],
  }),
  component: ContactPage,
});

function ContactPage() {

  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", message: "" });

  function update<K extends keyof typeof form>(k: K, v: string) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      toast.error(t("toast.fillContactFields"));
      return;
    }
    setSubmitting(true);
    try {
      const params = new URLSearchParams(typeof window !== "undefined" ? window.location.search : "");
      const { error } = await supabase.from("leads").insert({
        name: form.name,
        email: form.email,
        phone: form.phone || null,
        company: form.company || null,
        message: form.message,
        source: "contact-form",
        utm_source: params.get("utm_source"),
        utm_medium: params.get("utm_medium"),
        utm_campaign: params.get("utm_campaign"),
      });
      if (error) throw error;
      toast.success(t("toast.contactSent"));
      setForm({ name: "", email: "", phone: "", company: "", message: "" });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to send message");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MarketingShell>
      <section className="border-b border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Talk to our team</h1>
          <p className="mt-4 text-muted-foreground">Demos, pricing, partnerships — we typically reply within one business day.</p>
        </div>
      </section>

      <section className="py-16">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 lg:grid-cols-[1fr_2fr] lg:px-8">
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary"><Mail className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-semibold">Email</p>
                <p className="text-sm text-muted-foreground">hello@sohojpharma.cloud</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary"><Phone className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-semibold">Phone</p>
                <p className="text-sm text-muted-foreground">+880 1700 000 000</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-primary-soft text-primary"><MapPin className="h-5 w-5" /></div>
              <div>
                <p className="text-sm font-semibold">Office</p>
                <p className="text-sm text-muted-foreground">Dhaka, Bangladesh</p>
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid grid-cols-2 gap-4 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="name">Name *</Label>
                    <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email *</Label>
                    <Input id="email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} required />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="phone">Phone</Label>
                    <Input id="phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="company">Pharmacy / Company</Label>
                    <Input id="company" value={form.company} onChange={(e) => update("company", e.target.value)} />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="message">Message *</Label>
                  <Textarea id="message" rows={5} value={form.message} onChange={(e) => update("message", e.target.value)} required />
                </div>
                <Button type="submit" disabled={submitting} className="w-full sm:w-auto">
                  {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Send message
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </section>
    </MarketingShell>
  );
}
