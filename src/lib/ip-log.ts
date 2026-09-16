/**
 * Log client IP addresses on the server (Vercel: x-forwarded-for / x-real-ip).
 * Called once per browser session from the client.
 *
 * - Always writes a structured line to server logs (Vercel Runtime Logs).
 * - Also inserts into `ip_logs` when Postgres is available (DATABASE_URL / Neon).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { dbSource, getSql } from "./db";

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
  persisted?: boolean;
  reason?: string;
  ip?: string;
};

/**
 * Record a visit. Always emits a runtime log line.
 * DB insert only when `DATABASE_URL` is set (Neon on Vercel).
 */
export const logVisit = createServerFn({ method: "POST" })
  .validator((data: LogVisitInput) => data ?? {})
  .handler(async ({ data }): Promise<LogVisitResult> => {
    const req = getRequest();
    const headers = req?.headers ?? new Headers();
    const ip = clientIpFromHeaders(headers);
    const userAgent = (headers.get("user-agent") ?? "").slice(0, 512) || null;
    const path = (data.path ?? "/").slice(0, 512);
    const locale = data.locale ? String(data.locale).slice(0, 16) : null;
    const at = new Date().toISOString();

    // Always visible in Vercel → Deployments → Functions → Logs
    console.info(
      "[ip_log]",
      JSON.stringify({ ip, path, locale, userAgent, at, db: dbSource }),
    );

    // Serverless Vercel without DATABASE_URL cannot use PGLite file storage.
    if (dbSource !== "neon") {
      return {
        ok: true,
        persisted: false,
        ip,
        reason: "runtime_log_only_no_DATABASE_URL",
      };
    }

    try {
      const sql = await getSql();

      const recent = await sql.query<{ n: number }>(
        `select count(*)::int as n
         from ip_logs
         where ip = $1
           and created_at > now() - ($2::text || ' minutes')::interval`,
        [ip, String(DEDUPE_MINUTES)],
      );

      if ((recent[0]?.n ?? 0) > 0) {
        return { ok: true, skipped: true, persisted: true, ip, reason: "deduped" };
      }

      await sql`
        insert into ip_logs (ip, user_agent, path, locale)
        values (${ip}, ${userAgent}, ${path}, ${locale})
      `;

      return { ok: true, persisted: true, ip };
    } catch (err) {
      console.error("[logVisit] db", err);
      return {
        ok: true,
        persisted: false,
        ip,
        reason: err instanceof Error ? err.message : "db_insert_failed",
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

/** Recent rows from Postgres (requires DATABASE_URL). */
export const listRecentIpLogs = createServerFn({ method: "GET" })
  .validator((data: { limit?: number } | undefined) => data ?? {})
  .handler(async ({ data }): Promise<{ ok: boolean; rows: IpLogRow[]; error?: string }> => {
    if (dbSource !== "neon") {
      return {
        ok: false,
        rows: [],
        error: "DATABASE_URL not set — IP rows only in Vercel runtime logs ([ip_log])",
      };
    }
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
