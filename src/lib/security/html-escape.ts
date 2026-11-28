const HTML_ESCAPE_MAP: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

/**
 * Contextually encode untrusted text before interpolating into HTML templates
 * or printable browser windows (`document.write` / `srcdoc`).
 */
export function escapeHtml(val: unknown): string {
  if (val === null || val === undefined) return "";
  return String(val).replace(/[&<>"']/g, (ch) => HTML_ESCAPE_MAP[ch] ?? ch);
}

/**
 * Validate media/image URLs for HTML `src` attributes: allows relative `/...`,
 * `http(s)://...`, and base64 raster images (`png|jpeg|jpg|webp|gif`), while
 * blocking `javascript:`, `vbscript:`, `data:text/html`, and `data:image/svg+xml`.
 */
export function safeMediaUrl(raw: unknown): string {
  if (typeof raw !== "string") return "";
  const url = raw.trim();
  if (!url) return "";
  if (url.startsWith("/") && !url.startsWith("//")) return url;
  if (/^https?:\/\//i.test(url)) return url;
  if (/^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/i.test(url)) {
    return url;
  }
  return "";
}
