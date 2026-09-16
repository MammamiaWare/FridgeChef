/**
 * Log client IP addresses on the server (Vercel: x-forwarded-for / x-real-ip).
 * Called once per browser session from the client.
 *
 * - Always writes a structured line to server logs (Vercel Runtime Logs).
 * - Inserts into `ip_logs` when Postgres is available (DATABASE_URL / Neon),
 *   skipping known hosting/cloud IPs and obvious bots.
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { dbSource, getSql } from "./db";
import { lookupIpGeo, type IpGeo } from "./ip-geo";

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

function ipv4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d+$/.test(p)) return null;
    const o = Number(p);
    if (o < 0 || o > 255) return null;
    n = (n << 8) + o;
  }
  return n >>> 0;
}

/** CIDR as [networkInt, prefixLen] for IPv4 only. */
type Cidr4 = readonly [network: number, prefix: number];

function parseCidr4(cidr: string): Cidr4 | null {
  const [base, bitsStr] = cidr.split("/");
  if (!base || !bitsStr) return null;
  const network = ipv4ToInt(base);
  const prefix = Number(bitsStr);
  if (network === null || !Number.isInteger(prefix) || prefix < 0 || prefix > 32) return null;
  return [network, prefix];
}

function inCidr4(ipInt: number, network: number, prefix: number): boolean {
  if (prefix === 0) return true;
  const mask = prefix === 32 ? 0xffffffff : (~0 << (32 - prefix)) >>> 0;
  return (ipInt & mask) === (network & mask);
}

/**
 * Major public cloud / hosting IPv4 ranges (compact, not exhaustive).
 * Goal: drop bots and infra checks (AWS/GCP/Azure/…), keep residential ISPs.
 */
const HOSTING_CIDRS_V4: Cidr4[] = (
  [
    // AWS (common aggregates; full list is huge — covers typical EC2/Lambda egress)
    "3.0.0.0/8",
    "13.0.0.0/8",
    "15.0.0.0/8",
    "18.0.0.0/8",
    "34.0.0.0/8",
    "35.0.0.0/8",
    "44.0.0.0/8",
    "52.0.0.0/8",
    "54.0.0.0/8",
    "99.77.0.0/16",
    "99.78.0.0/16",
    "100.20.0.0/14",
    "100.24.0.0/13",
    // Google Cloud
    "8.34.0.0/16",
    "8.35.0.0/16",
    "23.236.0.0/16",
    "23.251.0.0/16",
    "34.0.0.0/8",
    "35.184.0.0/13",
    "35.192.0.0/12",
    "35.208.0.0/12",
    "35.224.0.0/12",
    "35.240.0.0/13",
    "104.154.0.0/15",
    "104.196.0.0/14",
    "107.167.0.0/16",
    "107.178.0.0/16",
    "108.59.0.0/16",
    "130.211.0.0/16",
    "146.148.0.0/16",
    "162.216.0.0/16",
    "162.222.0.0/16",
    "173.255.0.0/16",
    "209.85.0.0/16",
    // Azure / Microsoft
    "13.64.0.0/11",
    "13.96.0.0/13",
    "20.0.0.0/8",
    "40.64.0.0/10",
    "40.74.0.0/15",
    "40.76.0.0/14",
    "40.80.0.0/12",
    "40.96.0.0/12",
    "40.112.0.0/13",
    "40.120.0.0/14",
    "40.124.0.0/14",
    "52.224.0.0/11",
    "104.40.0.0/13",
    // DigitalOcean
    "45.55.0.0/16",
    "67.205.0.0/16",
    "68.183.0.0/16",
    "104.131.0.0/16",
    "134.122.0.0/16",
    "138.68.0.0/16",
    "139.59.0.0/16",
    "142.93.0.0/16",
    "157.230.0.0/16",
    "159.65.0.0/16",
    "159.89.0.0/16",
    "161.35.0.0/16",
    "164.90.0.0/16",
    "165.22.0.0/16",
    "167.71.0.0/16",
    "167.99.0.0/16",
    "174.138.0.0/16",
    "188.166.0.0/16",
    "206.189.0.0/16",
    // Hetzner
    "5.9.0.0/16",
    "49.12.0.0/16",
    "78.46.0.0/15",
    "88.99.0.0/16",
    "95.216.0.0/16",
    "116.203.0.0/16",
    "136.243.0.0/16",
    "138.201.0.0/16",
    "144.76.0.0/16",
    "148.251.0.0/16",
    "159.69.0.0/16",
    "168.119.0.0/16",
    "176.9.0.0/16",
    "178.63.0.0/16",
    "188.34.0.0/16",
    "195.201.0.0/16",
    // OVH
    "51.38.0.0/16",
    "51.68.0.0/16",
    "51.75.0.0/16",
    "51.83.0.0/16",
    "51.91.0.0/16",
    "54.36.0.0/16",
    "54.37.0.0/16",
    "91.121.0.0/16",
    "94.23.0.0/16",
    "137.74.0.0/16",
    "145.239.0.0/16",
    "147.135.0.0/16",
    "151.80.0.0/16",
    "164.132.0.0/16",
    "176.31.0.0/16",
    "178.32.0.0/15",
    "188.165.0.0/16",
    "213.186.0.0/16",
    // Linode / Akamai compute
    "45.33.0.0/16",
    "45.56.0.0/16",
    "45.79.0.0/16",
    "50.116.0.0/16",
    "66.175.0.0/16",
    "66.228.0.0/16",
    "69.164.0.0/16",
    "72.14.0.0/16",
    "74.207.0.0/16",
    "96.126.0.0/16",
    "97.107.0.0/16",
    "139.144.0.0/16",
    "172.104.0.0/16",
    "172.105.0.0/16",
    "176.58.0.0/16",
    "178.79.0.0/16",
    "192.46.0.0/16",
    "192.155.0.0/16",
    "198.58.0.0/16",
    "198.74.0.0/16",
    // Oracle Cloud (partial)
    "129.146.0.0/16",
    "129.148.0.0/16",
    "129.159.0.0/16",
    "132.145.0.0/16",
    "134.70.0.0/16",
    "138.1.0.0/16",
    "140.91.0.0/16",
    "140.238.0.0/16",
    "150.136.0.0/16",
    "152.67.0.0/16",
    "158.101.0.0/16",
    "168.138.0.0/16",
    "192.29.0.0/16",
    // Vercel / related (partial — many share AWS)
    "76.76.21.0/24",
    "76.76.19.0/24",
    // Private / reserved (should not appear as public client IP)
    "10.0.0.0/8",
    "127.0.0.0/8",
    "169.254.0.0/16",
    "172.16.0.0/12",
    "192.168.0.0/16",
  ] as const
)
  .map(parseCidr4)
  .filter((c): c is Cidr4 => c !== null);

