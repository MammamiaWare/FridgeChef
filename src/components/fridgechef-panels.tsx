import { useState, type ReactNode } from "react";
import {
  Check,
  ChevronDown,
  Clock3,
  Home,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  X,
  Camera,
  ChefHat,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { artForRecipe } from "@/lib/cookbook";
import { cn } from "@/lib/utils";
import { catalogSectionTitle, t, type Locale } from "@/lib/i18n";
import type { HistoryEntry, Recipe, ShoppingItem } from "@/lib/types";
import type { FridgeOrganization } from "@/lib/recipe-ai";

const FRIDGE_ZONE_ORDER = [
  { key: "porta", label: "Porta", match: /porta/i },
  { key: "superiore", label: "Ripiano superiore", match: /superior/i },
  { key: "centrali", label: "Ripiani centrali", match: /central/i },
  { key: "inferiore", label: "Ripiano inferiore", match: /inferior/i },
  { key: "cassetti", label: "Cassetti", match: /casset/i },
] as const;

export function NavBtn({
  active,
  onClick,
  icon: Icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("flex flex-col items-center gap-0.5 px-2 py-1 text-[10px]", active ? "text-accent" : "text-muted")}
    >
      <Icon className="size-5" />
      {label}
    </button>
  );
}

export function RecipeGrid({
  title,
  recipes,
  onOpen,
  source,
  locale = "it",
}: {
  title: string;
  recipes: Recipe[];
  onOpen: (r: Recipe) => void;
  source?: "ai" | "book";
  locale?: Locale;
}) {
  if (!recipes.length) return null;
  return (
    <div>
      <h2 className="mb-3 text-lg font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-3">
        {recipes.map((r) => (
          <button
            key={r.id}
            type="button"
            onClick={() => onOpen(r)}
            className="glass overflow-hidden rounded-[24px] text-left"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <img
                src={artForRecipe(r.title, r.art)}
                alt=""
                className="h-full w-full object-cover"
              />
              {source === "ai" && (
                <span className="absolute left-2 top-2 rounded-full bg-accent/95 px-2 py-0.5 text-[10px] font-semibold text-accent-fg">
                  {t(locale, "chefAI")}
                </span>
              )}
              {source === "book" && (
                <span className="absolute left-2 top-2 rounded-full bg-amber-400/95 px-2 py-0.5 text-[10px] font-semibold text-stone-900">
                  {t(locale, "classic")}
                </span>
              )}
            </div>
            <div className="space-y-1 p-3">
              <p className="line-clamp-2 text-sm font-semibold leading-snug">{r.title}</p>
              {r.description ? (
                <p className="line-clamp-2 text-[11px] leading-snug text-muted">{r.description}</p>
              ) : null}
              <p className="flex items-center gap-1 text-[11px] text-muted">
                <Clock3 className="size-3" />
                {r.minutes} {t(locale, "minutes")}
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function RecipeSheet({
  recipe,
  locale = "it",
  onClose,
  onCook,
  onAddMissing,
}: {
  recipe: Recipe;
  locale?: Locale;
  onClose: () => void;
  onCook: () => void;
  onAddMissing: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[90dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-bg p-5 sm:rounded-[28px]">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{recipe.title}</h2>
            <p className="mt-1 flex items-center gap-1 text-sm text-muted">
              <Clock3 className="size-4" />
              {recipe.minutes} {t(locale, "minutes")} · {recipe.servings} {t(locale, "servingsWord")}
            </p>
          </div>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-fg/8" aria-label={t(locale, "close")}>
            <X className="size-4" />
          </button>
        </div>
        {recipe.description ? <p className="mb-4 text-sm leading-relaxed text-muted">{recipe.description}</p> : null}
        <h3 className="mb-2 text-sm font-semibold">{t(locale, "ingredients")}</h3>
        <ul className="mb-4 space-y-1 text-sm">
          {recipe.ingredients.map((ing, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-accent">·</span>
              <span>{ing}</span>
            </li>
          ))}
        </ul>
        <h3 className="mb-2 text-sm font-semibold">{t(locale, "steps")}</h3>
        <ol className="mb-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed">
          {recipe.steps.map((step, i) => (
            <li key={i}>{step}</li>
          ))}
        </ol>
        {recipe.tip ? (
          <p className="mb-4 rounded-2xl bg-accent/15 p-3 text-sm">
            <span className="font-semibold">{t(locale, "tip")}: </span>
            {recipe.tip}
          </p>
        ) : null}
        {recipe.missing?.length ? (
          <div className="mb-4">
            <p className="mb-2 text-sm font-semibold">{t(locale, "missingLabel")}</p>
            <ul className="mb-2 space-y-1 text-sm text-muted">
              {recipe.missing.map((m, i) => (
                <li key={i}>· {m}</li>
              ))}
            </ul>
            <Button variant="outline" className="w-full" onClick={onAddMissing}>
              <ShoppingCart className="size-4" />
              {t(locale, "addToShopping")}
            </Button>
          </div>
        ) : null}
        <Button variant="lime" className="w-full" onClick={onCook}>
          <Check className="size-4" />
          {t(locale, "cookedThis")}
        </Button>
      </div>
    </div>
  );
}

export function ShoppingSheet({
  items,
  locale = "it",
  onClose,
  onToggle,
  onRemove,
  onClearDone,
}: {
  items: ShoppingItem[];
  locale?: Locale;
  onClose: () => void;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onClearDone: () => void;
}) {
  const pending = items.filter((i) => !i.done);
  const done = items.filter((i) => i.done);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 sm:items-center">
      <div className="max-h-[85dvh] w-full max-w-[430px] overflow-y-auto rounded-t-[28px] bg-bg p-5 sm:rounded-[28px]">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{t(locale, "shoppingTitle")}</h2>
          <button type="button" onClick={onClose} className="grid size-9 place-items-center rounded-full bg-fg/8" aria-label={t(locale, "close")}>
            <X className="size-4" />
          </button>
        </div>
        {!items.length ? (
          <p className="text-sm text-muted">{t(locale, "shoppingEmpty")}</p>
        ) : (
          <>
            <ul className="space-y-2">
              {pending.map((item) => (
                <ShoppingRow key={item.id} item={item} onToggle={onToggle} onRemove={onRemove} />
              ))}
              {done.map((item) => (
                <ShoppingRow key={item.id} item={item} onToggle={onToggle} onRemove={onRemove} />
              ))}
            </ul>
            {done.length > 0 && (
              <Button variant="outline" className="mt-4 w-full" onClick={onClearDone}>
                <Trash2 className="size-4" />
                {t(locale, "clearDone")}
              </Button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ShoppingRow({
  item,
  onToggle,
  onRemove,
}: {
  item: ShoppingItem;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
}) {
  return (
    <li className="glass flex items-center gap-3 rounded-2xl px-3 py-2.5">
      <button
        type="button"
        onClick={() => onToggle(item.id)}
        className={cn(
          "grid size-6 shrink-0 place-items-center rounded-full border",
          item.done ? "border-accent bg-accent text-accent-fg" : "border-fg/20",
        )}
      >
        {item.done ? <Check className="size-3.5" /> : null}
      </button>
      <div className="min-w-0 flex-1">
        <p className={cn("text-sm font-medium", item.done && "text-muted line-through")}>
          {item.name}
        </p>
        {item.from ? <p className="text-[11px] text-muted">{item.from}</p> : null}
      </div>
      <button type="button" onClick={() => onRemove(item.id)} className="text-muted">
        <Trash2 className="size-4" />
      </button>
    </li>
  );
}

export function FridgePlanPanel({
  plan,
  onClose,
  locale = "it",
}: {
  plan: FridgeOrganization;
  onClose: () => void;
  locale?: Locale;
}) {
  const [active, setActive] = useState(0);
  const ordered = (() => {
    const used = new Set<number>();
    const result: { label: string; items: { food: string; reason: string }[] }[] = [];
    for (const slot of FRIDGE_ZONE_ORDER) {
      const match = plan.zones.find((z, i) => !used.has(i) && slot.match.test(z.zone));
      if (match) {
        const idx = plan.zones.indexOf(match);
        used.add(idx);
        result.push({
          label: slot.label,
          items: match.items.map((it) => ({
            food: (it as { name?: string; food?: string }).name || (it as { food?: string }).food || "",
            reason: (it as { reason?: string }).reason || "",
          })),
        });
      }
    }
    plan.zones.forEach((z, i) => {
      if (used.has(i)) return;
      result.push({
        label: z.zone,
        items: z.items.map((it) => ({
          food: (it as { name?: string; food?: string }).name || (it as { food?: string }).food || "",
          reason: (it as { reason?: string }).reason || "",
        })),
      });
    });
    return result.filter((z) => z.items.length > 0 || FRIDGE_ZONE_ORDER.some((s) => s.label === z.label));
  })();
  const current = ordered[active] ?? ordered[0];
  return (
    <div className="glass relative z-10 rounded-[28px] p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-semibold">{t(locale, "organizeTitle")}</h3>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-full bg-fg/8" aria-label={t(locale, "close")}>
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex gap-3">
        <div className="flex w-28 shrink-0 flex-col gap-1.5">
          {ordered.map((z, i) => {
            const selected = i === active;
            const count = z.items.length;
            return (
              <button
                key={z.label + i}
                type="button"
                onClick={() => setActive(i)}
                className={cn(
                  "flex items-center justify-between rounded-xl px-2.5 py-2 text-left text-[11px] font-medium",
                  selected ? "bg-sky-300 text-sky-950" : "bg-fg/8 text-fg",
                )}
              >
                <span className="line-clamp-2">{z.label}</span>
                {count > 0 && (
                  <span className={cn("text-[10px] font-bold", selected ? "text-sky-950" : "text-fg")}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
        <div className="min-w-0 flex-1 rounded-[20px] bg-fg/5 p-3">
          {current ? (
            <>
              <p className="mb-2 text-sm font-semibold">{current.label}</p>
              {current.items.length === 0 ? (
                <p className="text-sm text-muted">{t(locale, "nothingInZone")}</p>
              ) : (
                <ul className="space-y-2">
                  {current.items.map((it, idx) => (
                    <li key={it.food + idx} className="text-sm">
                      <span className="font-medium">{it.food}</span>
                      {it.reason ? <span className="text-muted"> — {it.reason}</span> : null}
                    </li>
                  ))}
                </ul>
              )}
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function OnboardingOverlay({
  locale = "it",
  step,
  onNext,
  onSkip,
}: {
  locale?: Locale;
  step: number;
  onNext: () => void;
  onSkip: () => void;
}) {
  const steps = [
    { title: t(locale, "onboarding1Title"), body: t(locale, "onboarding1Body") },
    { title: t(locale, "onboarding2Title"), body: t(locale, "onboarding2Body") },
    { title: t(locale, "onboarding3Title"), body: t(locale, "onboarding3Body") },
  ];
  const s = steps[Math.min(step, steps.length - 1)];
  const last = step >= steps.length - 1;
  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/70 p-4 sm:items-center">
      <div className="w-full max-w-[400px] rounded-[28px] bg-bg p-5 shadow-2xl">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">
          {t(locale, "welcome")} · {step + 1}/{steps.length}
        </p>
        <h2 className="mt-2 text-xl font-semibold">{s.title}</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
        <div className="mt-5 flex items-center gap-2">
          <Button variant="lime" className="flex-1" onClick={onNext}>
            {last ? t(locale, "start") : t(locale, "next")}
          </Button>
          {!last && (
            <button type="button" className="px-3 text-sm text-muted" onClick={onSkip}>
              {t(locale, "skip")}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
