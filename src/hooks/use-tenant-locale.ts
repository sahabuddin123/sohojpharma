import { useCallback, useEffect, useMemo, useRef } from "react";
import i18n, { hasExplicitLangPreference } from "@/i18n";
import { useAuth } from "@/hooks/use-auth";
import { useLocaleSettings } from "@/hooks/use-locale-settings";
import { DEFAULT_LOCALE, type LocaleSettings } from "@/lib/api/locale.functions";

const CURRENCY_SYMBOLS: Record<LocaleSettings["currency"], string> = {
  BDT: "৳",
  USD: "$",
  EUR: "€",
  GBP: "£",
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function getParts(d: Date, timezone: string) {
  const dtf = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(d)) if (p.type !== "literal") parts[p.type] = p.value;
  return parts;
}

export function formatDateWith(
  value: Date | string | number | null | undefined,
  opts: { date_format: LocaleSettings["date_format"]; timezone: string; withTime?: boolean },
): string {
  if (value === null || value === undefined || value === "") return "";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const p = getParts(d, opts.timezone);
  const Y = p.year, M = p.month, D = p.day;
  let out = "";
  switch (opts.date_format) {
    case "MM/DD/YYYY": out = `${M}/${D}/${Y}`; break;
    case "YYYY-MM-DD": out = `${Y}-${M}-${D}`; break;
    case "DD/MM/YYYY":
    default: out = `${D}/${M}/${Y}`;
  }
  if (opts.withTime) out += ` ${p.hour}:${p.minute}`;
  return out;
}

export function formatNumberWith(
  value: number | null | undefined,
  opts: { number_format: LocaleSettings["number_format"]; maximumFractionDigits?: number; minimumFractionDigits?: number },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(opts.number_format, {
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
    minimumFractionDigits: opts.minimumFractionDigits ?? 0,
  }).format(value);
}

export function formatCurrencyWith(
  value: number | null | undefined,
  opts: { currency: LocaleSettings["currency"]; number_format: LocaleSettings["number_format"]; maximumFractionDigits?: number },
): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "";
  const num = new Intl.NumberFormat(opts.number_format, {
    minimumFractionDigits: 2,
    maximumFractionDigits: opts.maximumFractionDigits ?? 2,
  }).format(value);
  return `${CURRENCY_SYMBOLS[opts.currency] ?? opts.currency}${num}`;
}

export function currencySymbol(currency: LocaleSettings["currency"]): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

/**
 * Global tenant locale hook. Returns the active LocaleSettings (with safe
 * defaults), bound formatter helpers, and side-effects that apply the
 * language to i18next + the document on every change.
 */
export function useTenantLocale() {
  const { currentTenantId } = useAuth();
  const { locale } = useLocaleSettings(currentTenantId ?? undefined);
  const active: LocaleSettings = locale ?? DEFAULT_LOCALE;

  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current || !active.language) return;
    initializedRef.current = true;
    // Never clobber an explicit language choice stored in browser localStorage.
    if (hasExplicitLangPreference()) return;
    if ((i18n.resolvedLanguage ?? i18n.language) !== active.language) {
      i18n.changeLanguage(active.language).catch(() => {});
    }
    if (typeof document !== "undefined") {
      document.documentElement.lang = active.language;
    }
  }, [active.language]);

  const formatCurrency = useCallback(
    (v: number | null | undefined, o?: { maximumFractionDigits?: number }) =>
      formatCurrencyWith(v, {
        currency: active.currency,
        number_format: active.number_format,
        maximumFractionDigits: o?.maximumFractionDigits,
      }),
    [active.currency, active.number_format],
  );

  const formatDate = useCallback(
    (v: Date | string | number | null | undefined, o?: { withTime?: boolean }) =>
      formatDateWith(v, { date_format: active.date_format, timezone: active.timezone, withTime: o?.withTime }),
    [active.date_format, active.timezone],
  );

  const formatNumber = useCallback(
    (v: number | null | undefined, o?: { maximumFractionDigits?: number; minimumFractionDigits?: number }) =>
      formatNumberWith(v, {
        number_format: active.number_format,
        maximumFractionDigits: o?.maximumFractionDigits,
        minimumFractionDigits: o?.minimumFractionDigits,
      }),
    [active.number_format],
  );

  return useMemo(
    () => ({ locale: active, formatCurrency, formatDate, formatNumber, currencySymbol: currencySymbol(active.currency) }),
    [active, formatCurrency, formatDate, formatNumber],
  );
}
