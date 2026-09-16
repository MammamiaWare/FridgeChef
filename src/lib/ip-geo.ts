/**
 * Server-side IP geolocation (no API key).
 * Primary: ipwho.is — fallback: geojs.io
 */

export type IpGeo = {
  country: string | null;
  countryCode: string | null;
  region: string | null;
  city: string | null;
  latitude: number | null;
  longitude: number | null;
  org: string | null;
  timezone: string | null;
  source: "ipwho" | "geojs" | "none";
};

const EMPTY: IpGeo = {
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

function isPublicIp(ip: string): boolean {
  const t = ip.trim().toLowerCase();
  if (!t || t === "unknown" || t === "::1") return false;
  if (t.includes(":")) return true; // IPv6 public-ish; APIs may resolve
  const parts = t.split(".").map(Number);
  if (parts.length !== 4 || parts.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10 || a === 127) return false;
  if (a === 192 && b === 168) return false;
  if (a === 172 && b >= 16 && b <= 31) return false;
  if (a === 169 && b === 254) return false;
  return true;
}

function numOrNull(v: unknown): number | null {
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

function strOrNull(v: unknown, max = 128): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s || s === "N/A" || s === "undefined") return null;
  return s.slice(0, max);
}

async function lookupIpwho(ip: string, signal: AbortSignal): Promise<IpGeo | null> {
  const res = await fetch(`https://ipwho.is/${encodeURIComponent(ip)}`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  if (j.success === false) return null;
  return {
    country: strOrNull(j.country),
    countryCode: strOrNull(j.country_code, 8),
    region: strOrNull(j.region),
    city: strOrNull(j.city),
    latitude: numOrNull(j.latitude),
    longitude: numOrNull(j.longitude),
    org: strOrNull(j.connection && typeof j.connection === "object"
      ? (j.connection as { org?: string }).org ?? (j.connection as { isp?: string }).isp
      : j.org ?? j.isp),
    timezone: strOrNull(
      j.timezone && typeof j.timezone === "object"
        ? (j.timezone as { id?: string }).id
        : j.timezone,
      64,
    ),
    source: "ipwho",
  };
}

async function lookupGeojs(ip: string, signal: AbortSignal): Promise<IpGeo | null> {
  const res = await fetch(`https://get.geojs.io/v1/ip/geo/${encodeURIComponent(ip)}.json`, {
    signal,
    headers: { accept: "application/json" },
  });
  if (!res.ok) return null;
  const j = (await res.json()) as Record<string, unknown>;
  return {
    country: strOrNull(j.country),
    countryCode: strOrNull(j.country_code ?? j.country_code3, 8),
    region: strOrNull(j.region),
    city: strOrNull(j.city),
    latitude: numOrNull(j.latitude),
    longitude: numOrNull(j.longitude),
    org: strOrNull(j.organization ?? j.organization_name ?? j.asn),
    timezone: strOrNull(j.timezone, 64),
    source: "geojs",
  };
}

/**
 * Resolve approximate geo for a public IP. Fails soft → empty fields.
 * Timeout ~2.5s so logVisit stays fast on Vercel.
 */
export async function lookupIpGeo(ip: string): Promise<IpGeo> {
  if (!isPublicIp(ip)) return { ...EMPTY };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 2500);

  try {
    try {
      const primary = await lookupIpwho(ip, ctrl.signal);
      if (primary && (primary.countryCode || primary.country || primary.city)) {
        return primary;
      }
    } catch {
      /* try fallback */
    }
    try {
      const fallback = await lookupGeojs(ip, ctrl.signal);
      if (fallback) return fallback;
    } catch {
      /* ignore */
    }
    return { ...EMPTY };
  } finally {
    clearTimeout(timer);
  }
}
