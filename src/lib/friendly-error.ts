/**
 * Converts raw server/network/HTML errors into clean, user-friendly Bengali messages
 * so raw HTML error pages or stack traces are never displayed inside toast notifications.
 */
export function formatFriendlyError(
  err: unknown,
  fallback = "কিছু একটা সমস্যা হয়েছে। অনুগ্রহ করে আবার চেষ্টা করুন।",
): string {
  const raw =
    err instanceof Error
      ? err.message
      : typeof err === "string"
        ? err
        : fallback;

  const trimmed = (raw ?? "").trim();
  if (!trimmed) return fallback;

  // Never render raw HTML error pages (e.g. stale _serverFn hash after a deploy or 502 HTML)
  if (
    trimmed.startsWith("<") ||
    /<!doctype\s+html|<html[\s>]|<head[\s>]|<body[\s>]|This page didn't load/i.test(trimmed)
  ) {
    return "সার্ভার আপডেট হয়েছে — অনুগ্রহ করে পেজটি রিফ্রেশ করে আবার চেষ্টা করুন।";
  }

  // Friendly network/connection errors
  if (/failed to fetch|networkerror|load failed|connection_refused|network request failed/i.test(trimmed)) {
    return "সার্ভারে সংযোগ করা সম্ভব হয়নি। আপনার ইন্টারনেট সংযোগ পরীক্ষা করে আবার চেষ্টা করুন।";
  }

  if (trimmed.length > 220) {
    return `${trimmed.slice(0, 217)}...`;
  }

  return trimmed;
}
