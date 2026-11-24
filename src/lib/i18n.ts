import { useUIStore } from "@/stores/ui-store";

type Dict = Record<string, { en: string; bn: string }>;

export const dict = {
  "app.name": { en: "SohojPharma", bn: "সহজফার্মা" },
  "app.tagline": {
    en: "Multi-tenant Pharmacy ERP for modern medicine retail.",
    bn: "আধুনিক ঔষধ ব্যবসার জন্য মাল্টি-টেন্যান্ট ফার্মেসি ইআরপি।",
  },
  "nav.home": { en: "Home", bn: "হোম" },
  "nav.dashboard": { en: "Dashboard", bn: "ড্যাশবোর্ড" },
  "nav.products": { en: "Products", bn: "পণ্য" },
  "nav.sales": { en: "Sales", bn: "বিক্রয়" },
  "nav.invoices": { en: "Invoices", bn: "চালান" },
  "nav.purchases": { en: "Purchases", bn: "ক্রয়" },
  "nav.purchaseRequisition": { en: "Purchase Requisition", bn: "ক্রয় অনুরোধ" },
  "nav.purchaseRequisitionList": { en: "Purchase Requisition List", bn: "ক্রয় অনুরোধ তালিকা" },
  "nav.customers": { en: "Customers", bn: "গ্রাহক" },
  "nav.suppliers": { en: "Suppliers", bn: "সরবরাহকারী" },
  "nav.reports": { en: "Reports", bn: "রিপোর্ট" },
  "nav.settings": { en: "Settings", bn: "সেটিংস" },
  "nav.profile": { en: "Profile", bn: "প্রোফাইল" },
  "nav.admin": { en: "Super Admin", bn: "সুপার অ্যাডমিন" },
  "nav.store": { en: "Store", bn: "স্টোর" },
  "auth.signin": { en: "Sign in", bn: "সাইন ইন" },
  "auth.email": { en: "Email", bn: "ইমেইল" },
  "auth.password": { en: "Password", bn: "পাসওয়ার্ড" },
  "cta.getStarted": { en: "Get started", bn: "শুরু করুন" },
  "cta.viewDemo": { en: "View demo", bn: "ডেমো দেখুন" },
} satisfies Dict;

export type I18nKey = keyof typeof dict;

export function useT() {
  const lang = useUIStore((s) => s.language);
  return (key: I18nKey) => dict[key]?.[lang] ?? key;
}
