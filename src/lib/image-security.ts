/**
 * Client-side security validation & resizing for user-uploaded avatar images.
 *
 * Security checks performed before accepting an image:
 * 1. Non-empty & <= 5 MB file size limit.
 * 2. Strict MIME type & filename extension allow-list (JPEG, PNG, WebP only; blocks SVG/HTML/scripts).
 * 3. Magic-byte signature verification (prevents spoofed MIME types / renamed executables).
 * 4. Embedded script/polyglot signature scan in file header/trailer.
 * 5. Image decode + max dimension guard (blocks decompression bombs).
 * 6. Fresh <canvas> re-encode & center-crop resize to 256x256 JPEG, stripping all EXIF/GPS metadata.
 */

const MAX_RAW_BYTES = 5 * 1024 * 1024; // 5 MB
const MAX_DIMENSION = 8000;
const TARGET_SIZE = 256;

const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);
const ALLOWED_EXT = new Set(["jpg", "jpeg", "png", "webp"]);

export interface ProcessedAvatar {
  blob: Blob;
  dataUrl: string;
  width: number;
  height: number;
  originalBytes: number;
  finalBytes: number;
}

function detectImageFormatByMagicBytes(bytes: Uint8Array): "jpeg" | "png" | "webp" | null {
  if (bytes.length < 12) return null;
  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
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
    return "png";
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
    return "webp";
  }
  return null;
}

function containsSuspiciousPayload(buffer: ArrayBuffer): boolean {
  const sample = new TextDecoder("latin1").decode(new Uint8Array(buffer)).toLowerCase();
  return (
    sample.includes("<script") ||
    sample.includes("<?php") ||
    sample.includes("<svg") ||
    sample.includes("javascript:") ||
    sample.includes("onerror=") ||
    sample.includes("onload=")
  );
}

export async function validateAndResizeAvatar(file: File): Promise<ProcessedAvatar> {
  if (!file || file.size === 0) {
    throw new Error("খালি ফাইল আপলোড করা যাবে না।");
  }
  if (file.size > MAX_RAW_BYTES) {
    throw new Error("ছবির সাইজ সর্বোচ্চ ৫ মেগাবাইটের মধ্যে হতে হবে।");
  }

  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!ALLOWED_MIME.has(file.type) || (ext && !ALLOWED_EXT.has(ext))) {
    throw new Error("শুধুমাত্র JPG, PNG অথবা WebP ছবি আপলোড করা যাবে।");
  }

  // Magic-byte verification
  const headerBuf = await file.slice(0, 16).arrayBuffer();
  const format = detectImageFormatByMagicBytes(new Uint8Array(headerBuf));
  if (!format) {
    throw new Error("নিরাপত্তা যাচাই ব্যর্থ: ফাইলটি বৈধ ছবি নয়।");
  }

  // Scan head + tail chunks for embedded script/polyglot payloads
  const headChunk = await file.slice(0, Math.min(file.size, 65_536)).arrayBuffer();
  if (containsSuspiciousPayload(headChunk)) {
    throw new Error("নিরাপত্তা সতর্কতা: ছবিতে সন্দেহজনক কোড পাওয়া গেছে।");
  }
  if (file.size > 65_536) {
    const tailChunk = await file.slice(Math.max(0, file.size - 32_768)).arrayBuffer();
    if (containsSuspiciousPayload(tailChunk)) {
      throw new Error("নিরাপত্তা সতর্কতা: ছবিতে সন্দেহজনক কোড পাওয়া গেছে।");
    }
  }

  // Decode into Image & guard against decompression bombs
  const objectUrl = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("ছবিটি ডিকোড করা যায়নি।"));
      el.src = objectUrl;
    });

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h || w > MAX_DIMENSION || h > MAX_DIMENSION) {
      throw new Error("ছবির রেজোলিউশন গ্রহণযোগ্য সীমার বাইরে।");
    }

    // Center-crop square and resize to TARGET_SIZE x TARGET_SIZE on a clean canvas
    // Re-encoding strips all EXIF/GPS metadata and any appended bytes.
    const side = Math.min(w, h);
    const sx = Math.floor((w - side) / 2);
    const sy = Math.floor((h - side) / 2);

    const canvas = document.createElement("canvas");
    canvas.width = TARGET_SIZE;
    canvas.height = TARGET_SIZE;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("ব্রাউজার ক্যানভাস তৈরি করতে পারেনি।");
    }

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, TARGET_SIZE, TARGET_SIZE);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(img, sx, sy, side, side, 0, 0, TARGET_SIZE, TARGET_SIZE);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error("ছবি প্রসেস করা যায়নি।"))),
        "image/jpeg",
        0.84,
      );
    });
    const dataUrl = canvas.toDataURL("image/jpeg", 0.84);

    return {
      blob,
      dataUrl,
      width: TARGET_SIZE,
      height: TARGET_SIZE,
      originalBytes: file.size,
      finalBytes: blob.size,
    };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
