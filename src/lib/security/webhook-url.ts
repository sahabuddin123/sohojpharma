// Browser- & server-safe SSRF URL syntax and private/reserved IP validators.

const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
  "metadata.goog",
  "169.254.169.254",
]);

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const oct = Number(p);
    if (oct < 0 || oct > 255) return null;
    n = (n << 8) | oct;
  }
  return n >>> 0;
}

function isIpv4Literal(ip: string): boolean {
  return ipv4ToInt(ip) !== null;
}

function isIpv6Literal(ip: string): boolean {
  if (!ip.includes(":")) return false;
  const zoneIdx = ip.indexOf("%");
  const clean = zoneIdx >= 0 ? ip.slice(0, zoneIdx) : ip;
  if (clean.split("::").length > 2) return false;
  if (!/^[0-9a-f:.]+$/i.test(clean)) return false;
  const parts = clean.split(":");
  return parts.length >= 3 && parts.length <= 8;
}

function isPrivateIpv4Int(n: number): boolean {
  const inRange = (startHex: number, prefixLen: number) => {
    const mask = prefixLen === 0 ? 0 : (~0 << (32 - prefixLen)) >>> 0;
    return (n & mask) === (startHex & mask);
  };
  return (
    inRange(0x00000000, 8) || // 0.0.0.0/8 ("this" network)
    inRange(0x0a000000, 8) || // 10.0.0.0/8 (RFC1918)
    inRange(0x64400000, 10) || // 100.64.0.0/10 (CGNAT)
    inRange(0x7f000000, 8) || // 127.0.0.0/8 (Loopback)
    inRange(0xa9fe0000, 16) || // 169.254.0.0/16 (Link-local / Cloud metadata)
    inRange(0xac100000, 12) || // 172.16.0.0/12 (RFC1918 / Docker bridge)
    inRange(0xc0000000, 24) || // 192.0.0.0/24 (IETF protocol)
    inRange(0xc0000200, 24) || // 192.0.2.0/24 (TEST-NET-1)
    inRange(0xc0a80000, 16) || // 192.168.0.0/16 (RFC1918)
    inRange(0xc6120000, 15) || // 198.18.0.0/15 (Benchmarking)
    inRange(0xc6336400, 24) || // 198.51.100.0/24 (TEST-NET-2)
    inRange(0xcb007100, 24) || // 203.0.113.0/24 (TEST-NET-3)
    inRange(0xe0000000, 4) // 224.0.0.0/4+ (Multicast & Reserved)
  );
}

/**
 * Checks whether an IP address (or non-canonical decimal/octal/hex IPv4 literal)
 * points to loopback, RFC1918 private, link-local, cloud metadata, CGNAT, or reserved space.
 */
export function isPrivateOrReservedIp(rawIp: string): boolean {
  const cleaned = rawIp.trim().replace(/^\[|\]$/g, "").split("%")[0].toLowerCase();
  if (!cleaned) return true;

  const ipv4Int = ipv4ToInt(cleaned);
  if (ipv4Int !== null) {
    return isPrivateIpv4Int(ipv4Int);
  }

  // Handle single-integer decimal/hex literals like 2130706433 or 0x7f000001
  if (/^\d+$/.test(cleaned) || /^0x[0-9a-f]+$/i.test(cleaned)) {
    const val = Number(cleaned);
    if (!Number.isFinite(val) || val < 0 || val > 0xffffffff) return true;
    return isPrivateIpv4Int(val >>> 0);
  }

  // Handle octal/hex/short dotted forms like 0177.0.0.1 or 127.1
  if (/^[0-9a-fx.]+$/i.test(cleaned) && cleaned.includes(".")) {
    const parts = cleaned.split(".");
    if (parts.length <= 4 && parts.every((p) => /^(0x[0-9a-f]+|0[0-7]*|[1-9]\d*)$/i.test(p))) {
      try {
        const normalized = new URL(`http://${cleaned}`).hostname;
        const normInt = ipv4ToInt(normalized);
        if (normInt !== null) return isPrivateIpv4Int(normInt);
      } catch {
        return true;
      }
      return true;
    }
  }

  if (isIpv6Literal(cleaned)) {
    if (cleaned === "::" || cleaned === "::1") return true;
    // IPv4-mapped (::ffff:127.0.0.1 or ::ffff:7f00:1) or 0:0:0:0:0:ffff:...
    if (cleaned.startsWith("::ffff:") || cleaned.startsWith("0:0:0:0:0:ffff:")) {
      const tail = cleaned.split(":").slice(-1)[0];
      if (isIpv4Literal(tail)) return isPrivateOrReservedIp(tail);
      const hexParts = cleaned.split(":");
      const hi = parseInt(hexParts[hexParts.length - 2] || "0", 16);
      const lo = parseInt(hexParts[hexParts.length - 1] || "0", 16);
      if (Number.isFinite(hi) && Number.isFinite(lo)) {
        const mappedInt = (((hi & 0xffff) << 16) | (lo & 0xffff)) >>> 0;
        return isPrivateIpv4Int(mappedInt);
      }
      return true;
    }
    const firstHextet = parseInt(cleaned.split(":")[0] || "0", 16);
    if ((firstHextet & 0xfe00) === 0xfc00) return true; // fc00::/7
    if ((firstHextet & 0xffc0) === 0xfe80) return true; // fe80::/10
    if ((firstHextet & 0xff00) === 0xff00) return true; // ff00::/8
    if (cleaned.startsWith("2001:db8:") || cleaned.startsWith("100::")) return true;
    return false;
  }

  return false;
}

/**
 * Syntax + hostname check safe to run on webhook registration or before DNS resolution.
 */
export function validateWebhookUrlSyntax(
  rawUrl: string,
  opts: { allowHttp?: boolean } = {},
): URL {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    throw new Error("Invalid URL format");
  }

  const allowHttp = opts.allowHttp ?? (typeof process !== "undefined" && process.env?.NODE_ENV !== "production");
  if (parsed.protocol !== "https:" && !(allowHttp && parsed.protocol === "http:")) {
    throw new Error(allowHttp ? "Only http(s) URLs are allowed" : "Webhook URL must use https://");
  }

  if (parsed.username || parsed.password) {
    throw new Error("URL must not contain embedded credentials");
  }

  const host = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (!host) throw new Error("Missing hostname");
  if (
    BLOCKED_HOSTNAMES.has(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host.endsWith(".localhost") ||
    host.endsWith(".arpa")
  ) {
    throw new Error("Internal or loopback hostnames are not allowed");
  }

  if (!isIpv4Literal(host) && !isIpv6Literal(host)) {
    if (!host.includes(".")) {
      throw new Error("Single-label internal hostnames are not allowed");
    }
  }

  if (
    isIpv4Literal(host) ||
    isIpv6Literal(host) ||
    /^\d+$/.test(host) ||
    /^0x[0-9a-f]+$/i.test(host) ||
    /^[0-9a-fx.]+$/i.test(host)
  ) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Private, loopback, or metadata IP addresses are not allowed");
    }
  }

  return parsed;
}
