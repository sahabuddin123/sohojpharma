import { createWorker } from "tesseract.js";

export type OcrExtractedItem = {
  raw_text: string;
  brand_name: string | null;
  generic_name: string | null;
  strength: string | null;
  dosage: string | null;
  frequency: string | null;
  duration_days: number | null;
  quantity: number | null;
};

export type OcrExtractResult = {
  patient_name: string | null;
  doctor_name: string | null;
  prescription_date: string | null;
  ocr_text: string;
  items: OcrExtractedItem[];
};

const FORM_PREFIX_RE =
  /^(?:tab(?:let)?s?|cap(?:sule)?s?|syp|syrup|susp(?:ension)?|inj(?:ection)?|drops?|gel|cream|oint(?:ment)?|inh(?:aler)?|spray|adv|rx)\.?\s*[:\-]?\s*/i;
const STRENGTH_RE = /\b(\d+(?:\.\d+)?\s*(?:mg|mcg|gm?|ml|iu|%))\b/i;
const FREQ_RE = /\b(\d\s*[-+]\s*\d\s*[-+]\s*\d(?:\s*[-+]\s*\d)?|OD|QD|BD|BID|TDS|TID|QID|QDS|SOS|PRN)\b/i;
const DURATION_RE = /(?:x|for)?\s*(\d+)\s*(days?|weeks?|wks?|months?|mos?)/i;

const NOISE_LINE_RE =
  /^(?:rx|date|name|age|sex|gender|address|phone|mob|mobile|tel|email|www\.|http|signature|sig|dr\.?|mr\.?|mrs\.?|ms\.?)$/i;

function computeQtyFromFreq(frequency: string | null, durationDays: number | null): number {
  if (!frequency || !durationDays) return 1;
  const f = frequency.toUpperCase().replace(/\s+/g, "");
  let doses = 0;
  const m = f.match(/^(\d+)[-+]+(\d+)[-+]+(\d+)(?:[-+]+(\d+))?$/);
  if (m) {
    doses = m.slice(1).filter(Boolean).map(Number).reduce((a, b) => a + b, 0);
  } else if (/^OD$|^QD$/.test(f)) doses = 1;
  else if (/^BD$|^BID$/.test(f)) doses = 2;
  else if (/^TDS$|^TID$/.test(f)) doses = 3;
  else if (/^QID$|^QDS$/.test(f)) doses = 4;
  else if (/^SOS$|^PRN$/.test(f)) doses = 1;
  return doses > 0 ? doses * durationDays : 1;
}

export function parsePrescriptionOcrText(rawText: string): OcrExtractResult {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, " ").trim())
    .filter((l) => l.length >= 3);

  const items: OcrExtractedItem[] = [];
  let currentDosageTarget: OcrExtractedItem | null = null;

  for (const line of lines) {
    // Skip pure dates, phone numbers, URLs, or header labels
    if (/^\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}$/.test(line)) continue;
    if (/^[\d\s+\-()]{7,}$/.test(line) && !FREQ_RE.test(line)) continue;
    if (/www\.|http|\.com|\.cloud|@/i.test(line)) continue;
    if (NOISE_LINE_RE.test(line.replace(/[:.]/g, "").trim())) continue;

    const hasFormPrefix = FORM_PREFIX_RE.test(line);
    const freqMatch = line.match(FREQ_RE);
    const durMatch = line.match(DURATION_RE);

    // If the line is primarily a dosage/frequency line (e.g. "1 - 0 - 1 x 5 days"), attach to previous medicine
    if (!hasFormPrefix && currentDosageTarget && (freqMatch || durMatch) && line.replace(FREQ_RE, "").replace(DURATION_RE, "").trim().length < 8) {
      const freq = freqMatch?.[1]?.replace(/\s+/g, "") ?? currentDosageTarget.frequency;
      let days = currentDosageTarget.duration_days;
      if (durMatch) {
        const n = Number(durMatch[1]);
        const unit = durMatch[2].toLowerCase();
        days = unit.startsWith("w") ? n * 7 : unit.startsWith("m") ? n * 30 : n;
      }
      currentDosageTarget.frequency = freq;
      currentDosageTarget.duration_days = days;
      currentDosageTarget.dosage = [freq, days ? `${days}d` : null].filter(Boolean).join(" · ") || line;
      currentDosageTarget.quantity = computeQtyFromFreq(freq, days);
      continue;
    }

    // Check if line looks like a medicine line
    const strengthMatch = line.match(STRENGTH_RE);
    const looksLikeMedicine = hasFormPrefix || Boolean(strengthMatch);
    if (!looksLikeMedicine) continue;

    const cleaned = line
      .replace(FORM_PREFIX_RE, "")
      .replace(FREQ_RE, "")
      .replace(DURATION_RE, "")
      .replace(STRENGTH_RE, "")
      .replace(/[^a-zA-Z0-9\s\-]/g, " ")
      .replace(/\s+/g, " ")
      .trim();

    if (cleaned.length < 2) continue;

    const freq = freqMatch?.[1]?.replace(/\s+/g, "") ?? null;
    let days: number | null = null;
    if (durMatch) {
      const n = Number(durMatch[1]);
      const unit = durMatch[2].toLowerCase();
      days = unit.startsWith("w") ? n * 7 : unit.startsWith("m") ? n * 30 : n;
    }

    const item: OcrExtractedItem = {
      raw_text: line,
      brand_name: cleaned,
      generic_name: null,
      strength: strengthMatch?.[1]?.replace(/\s+/g, "") ?? null,
      dosage: [freq, days ? `${days}d` : null].filter(Boolean).join(" · ") || null,
      frequency: freq,
      duration_days: days,
      quantity: computeQtyFromFreq(freq, days),
    };
    items.push(item);
    currentDosageTarget = item;
  }

  return {
    patient_name: null,
    doctor_name: null,
    prescription_date: null,
    ocr_text: rawText,
    items,
  };
}

export async function runClientPrescriptionOcr(imageDataUrl: string): Promise<OcrExtractResult> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(imageDataUrl);
    return parsePrescriptionOcrText(data.text || "");
  } finally {
    await worker.terminate();
  }
}
