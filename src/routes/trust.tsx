import { createFileRoute, Link } from "@tanstack/react-router";
import { Shield, Lock, Database, FileCheck, Mail } from "lucide-react";

export const Route = createFileRoute("/trust")({
  head: () => ({
    meta: [
      { title: "Trust, Security & Privacy" },
      {
        name: "description",
        content:
          "How we protect pharmacy data: encryption, tenant isolation, access controls, backups, and privacy commitments.",
      },
      { property: "og:title", content: "Trust, Security & Privacy" },
      {
        property: "og:description",
        content:
          "Our security, privacy, and compliance controls for pharmacy data.",
      },
    ],
  }),
  component: TrustPage,
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border bg-card p-6">
      <div className="mb-3 flex items-center gap-3">
        <Icon className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="space-y-2 text-sm text-muted-foreground">{children}</div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12">
      <header className="mb-8">
        <h1 className="mb-2 text-3xl font-bold">Trust, Security & Privacy</h1>
        <p className="text-muted-foreground">
          We handle prescription, customer, and financial data on behalf of
          pharmacies. The controls below describe how that data is protected.
          Last updated: June 2026.
        </p>
      </header>

      <div className="space-y-4">
        <Section icon={Shield} title="Tenant isolation">
          <p>
            Every pharmacy operates inside its own tenant. Row-Level Security
            (RLS) is enforced on every customer-data table so a query from one
            tenant cannot read or write another tenant's rows, even with a
            valid login.
          </p>
        </Section>

        <Section icon={Lock} title="Encryption">
          <p>
            All traffic is TLS 1.2+ in transit. Data at rest is encrypted using
            AES-256 by the managed database. Backups inherit the same
            encryption.
          </p>
        </Section>

        <Section icon={Database} title="Backups & recovery">
          <p>
            Automated daily backups with point-in-time recovery (PITR) within
            the retention window. Restore procedures are documented and
            rehearsed; target RPO &lt; 24 h, RTO &lt; 4 h.
          </p>
        </Section>

        <Section icon={FileCheck} title="Access controls">
          <p>
            Role-based access (owner, manager, cashier) is enforced
            server-side. Privileged operations are logged to an immutable
            audit trail. Passwords are checked against the Have I Been Pwned
            breach corpus on sign-up and change.
          </p>
        </Section>

        <Section icon={Shield} title="Monitoring">
          <p>
            A public health endpoint and uptime monitoring track service
            availability. Application errors and security violations are
            captured for review.
          </p>
        </Section>

        <Section icon={FileCheck} title="Privacy">
          <p>
            We process patient and customer data only as required to deliver
            the pharmacy management service. Data is never sold. Tenants can
            export or request deletion of their data by contacting support.
          </p>
        </Section>

        <Section icon={Mail} title="Reporting a vulnerability">
          <p>
            If you believe you have found a security issue, please email our
            team via the{" "}
            <Link to="/contact" className="text-primary underline">
              contact page
            </Link>
            . We acknowledge reports within 2 business days.
          </p>
        </Section>
      </div>

      <p className="mt-8 text-xs text-muted-foreground">
        This page describes controls implemented by the application. It is
        provided for transparency and is not an independent certification.
      </p>
    </div>
  );
}
