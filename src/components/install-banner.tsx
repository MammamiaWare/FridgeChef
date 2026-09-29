import { useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { useDevice, type Platform } from "@/lib/use-device";
import { cn } from "@/lib/utils";
import type { Locale } from "@/lib/i18n";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

const DISMISS_KEY = "fridgechef_install_dismiss_v1";

const COPY: Record<
  string,
  { title: string; android: string; ios: string; install: string; later: string; iosHint: string }
> = {
  it: {
    title: "Installa FridgeChef",
    android: "Aggiungi l'app alla schermata Home per usarla come nativa.",
    ios: "Su iPhone: tocca Condividi, poi «Aggiungi a Home».",
    install: "Installa",
    later: "Più tardi",
    iosHint: "Safari → Condividi → Aggiungi a Home",
  },
  en: {
    title: "Install FridgeChef",
    android: "Add the app to your Home screen for a native feel.",
    ios: "On iPhone: tap Share, then “Add to Home Screen”.",
    install: "Install",
    later: "Later",
    iosHint: "Safari → Share → Add to Home Screen",
  },
  pl: {
    title: "Zainstaluj FridgeChef",
    android: "Dodaj aplikację do ekranu głównego jak natywną.",
    ios: "Na iPhonie: Udostępnij → «Dodaj do ekranu początkowego».",
    install: "Zainstaluj",
    later: "Później",
    iosHint: "Safari → Udostępnij → Dodaj do ekranu początkowego",
  },
  es: {
    title: "Instalar FridgeChef",
    android: "Añade la app a la pantalla de inicio como nativa.",
    ios: "En iPhone: Compartir → «Añadir a pantalla de inicio».",
    install: "Instalar",
    later: "Más tarde",
    iosHint: "Safari → Compartir → Añadir a pantalla de inicio",
  },
  hi: {
    title: "FridgeChef इंस्टॉल करें",
    android: "नेटिव अनुभव के लिए होम स्क्रीन पर ऐप जोड़ें।",
    ios: "iPhone पर: शेयर → «होम स्क्रीन पर जोड़ें».",
    install: "इंस्टॉल",
    later: "बाद में",
    iosHint: "Safari → शेयर → होम स्क्रीन पर जोड़ें",
  },
  ar: {
    title: "ثبّت FridgeChef",
    android: "أضف التطبيق إلى الشاشة الرئيسية كأنه أصلي.",
    ios: "على الآيفون: مشاركة ← «إضافة إلى الشاشة الرئيسية».",
    install: "تثبيت",
    later: "لاحقاً",
    iosHint: "Safari ← مشاركة ← إضافة إلى الشاشة الرئيسية",
  },
  zh: {
    title: "安装 FridgeChef",
    android: "添加到主屏幕，像原生应用一样使用。",
    ios: "在 iPhone 上：分享 →「添加到主屏幕」。",
    install: "安装",
    later: "稍后",
    iosHint: "Safari → 分享 → 添加到主屏幕",
  },
};

function copyFor(locale: Locale) {
  return COPY[locale] ?? COPY.en;
}

/**
 * Platform-aware install banner:
 * - Android / Chrome: uses beforeinstallprompt when available
 * - iOS Safari: shows Share → Add to Home instructions
 * - Hidden when already standalone or user dismissed
 */
export function InstallBanner({ locale = "it" }: { locale?: Locale }) {
  const device = useDevice();
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [visible, setVisible] = useState(false);
  const [iosOpen, setIosOpen] = useState(false);
  const c = copyFor(locale);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem(DISMISS_KEY) === "1") return;
    } catch {
      /* ignore */
    }
    if (device.isStandalone) return;

    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);

    // iOS never fires beforeinstallprompt — show instructional banner on mobile Safari
    if (device.platform === "ios" && !device.isStandalone) {
      const t = window.setTimeout(() => setVisible(true), 1800);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    // Android without BIP event: still show soft prompt after delay
    if (device.platform === "android" && !device.isStandalone) {
      const t = window.setTimeout(() => setVisible(true), 2200);
      return () => {
        window.clearTimeout(t);
        window.removeEventListener("beforeinstallprompt", onBip);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [device.isStandalone, device.platform]);

  if (!visible || device.isStandalone || device.platform === "desktop") return null;

  const dismiss = () => {
    setVisible(false);
    setIosOpen(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* ignore */
    }
  };

  const onInstall = async () => {
    if (deferred) {
      await deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
      setDeferred(null);
      dismiss();
      return;
    }
    if (device.platform === "ios") {
      setIosOpen(true);
      return;
    }
    // Android fallback: open install tutorial if present
    window.location.href = "/?install=1";
  };

  return (
    <div
      className={cn(
        "fixed left-3 right-3 z-[55] mx-auto max-w-[430px] rounded-2xl border border-fg/15 bg-elevated/95 p-3 shadow-2xl backdrop-blur-xl",
        "bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))]",
      )}
      role="dialog"
      aria-label={c.title}
    >
      <div className="flex items-start gap-3">
        <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-fg">
          <Download className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{c.title}</p>
          <p className="mt-0.5 text-xs leading-snug text-muted">
            {device.platform === "ios" ? c.ios : c.android}
          </p>
          {iosOpen && device.platform === "ios" && (
            <p className="mt-2 flex items-center gap-1.5 rounded-lg bg-fg/8 px-2 py-1.5 text-[11px] text-fg">
              <Share className="size-3.5 shrink-0" />
              {c.iosHint}
            </p>
          )}
          <div className="mt-2.5 flex gap-2">
            <button
              type="button"
              onClick={onInstall}
              className="rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-fg"
            >
              {c.install}
            </button>
            <button type="button" onClick={dismiss} className="rounded-full px-3 py-1.5 text-xs text-muted">
              {c.later}
            </button>
          </div>
        </div>
        <button
          type="button"
          onClick={dismiss}
          className="grid size-8 place-items-center rounded-full text-muted"
          aria-label={c.later}
        >
          <X className="size-4" />
        </button>
      </div>
      <PlatformHint platform={device.platform} />
    </div>
  );
}

function PlatformHint({ platform }: { platform: Platform }) {
  return <span className="sr-only" data-install-platform={platform} />;
}
