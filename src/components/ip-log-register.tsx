import { useEffect, useRef } from "react";
import { logVisit } from "@/lib/ip-log";
import { loadLocale } from "@/lib/i18n";

const SESSION_KEY = "fridgechef_ip_logged_v1";

/** Fire-and-forget IP log once per browser tab session. */
export function IpLogRegister() {
  const sent = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (sent.current) return;
    if (sessionStorage.getItem(SESSION_KEY)) return;
    sent.current = true;

    const path = window.location.pathname || "/";
    let locale = "it";
    try {
      locale = loadLocale();
    } catch {
      /* ignore */
    }

    logVisit({ data: { path, locale } })
      .then(() => {
        try {
          sessionStorage.setItem(SESSION_KEY, "1");
        } catch {
          /* ignore */
        }
      })
      .catch(() => {
        /* non-blocking */
      });
  }, []);

  return null;
}
