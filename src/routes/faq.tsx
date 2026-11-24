import { createFileRoute } from "@tanstack/react-router";
import { MarketingShell } from "@/components/marketing/marketing-shell";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";

const faqs = [
  { q: "Is there a free trial?", a: "Yes — every plan includes a 14-day free trial. No credit card required." },
  { q: "Can I switch plans later?", a: "Anytime. Upgrades take effect immediately; downgrades take effect at the end of the current billing period." },
  { q: "Do you support multiple branches?", a: "Yes. Professional supports up to 3 branches; Enterprise is unlimited with central reporting." },
  { q: "What payment methods do you accept?", a: "Cards via Stripe, plus bKash and Nagad for Bangladeshi customers." },
  { q: "Does SohojPharma work offline?", a: "Yes. The POS is an installable PWA — you can keep selling without internet and sync automatically when back online." },
  { q: "How is my data protected?", a: "All tenant data is isolated by row-level security, encrypted in transit and at rest, and backed up daily." },
  { q: "Can I import data from my current system?", a: "Yes — CSV import for products, customers, suppliers and opening stock. Our team helps with the first import on paid plans." },
  { q: "Is the interface available in Bangla?", a: "Fully bilingual — English and বাংলা, switchable per user." },
];

const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: faqs.map((f) => ({
    "@type": "Question",
    name: f.q,
    acceptedAnswer: { "@type": "Answer", text: f.a },
  })),
};

export const Route = createFileRoute("/faq")({
  head: () => ({
    meta: [
      { title: "FAQ — SohojPharma" },
      { name: "description", content: "Answers about pricing, trials, branches, offline mode, payments and security for SohojPharma pharmacy ERP." },
      { property: "og:title", content: "SohojPharma — Frequently Asked Questions" },
      { property: "og:description", content: "Everything you need to know before starting your free trial." },
    ],
    links: [{ rel: "canonical", href: "/faq" }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify(faqJsonLd) },
    ],
  }),
  component: FAQPage,
});

function FAQPage() {
  return (
    <MarketingShell>
      <section className="border-b border-border bg-muted/30 py-16">
        <div className="mx-auto max-w-3xl px-4 text-center lg:px-8">
          <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">Frequently asked questions</h1>
          <p className="mt-4 text-muted-foreground">Can't find what you're looking for? Reach out via our contact page.</p>
        </div>
      </section>
      <section className="py-16">
        <div className="mx-auto max-w-3xl px-4 lg:px-8">
          <Accordion type="single" collapsible className="w-full">
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{f.q}</AccordionTrigger>
                <AccordionContent>{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>
    </MarketingShell>
  );
}
