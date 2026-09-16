/**
 * Log client IP addresses on the server (Vercel: x-forwarded-for / x-real-ip).
 * Called once per browser session from the client.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { getSql } from "./db";

const DEDUPE_MINUTES = 60;

/** First public IP from proxy headers (Vercel sets x-forwarded-for). */
export function clientIpFromHeaders(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 128);
  }
  for (const name of ["x-real-ip", "cf-connecting-ip", "true-client-ip"] as const) {
    const v = headers.get(name)?.trim();
    if (v) return v.slice(0, 128);
  }
  return "unknown";
}

export type LogVisitInput = {
  path?: string;
  locale?: string;
};

export type LogVisitResult = {
  ok: boolean;
  skipped?: boolean;
  reason?: string;
};

/**
 * Record a visit. Skips if the same IP was logged within the last hour
 * (limits noise from reloads / SPA navigation).
 */
export const logVisit = createServerFn({ method: "POST" })
  .inputValidator((data: LogVisitInput) => data ?? {})
  .handler(async ({ data }): Promise<LogVisitResult> => {
    try {
      const req = getRequest();
      const headers = req?.headers ?? new Headers();
      const ip = clientIpFromHeaders(headers);
      const userAgent = (headers.get("user-agent") ?? "").slice(0, 512) || null;
      const path = (data.path ?? "/").slice(0, 512);
      const locale = data.locale ? String(data.locale).slice(0, 16) : null;

      const sql = await getSql();

      const recent = await sql.query<{ n: number }>(
        `select count(*)::int as n
         from ip_logs
         where ip = $1
           and created_at > now() - ($2::text || ' minutes')::interval`,
        [ip, String(DEDUPE_MINUTES)],
      );

      if ((recent[0]?.n ?? 0) > 0) {
        return { ok: true, skipped: true, reason: "deduped" };
      }

      await sql`
        insert into ip_logs (ip, user_agent, path, locale)
        values (${ip}, ${userAgent}, ${path}, ${locale})
      `;

      return { ok: true };
    } catch (err) {
      console.error("[logVisit]", err);
      return {
        ok: false,
        reason: err instanceof Error ? err.message : "log_failed",
      };
    }
  });

export type IpLogRow = {
  id: number;
  ip: string;
  user_agent: string | null;
  path: string | null;
  locale: string | null;
  created_at: string;
};

/** Recent rows for ops (server-only; not exposed in UI by default). */
export const listRecentIpLogs = createServerFn({ method: "GET" })
  .inputValidator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<{ ok: boolean; rows: IpLogRow[]; error?: string }> => {
    try {
      const limit = Math.min(Math.max(Number(data.limit ?? 100), 1), 500);
      const sql = await getSql();
      const rows = await sql.query<IpLogRow>(
        `select id, ip, user_agent, path, locale, created_at::text as created_at
         from ip_logs
         order by created_at desc
         limit $1`,
        [limit],
      );
      return { ok: true, rows };
    } catch (err) {
      console.error("[listRecentIpLogs]", err);
      return {
        ok: false,
        rows: [],
        error: err instanceof Error ? err.message : "list_failed",
      };
    }
  });
