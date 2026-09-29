import { useEffect, useState } from "react";
import { deviceFromUserAgent, type DeviceInfo } from "@/lib/device-from-ua";

export type Platform = "ios" | "android" | "desktop";

export type ClientDevice = DeviceInfo & {
  platform: Platform;
  isMobile: boolean;
  isStandalone: boolean;
  isTouch: boolean;
  canInstallNativePrompt: boolean;
};

function detectStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  if (window.matchMedia?.("(display-mode: fullscreen)").matches) return true;
  return false;
}

function platformFrom(deviceType: string): Platform {
  if (deviceType === "iphone" || deviceType === "ipad") return "ios";
  if (deviceType === "android" || deviceType === "android_tablet") return "android";
  return "desktop";
}

function readClientDevice(): ClientDevice {
  if (typeof window === "undefined") {
    return {
      deviceType: "unknown",
      os: null,
      browser: null,
      platform: "desktop",
      isMobile: false,
      isStandalone: false,
      isTouch: false,
      canInstallNativePrompt: false,
    };
  }
  const base = deviceFromUserAgent(window.navigator.userAgent);
  const platform = platformFrom(base.deviceType);
  const isMobile = platform === "ios" || platform === "android";
  const isTouch =
    "ontouchstart" in window ||
    (typeof navigator !== "undefined" && navigator.maxTouchPoints > 0);
  return {
    ...base,
    platform,
    isMobile,
    isStandalone: detectStandalone(),
    isTouch,
    canInstallNativePrompt: false,
  };
}

/**
 * Client-side device profile used to adapt UI (safe areas, install banner,
 * camera capture, nav chrome) for iOS / Android / desktop from one codebase.
 */
export function useDevice(): ClientDevice {
  const [device, setDevice] = useState<ClientDevice>(() => readClientDevice());

  useEffect(() => {
    const update = () => setDevice(readClientDevice());
    update();

    const mq = window.matchMedia?.("(display-mode: standalone)");
    const onMq = () => update();
    mq?.addEventListener?.("change", onMq);

    // Reflect platform on <html> for CSS (data-platform / data-standalone)
    const root = document.documentElement;
    const apply = () => {
      const d = readClientDevice();
      root.dataset.platform = d.platform;
      root.dataset.standalone = d.isStandalone ? "1" : "0";
      root.dataset.device = d.deviceType;
      setDevice(d);
    };
    apply();

    return () => {
      mq?.removeEventListener?.("change", onMq);
    };
  }, []);

  return device;
}
