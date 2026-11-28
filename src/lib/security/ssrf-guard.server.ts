// Server-only SSRF protection for outbound HTTP requests (webhooks, remote callbacks).
import { lookup } from "node:dns/promises";
import { isIPv4, isIPv6 } from "node:net";
import { isPrivateOrReservedIp, validateWebhookUrlSyntax } from "./webhook-url";

export { isPrivateOrReservedIp, validateWebhookUrlSyntax };

/**
 * Full SSRF guard before server-side fetch(): validates syntax AND resolves DNS,
 * rejecting any hostname whose A/AAAA records point to private/loopback/metadata IPs.
 */
export async function assertSafeOutboundUrl(
  rawUrl: string,
  opts: { allowHttp?: boolean } = {},
): Promise<URL> {
  const parsed = validateWebhookUrlSyntax(rawUrl, opts);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");

  if (isIPv4(host) || isIPv6(host)) {
    if (isPrivateOrReservedIp(host)) {
      throw new Error("Blocked private or reserved destination IP");
    }
    return parsed;
  }

  const records = await lookup(host, { all: true, verbatim: true });
  if (!records.length) {
    throw new Error("Destination hostname could not be resolved");
  }
  for (const r of records) {
    if (isPrivateOrReservedIp(r.address)) {
      throw new Error("Blocked outbound request to private/internal IP resolution");
    }
  }

  return parsed;
}
