import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { useBrandingSettings } from "@/hooks/use-branding-settings";

/**
 * Applies tenant branding (primary/secondary colors + favicon) to the document.
 * Mounted once at the app shell level so every page reflects branding instantly.
 */
export function useBrandingApply() {
  const { currentTenantId } = useAuth();
  const { branding } = useBrandingSettings(currentTenantId ?? undefined);

  useEffect(() => {
    const root = document.documentElement;
    const prevPrimary = root.style.getPropertyValue("--primary");
    const prevSecondary = root.style.getPropertyValue("--secondary");

    if (branding.primary_color) root.style.setProperty("--primary", branding.primary_color);
    else root.style.removeProperty("--primary");
    if (branding.secondary_color) root.style.setProperty("--secondary", branding.secondary_color);
    else root.style.removeProperty("--secondary");

    return () => {
      if (prevPrimary) root.style.setProperty("--primary", prevPrimary);
      if (prevSecondary) root.style.setProperty("--secondary", prevSecondary);
    };
  }, [branding.primary_color, branding.secondary_color]);

  useEffect(() => {
    if (!branding.favicon_url) return;
    const links: HTMLLinkElement[] = Array.from(
      document.head.querySelectorAll('link[rel~="icon"]'),
    );
    if (!links.length) {
      const l = document.createElement("link");
      l.rel = "icon";
      document.head.appendChild(l);
      links.push(l);
    }
    const previous = links.map((l) => l.href);
    links.forEach((l) => (l.href = branding.favicon_url!));
    return () => {
      links.forEach((l, i) => {
        if (previous[i]) l.href = previous[i];
      });
    };
  }, [branding.favicon_url]);
}