/**
 * True if the IPv4 address falls in a known hosting / cloud / private range.
 * IPv6 and unparseable addresses are treated as non-hosting (logged).
 */
export function isHostingOrCloudIp(ip: string): boolean {
  const trimmed = ip.trim().toLowerCase();
  if (!trimmed || trimmed === "unknown" || trimmed === "::1") return true;
  // Simple IPv6 cloud-ish: skip pure IPv6 for now if it looks like AWS/GCP docs ranges is hard;
  // filter common local IPv6 only.
  if (trimmed.includes(":")) {
    if (trimmed.startsWith("fc") || trimmed.startsWith("fd") || trimmed.startsWith("fe80")) return true;
    return false;
  }
  const ipInt = ipv4ToInt(trimmed);
  if (ipInt === null) return true;
  for (const [network, prefix] of HOSTING_CIDRS_V4) {
    if (inCidr4(ipInt, network, prefix)) return true;
  }
  return false;
}

/** Obvious non-browser / automation user-agents. */
export function isBotUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return true;
  const s = ua.toLowerCase();
  return /bot|crawl|spider|slurp|headless|phantom|selenium|puppeteer|playwright|curl\/|wget\/|python-requests|go-http-client|httpclient|scrapy|preview|uptime|monitor|healthcheck|pingdom|statuscake/i.test(
    s,
  );
}

/** Skip DB persistence for hosting/cloud IPs and bots. */
export function shouldSkipVisitorLog(ip: string, userAgent: string | null): boolean {
  if (isHostingOrCloudIp(ip)) return true;
  if (isBotUserAgent(userAgent)) return true;
  return false;
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
 * DB insert only when `DATABASE_URL` is set and the visitor is not hosting/bot.
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
    const filtered = shouldSkipVisitorLog(ip, userAgent);

    console.info(
      "[ip_log]",
      JSON.stringify({
        ip,
        path,
        locale,
        userAgent,
        at,
        db: dbSource,
        filtered,
        hosting: isHostingOrCloudIp(ip),
        botUa: isBotUserAgent(userAgent),
      }),
    );

    if (filtered) {
      return { ok: true, skipped: true, persisted: false, ip, reason: "hosting_or_bot" };
    }

    let geo: IpGeo = {
      country: null,
      countryCode: null,
      region: null,
      city: null,
      latitude: null,
      longitude: null,
      org: null,
      timezone: null,
      source: "none",
    };
    try {
      geo = await lookupIpGeo(ip);
    } catch (err) {
      console.warn("[logVisit] geo", err);
    }

    console.info(
      "[ip_geo]",
      JSON.stringify({
        ip,
        country: geo.country,
        countryCode: geo.countryCode,
        region: geo.region,
        city: geo.city,
        org: geo.org,
        source: geo.source,
      }),
    );

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
        insert into ip_logs (
          ip, user_agent, path, locale,
          country, country_code, region, city,
          latitude, longitude, org, timezone
        )
        values (
          ${ip}, ${userAgent}, ${path}, ${locale},
          ${geo.country}, ${geo.countryCode}, ${geo.region}, ${geo.city},
          ${geo.latitude}, ${geo.longitude}, ${geo.org}, ${geo.timezone}
        )
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
  country: string | null;
  country_code: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  org: string | null;
  timezone: string | null;
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
        `select id, ip, user_agent, path, locale,
                country, country_code, region, city,
                latitude, longitude, org, timezone,
                created_at::text as created_at
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
