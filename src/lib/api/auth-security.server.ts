import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export interface RateLimitResult {
  allowed: boolean;
  remainingAttempts: number;
  retryAfterSeconds: number;
  message?: string;
}

function getClientIp(req?: Request | null): string {
  if (!req) return "127.0.0.1";
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) {
    const first = fwd.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "127.0.0.1";
}

export const checkLoginRateLimitFn = createServerFn({ method: "POST" })
  .validator((data: { email: string }) => data)
  .handler(async ({ data }): Promise<RateLimitResult> => {
    const req = getRequest();
    const ip = getClientIp(req);
    const normalizedEmail = (data.email || "").trim().toLowerCase();

    // 1. Check IP rate limit
    const { data: ipCheck, error: ipErr } = await supabaseAdmin.rpc("check_auth_rate_limit", {
      p_key: `ip:${ip}`,
    });

    if (!ipErr && ipCheck && !ipCheck.allowed) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: ipCheck.retry_after_seconds || 60,
        message: `Too many login attempts from this network. Please retry in ${ipCheck.retry_after_seconds || 60} seconds.`,
      };
    }

    // 2. Check Email rate limit
    if (normalizedEmail) {
      const { data: emailCheck, error: emailErr } = await supabaseAdmin.rpc("check_auth_rate_limit", {
        p_key: `email:${normalizedEmail}`,
      });

      if (!emailErr && emailCheck && !emailCheck.allowed) {
        return {
          allowed: false,
          remainingAttempts: 0,
          retryAfterSeconds: emailCheck.retry_after_seconds || 60,
          message: `This account is temporarily locked due to multiple failed login attempts. Please wait ${emailCheck.retry_after_seconds || 60} seconds.`,
        };
      }

      const remaining = Math.min(
        ipCheck?.remaining_attempts ?? 5,
        emailCheck?.remaining_attempts ?? 5,
      );

      return {
        allowed: true,
        remainingAttempts: remaining,
        retryAfterSeconds: 0,
      };
    }

    return {
      allowed: true,
      remainingAttempts: ipCheck?.remaining_attempts ?? 5,
      retryAfterSeconds: 0,
    };
  });

export const recordLoginAttemptFn = createServerFn({ method: "POST" })
  .validator((data: { email: string; success: boolean }) => data)
  .handler(async ({ data }): Promise<RateLimitResult> => {
    const req = getRequest();
    const ip = getClientIp(req);
    const normalizedEmail = (data.email || "").trim().toLowerCase();

    // Record on IP
    const { data: ipResult } = await supabaseAdmin.rpc("record_auth_attempt", {
      p_key: `ip:${ip}`,
      p_success: data.success,
    });

    // Record on Email
    let emailResult = null;
    if (normalizedEmail) {
      const { data: res } = await supabaseAdmin.rpc("record_auth_attempt", {
        p_key: `email:${normalizedEmail}`,
        p_success: data.success,
      });
      emailResult = res;
    }

    const locked = (!ipResult?.allowed) || (emailResult && !emailResult.allowed);
    const retryAfter = Math.max(ipResult?.retry_after_seconds || 0, emailResult?.retry_after_seconds || 0);
    const remaining = Math.min(ipResult?.remaining_attempts ?? 5, emailResult?.remaining_attempts ?? 5);

    if (locked) {
      return {
        allowed: false,
        remainingAttempts: 0,
        retryAfterSeconds: retryAfter || 60,
        message: `Too many failed attempts. Temporary lockout for ${retryAfter || 60} seconds.`,
      };
    }

    return {
      allowed: true,
      remainingAttempts: remaining,
      retryAfterSeconds: 0,
    };
  });
