// Server-side magic-bytes verification for prescription / receipt uploads.
// Rejects SVG, HTML, scripts, polyglots, and spoofed Content-Type headers.

export interface VerifiedUpload {
  contentType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf";
  ext: "jpg" | "png" | "webp" | "pdf";
  fileKind: "image" | "pdf";
}

function detectMagic(bytes: Uint8Array): VerifiedUpload | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return { contentType: "image/jpeg", ext: "jpg", fileKind: "image" };
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return { contentType: "image/png", ext: "png", fileKind: "image" };
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return { contentType: "image/webp", ext: "webp", fileKind: "image" };
  }

  // PDF: "%PDF-" (25 50 44 46 2D) — allow leading BOM/whitespace within first 8 bytes
  const headText = new TextDecoder("latin1").decode(bytes.subarray(0, 16));
  if (headText.trimStart().startsWith("%PDF-")) {
    return { contentType: "application/pdf", ext: "pdf", fileKind: "pdf" };
  }

  return null;
}

function hasEmbeddedScriptMarkers(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, Math.min(bytes.length, 65_536))).toLowerCase();
  const tailStart = Math.max(0, bytes.length - 32_768);
  const tail = bytes.length > 65_536 ? new TextDecoder("latin1").decode(bytes.subarray(tailStart)).toLowerCase() : "";
  const combined = head + "\n" + tail;
  return (
    combined.includes("<script") ||
    combined.includes("<?php") ||
    combined.includes("<svg") ||
    combined.includes("onerror=") ||
    combined.includes("onload=")
  );
}

/**
 * Verifies uploaded bytes against allowed raster image and PDF magic signatures,
 * rejects polyglot script markers, and derives canonical MIME + extension.
 */
export function verifySafeUploadBytes(bytes: Uint8Array, claimedMime?: string): VerifiedUpload {
  const detected = detectMagic(bytes);
  if (!detected) {
    throw new Error("Unsupported or invalid file signature (only JPG, PNG, WebP, PDF allowed)");
  }

  // Block explicit SVG or HTML declarations even if prepended with magic bytes
  const normClaimed = (claimedMime ?? "").trim().toLowerCase();
  if (normClaimed.includes("svg") || normClaimed.includes("html") || normClaimed.includes("javascript")) {
    throw new Error("SVG and active script content types are forbidden");
  }

  if (detected.fileKind === "image" && hasEmbeddedScriptMarkers(bytes)) {
    throw new Error("Uploaded image contains forbidden embedded script/HTML markers");
  }

  return detected;
}
