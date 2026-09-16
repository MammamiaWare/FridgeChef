/**
 * Derive device class / OS / browser from User-Agent (no external deps).
 * Goal: tell iPhone vs Mac vs Windows PC vs Android, etc.
 */

export type DeviceInfo = {
  /** Coarse class: iphone | ipad | android | mac | windows | linux | bot | unknown */
  deviceType: string;
  /** OS label: iOS | Android | macOS | Windows | Linux | … */
  os: string | null;
  /** Browser label: Safari | Chrome | Firefox | Edge | … */
  browser: string | null;
};

export function deviceFromUserAgent(ua: string | null | undefined): DeviceInfo {
  if (!ua || !ua.trim()) {
    return { deviceType: "unknown", os: null, browser: null };
  }
  const s = ua;

  if (/bot|crawl|spider|slurp|headless|curl\/|wget\/|python-requests|go-http-client/i.test(s)) {
    return { deviceType: "bot", os: null, browser: null };
  }

  // Order matters: iPad may contain "Mac" in modern UA; iPhone before Mac.
  const isIPad =
    /iPad/i.test(s) ||
    (/Macintosh/i.test(s) && /Mobile\//i.test(s) && /Safari/i.test(s));
  const isIPhone = /iPhone/i.test(s);
  const isIPod = /iPod/i.test(s);
  const isAndroid = /Android/i.test(s);
  const isMac = /Macintosh|Mac OS X/i.test(s) && !isIPad && !isIPhone;
  const isWindows = /Windows NT/i.test(s);
  const isLinux = /Linux/i.test(s) && !isAndroid;

  let deviceType = "unknown";
  let os: string | null = null;

  if (isIPhone || isIPod) {
    deviceType = "iphone";
    os = "iOS";
  } else if (isIPad) {
    deviceType = "ipad";
    os = "iPadOS";
  } else if (isAndroid) {
    deviceType = /Mobile/i.test(s) ? "android" : "android_tablet";
    os = "Android";
  } else if (isMac) {
    deviceType = "mac";
    os = "macOS";
  } else if (isWindows) {
    deviceType = "windows";
    os = "Windows";
  } else if (isLinux) {
    deviceType = "linux";
    os = "Linux";
  }

  // Browser (rough)
  let browser: string | null = null;
  if (/Edg\//i.test(s)) browser = "Edge";
  else if (/OPR\/|Opera/i.test(s)) browser = "Opera";
  else if (/Firefox\//i.test(s)) browser = "Firefox";
  else if (/CriOS\//i.test(s)) browser = "Chrome"; // Chrome on iOS
  else if (/FxiOS\//i.test(s)) browser = "Firefox";
  else if (/Chrome\//i.test(s) && !/Edg\//i.test(s)) browser = "Chrome";
  else if (/Safari\//i.test(s) && /Version\//i.test(s)) browser = "Safari";
  else if (/Safari\//i.test(s) && (isIPhone || isIPad)) browser = "Safari";

  return { deviceType, os, browser };
}

/** Human-readable one-liner for logs / UI. */
export function formatDeviceInfo(d: DeviceInfo): string {
  const parts = [d.deviceType];
  if (d.os) parts.push(d.os);
  if (d.browser) parts.push(d.browser);
  return parts.join(" · ");
}
