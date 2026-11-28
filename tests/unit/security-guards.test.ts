import { describe, it, expect } from "vitest";
import { escapeHtml, safeMediaUrl } from "@/lib/security/html-escape";
import { sanitizePostgrestSearch } from "@/lib/security/postgrest";
import { isPrivateOrReservedIp, validateWebhookUrlSyntax } from "@/lib/security/webhook-url";
import { verifySafeUploadBytes } from "@/lib/security/upload-validation.server";

describe("security-guards: escapeHtml & safeMediaUrl", () => {
  it("escapes HTML special characters in printable text", () => {
    expect(escapeHtml('<script>alert("xss")</script> & \'test\'')).toBe(
      "&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt; &amp; &#39;test&#39;",
    );
    expect(escapeHtml(null)).toBe("");
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(42)).toBe("42");
  });

  it("allows safe relative, http(s), and raster image data URLs while blocking active schemes", () => {
    expect(safeMediaUrl("/logos/store.png")).toBe("/logos/store.png");
    expect(safeMediaUrl("https://cdn.sohojpharma.cloud/logo.webp")).toBe("https://cdn.sohojpharma.cloud/logo.webp");
    expect(safeMediaUrl("data:image/png;base64,iVBORw0KGgo=")).toBe("data:image/png;base64,iVBORw0KGgo=");

    expect(safeMediaUrl("javascript:alert(1)")).toBe("");
    expect(safeMediaUrl("vbscript:msgbox(1)")).toBe("");
    expect(safeMediaUrl("data:image/svg+xml;base64,PHN2Zy8+")).toBe("");
    expect(safeMediaUrl("data:text/html,<script>alert(1)</script>")).toBe("");
    expect(safeMediaUrl("//evil.example/a.png")).toBe("");
  });
});

describe("security-guards: sanitizePostgrestSearch", () => {
  it("strips PostgREST filter delimiters while preserving drug names, percentages, and phone searches", () => {
    expect(sanitizePostgrestSearch("Napa Extra 500mg")).toBe("Napa Extra 500mg");
    expect(sanitizePostgrestSearch("5% Dextrose")).toBe("5% Dextrose");
    expect(sanitizePostgrestSearch("+8801712345678")).toBe("+8801712345678");
    expect(sanitizePostgrestSearch("foo,id.neq.0,name.ilike.%bar*();'\"\\[]{}"))
      .toBe("foo id.neq.0 name.ilike.%bar");
    // No comma, parens, asterisk, quote, backslash, bracket, brace, or semicolon survives
    const cleaned = sanitizePostgrestSearch("a,b(c)d*e'f\"g\\h;i[j]{k}");
    expect(cleaned).not.toMatch(/[,()[\]{}"'\\*;]/);
    expect(sanitizePostgrestSearch("x".repeat(200)).length).toBe(100);
  });
});

describe("security-guards: SSRF / webhook URL & private IP checks", () => {
  it("blocks private, loopback, metadata, CGNAT, and non-canonical IP literals", () => {
    expect(isPrivateOrReservedIp("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("10.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("172.16.0.5")).toBe(true);
    expect(isPrivateOrReservedIp("192.168.1.10")).toBe(true);
    expect(isPrivateOrReservedIp("169.254.169.254")).toBe(true);
    expect(isPrivateOrReservedIp("100.64.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("0.0.0.0")).toBe(true);
    expect(isPrivateOrReservedIp("::1")).toBe(true);
    expect(isPrivateOrReservedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIp("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIp("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIp("2130706433")).toBe(true); // 127.0.0.1 decimal
    expect(isPrivateOrReservedIp("0x7f000001")).toBe(true); // 127.0.0.1 hex

    expect(isPrivateOrReservedIp("8.8.8.8")).toBe(false);
    expect(isPrivateOrReservedIp("1.1.1.1")).toBe(false);
    expect(isPrivateOrReservedIp("2606:4700:4700::1111")).toBe(false);
  });

  it("rejects internal/localhost/credentialed webhook URLs and allows clean HTTPS endpoints", () => {
    expect(validateWebhookUrlSyntax("https://hooks.example.com/sohojpharma").hostname).toBe("hooks.example.com");

    expect(() => validateWebhookUrlSyntax("http://localhost:3000/hook", { allowHttp: true })).toThrow();
    expect(() => validateWebhookUrlSyntax("https://169.254.169.254/latest/meta-data/")).toThrow();
    expect(() => validateWebhookUrlSyntax("https://redis.internal/hook")).toThrow();
    expect(() => validateWebhookUrlSyntax("https://user:pass@hooks.example.com/hook")).toThrow();
    expect(() => validateWebhookUrlSyntax("http://hooks.example.com/hook", { allowHttp: false })).toThrow();
    expect(() => validateWebhookUrlSyntax("javascript:alert(1)", { allowHttp: true })).toThrow();
  });
});

describe("security-guards: verifySafeUploadBytes", () => {
  it("accepts valid PNG, JPEG, WebP, and PDF magic signatures", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    expect(verifySafeUploadBytes(png, "image/png")).toEqual({
      contentType: "image/png",
      ext: "png",
      fileKind: "image",
    });

    const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1]);
    expect(verifySafeUploadBytes(jpg, "image/jpeg").ext).toBe("jpg");

    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(verifySafeUploadBytes(webp, "image/webp").ext).toBe("webp");

    const pdf = new TextEncoder().encode("%PDF-1.7\n1 0 obj\n<<>>\nendobj\n");
    expect(verifySafeUploadBytes(pdf, "application/pdf").ext).toBe("pdf");
  });

  it("rejects SVG, HTML, scripts, spoofed headers, and polyglot PNG payloads", () => {
    const svg = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
    expect(() => verifySafeUploadBytes(svg, "image/png")).toThrow();

    const html = new TextEncoder().encode("<!doctype html><html><script>alert(1)</script></html>");
    expect(() => verifySafeUploadBytes(html, "image/jpeg")).toThrow();

    // Polyglot PNG header + embedded <script>
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);
    const payload = new TextEncoder().encode("<script>alert(1)</script>");
    const polyglot = new Uint8Array(pngHeader.length + payload.length);
    polyglot.set(pngHeader);
    polyglot.set(payload, pngHeader.length);

    expect(() => verifySafeUploadBytes(polyglot, "image/png")).toThrow();
    expect(() => verifySafeUploadBytes(pngHeader, "image/svg+xml")).toThrow();
  });
});
