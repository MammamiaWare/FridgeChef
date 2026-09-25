import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  ChefHat,
  ChevronDown,
  Clock3,
  Home,
  Cake,
  Minus,
  Plus,
  Search,
  ShoppingCart,
  Sparkles,
  Trash2,
  UserRound,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createRecipes, organizeFridgePlan, readFridgePhoto } from "@/lib/analyze";
import { artForRecipe, catalogBySection, FOOD_ART, matchCookbook, popularRecipes } from "@/lib/cookbook";
import { ingredientLabel, type FridgeOrganization } from "@/lib/recipe-ai";
import { clearHistory, loadHistory, pushHistory } from "@/lib/history";
import {
  addShopping,
  clearDoneShopping,
  filterShoppingMissing,
  loadShopping,
  removeShopping,
  toggleShopping,
} from "@/lib/shopping";
import { compressImage } from "@/lib/image";
import { cn } from "@/lib/utils";
import {
  catalogSectionTitle,
  dietLabel,
  loadLocale,
  LOCALES,
  saveLocale,
  t,
  type Locale,
} from "@/lib/i18n";
import {
  DEFAULT_PREFS,
  type Analysis,
  type Diet,
  type HistoryEntry,
  type Prefs,
  type Recipe,
  type ShoppingItem,
} from "@/lib/types";
import { NavBtn, RecipeGrid, RecipeSheet, ShoppingSheet, FridgePlanPanel, OnboardingOverlay } from "@/components/fridgechef-panels";

type Phase = "idle" | "analyzing" | "thinking" | "ready";
type Tab = "home" | "recipes" | "camera" | "history" | "profile";

const DIET_IDS: Diet[] = ["any", "vegetarian", "vegan", "fast"];

function LeafMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="9" fill="#C6F53D" />
      <path
        d="M16.2 7.2c4.8 1.4 8 5.4 8.3 10.4-3.6-.2-7.2-2.2-9-5.8-1.7 3.4-4.9 5.4-8.5 5.8C7.4 12.4 11 8.6 16.2 7.2Z"
        fill="#10140A"
      />
      <path d="M16 13.2v11.2" stroke="#10140A" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

export function FridgeChef() {
  const fileRef = useRef<HTMLInputElement>(null);
  const [phase, setPhase] = useState<Phase>("idle");
  const [tab, setTab] = useState<Tab>("home");
  const [prefs, setPrefs] = useState<Prefs>(DEFAULT_PREFS);
  const [photo, setPhoto] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [prefsDirty, setPrefsDirty] = useState(false);
  const [extraIngredient, setExtraIngredient] = useState("");
  const [query, setQuery] = useState("");
  const [manual, setManual] = useState("");
  const [selected, setSelected] = useState<Recipe | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [shopping, setShopping] = useState<ShoppingItem[]>([]);
  const [shoppingOpen, setShoppingOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [openCatalogId, setOpenCatalogId] = useState<string | null>(null);
  const [fridgePlan, setFridgePlan] = useState<FridgeOrganization | null>(null);
  const [organizing, setOrganizing] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingStep, setOnboardingStep] = useState(0);
  const [locale, setLocale] = useState<Locale>("it");

  useEffect(() => {
    setHistory(loadHistory());
    setShopping(loadShopping());
    setLocale(loadLocale());
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === "ar" ? "rtl" : "ltr";
  }, [locale]);

  useEffect(() => {
    try {
      if (typeof window !== "undefined" && !localStorage.getItem("frigochef_onboarding_v1")) {
        setShowOnboarding(true);
      }
    } catch {
      /* private mode */
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(timer);
  }, [toast]);

  const toBuy = shopping.filter((i) => !i.done).length;

  const addMissing = (recipe: Recipe) => {
    const items = filterShoppingMissing(recipe.missing);
    if (!items.length) {
      setToast(t(locale, "toastNothing"));
      return;
    }
    setShopping(addShopping(items, recipe.title));
    setToast(
      items.length === 1 ? t(locale, "toastOne") : t(locale, "toastMany", { n: items.length }),
    );
  };

  const updatePrefs = (patch: Partial<Prefs>) => {
    setPrefs((p) => ({ ...p, ...patch }));
    if (analysis?.recipes?.length) setPrefsDirty(true);
  };

  const popular = useMemo(
    () => popularRecipes({ ...prefs, maxMinutes: prefs.diet === "fast" ? 15 : prefs.maxMinutes }, locale),
    [prefs, locale],
  );

  const cookRecipe = (recipe: Recipe) => {
    setHistory(pushHistory(recipe));
  };

  const toggleIngredient = (name: string) => {
    setAnalysis((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) =>
          i.name === name ? { ...i, have: !i.have } : i,
        ),
      };
    });
  };

  const selectedLabels = (): string[] => {
    const fromFridge = (analysis?.ingredients ?? [])
      .filter((i) => i.have)
      .map((i) => ingredientLabel(i));
    const extra = [
      ...manual.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
      ...extraIngredient.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean),
    ];
    return [...fromFridge, ...extra];
  };

  const runCreateRecipes = async (opts?: { avoidTitles?: string[]; append?: boolean }) => {
    const ingredients = selectedLabels();
    if (!ingredients.length) {
      setError(t(locale, "errSelectIngredient"));
      return;
    }
    setPhase("thinking");
    setError(null);
    setPrefsDirty(false);
    try {
      const res = await createRecipes({
        data: {
          ingredients,
          prefs,
          avoidTitles: opts?.avoidTitles,
          count: 4,
          locale,
        },
      });
      if (res.ok) {
        setAnalysis((prev) => ({
          ingredients: prev?.ingredients ?? ingredients.map((name) => ({ name, have: true })),
          notes: res.notes || prev?.notes || "",
          recipes: opts?.append
            ? [...(prev?.recipes ?? []), ...res.recipes].slice(0, 12)
            : res.recipes,
          source: "ai",
        }));
        setError(null);
      } else {
        setAnalysis((prev) => ({
          ingredients: prev?.ingredients ?? ingredients.map((name) => ({ name, have: true })),
          notes: prev?.notes || "",
          recipes: opts?.append
            ? [...(prev?.recipes ?? []), ...res.recipes].slice(0, 12)
            : res.recipes,
          source: "book",
        }));
        setError(res.message);
      }
      setPhase("ready");
      setTab("home");
    } catch (e) {
      console.error(e);
      setError(t(locale, "errAiConnection"));
      setPhase("ready");
    }
  };

  const runCookbookRecipes = () => {
    const ingredients = selectedLabels();
    if (!ingredients.length) {
      setError(t(locale, "errSelectIngredient"));
      return;
    }
    const names = ingredients.map((label) => label.replace(/\s*\([^)]*\)\s*$/, "").trim());
    const recipes = matchCookbook(
      names,
      {
        ...prefs,
        maxMinutes: prefs.diet === "fast" ? Math.min(15, prefs.maxMinutes) : prefs.maxMinutes,
      },
      locale,
    );
    setPrefsDirty(false);
    setAnalysis((prev) => ({
      ingredients: prev?.ingredients ?? names.map((name) => ({ name, have: true })),
      notes: prev?.notes || "",
      recipes,
      source: "book",
    }));
    setError(null);
    setPhase("ready");
    setTab("home");
  };

  const runOrganizeFridge = async () => {
    const items = (analysis?.ingredients ?? []).filter((i) => i.have);
    if (!items.length) {
      setError(t(locale, "errSelectFood"));
      return;
    }
    setOrganizing(true);
    setError(null);
    try {
      const res = await organizeFridgePlan({
        data: {
          ingredients: items.map((i) => ({
            name: i.name,
            quantity: i.quantity,
            confidence: i.confidence,
          })),
          locale,
        },
      });
      if (res.ok) {
        setFridgePlan(res.plan);
      } else {
        setError(res.message);
      }
    } catch (e) {
      console.error(e);
      setError(t(locale, "errOrganize"));
    } finally {
      setOrganizing(false);
    }
  };

  const handleFile = async (file: File | null) => {
    if (!file) return;
    setPhase("analyzing");
    setTab("home");
    setError(null);
    setSelected(null);
    setPrefsDirty(false);
    try {
      const dataUrl = await compressImage(file);
      setPhoto(dataUrl);
      const res = await readFridgePhoto({ data: { image: dataUrl, locale } });
      if (!res.ok) {
        setError(res.message);
        setAnalysis({ ingredients: [], notes: "", recipes: [], source: undefined });
        setPhase("ready");
        return;
      }
      setAnalysis({
        ingredients: res.ingredients,
        notes: res.notes,
        recipes: [],
        source: undefined,
      });
      setError(null);
      setPhase("ready");
    } catch {
      setError(t(locale, "errGeneric"));
      setPhase("idle");
    }
  };

  const addManual = async () => {
    const extra = manual.split(/[,;\n]/).map((s) => s.trim()).filter(Boolean);
    if (!extra.length) return;
    setAnalysis({
      ingredients: extra.map((name) => ({ name, have: true })),
      notes: "",
      recipes: [],
      source: undefined,
    });
    setPhoto(null);
    setPrefsDirty(false);
    await runCreateRecipes();
  };

  const dismissOnboarding = () => {
    try {
      localStorage.setItem("frigochef_onboarding_v1", "1");
    } catch {
      /* ignore */
    }
    setShowOnboarding(false);
    setOnboardingStep(0);
  };

  const reset = () => {
    setPhase("idle");
    setAnalysis(null);
    setPhoto(null);
    setError(null);
    setSelected(null);
    setPrefsDirty(false);
    setExtraIngredient("");
    setFridgePlan(null);
    setTab("home");
  };

  const filteredPopular = popular.filter((r) => !query || r.title.toLowerCase().includes(query.toLowerCase()));
  const catalogSections = useMemo(
    () =>
      catalogBySection(
        { ...prefs, maxMinutes: prefs.diet === "fast" ? 15 : prefs.maxMinutes },
        query,
        locale,
      ),
    [prefs, query, locale],
  );
  const shownRecipes = (analysis?.recipes ?? filteredPopular).filter(
    (r) => !query || r.title.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <main className="relative min-h-dvh overflow-x-hidden bg-bg text-fg">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(1200px_600px_at_50%_-10%,#1a2430,transparent_60%)]" />

      <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
        <img src={FOOD_ART.avocado} alt="" className="food-float float-a absolute left-[-24px] top-[2%] w-24 opacity-45" />
        <img src={FOOD_ART.tomato} alt="" className="food-float float-b absolute right-[-8px] top-[8%] w-20 opacity-45" />
        <img src={FOOD_ART.lettuce} alt="" className="food-float float-c absolute right-[-28px] top-[18%] w-28 opacity-35" />
        <img src={FOOD_ART.onion} alt="" className="food-float float-b absolute left-[-28px] top-[27%] w-20 opacity-40" />
        <img src={FOOD_ART.lemon} alt="" className="food-float float-a absolute left-[-20px] top-[42%] w-24 opacity-40" />
        <img src={FOOD_ART.pepper} alt="" className="food-float float-c absolute right-[-16px] top-[57%] w-24 opacity-40" />
        <img src={FOOD_ART.mushrooms} alt="" className="food-float float-a absolute left-[-24px] top-[73%] w-24 opacity-40" />
      </div>

      <div className="relative z-10 mx-auto flex min-h-dvh w-full max-w-[430px] flex-col px-5 pb-28 pt-6">
        <header className="relative z-10 mb-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <LeafMark className="size-11" />
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-muted">{t(locale, "tagline")}</p>
              <h1 className="text-xl font-semibold tracking-tight">FridgeChef</h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <label className="glass relative flex h-11 items-center rounded-full pl-3 pr-2">
              <span className="pointer-events-none text-base leading-none" aria-hidden>
                {LOCALES.find((l) => l.id === locale)?.flag ?? "🌐"}
              </span>
              <select
                className="absolute inset-0 cursor-pointer appearance-none opacity-0"
                aria-label={t(locale, "language")}
                value={locale}
                onChange={(e) => {
                  const next = e.target.value as Locale;
                  if (LOCALES.some((l) => l.id === next)) {
                    setLocale(next);
                    saveLocale(next);
                  }
                }}
              >
                {LOCALES.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.flag} {l.label}
                  </option>
                ))}
              </select>
              <span className="pointer-events-none ml-1.5 text-[11px] font-semibold text-fg">
                {LOCALES.find((l) => l.id === locale)?.short}
              </span>
            </label>
            <button
              type="button"
              onClick={() => setShoppingOpen(true)}
              className="glass relative grid size-11 place-items-center rounded-full"
              aria-label={toBuy ? t(locale, "shoppingAriaN", { n: toBuy }) : t(locale, "shoppingAria")}
            >
              <ShoppingCart className="size-5" />
              {toBuy > 0 && (
                <span className="absolute -right-0.5 -top-0.5 grid min-w-5 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-accent-fg">
                  {toBuy}
                </span>
              )}
            </button>
            <div className="glass flex items-center gap-2 rounded-full px-2 py-1">
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full text-muted"
                onClick={() => updatePrefs({ servings: Math.max(1, prefs.servings - 1) })}
                aria-label={t(locale, "lessPortions")}
              >
                <Minus className="size-3.5" />
              </button>
              <span className="min-w-8 text-center text-sm font-semibold">{prefs.servings}</span>
              <button
                type="button"
                className="grid size-8 place-items-center rounded-full text-muted"
                onClick={() => updatePrefs({ servings: Math.min(8, prefs.servings + 1) })}
                aria-label={t(locale, "morePortions")}
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </div>
        </header>

        <div className={cn("relative mb-6", tab !== "home" && tab !== "recipes" && "hidden")}>
          <label className="glass relative z-10 flex h-14 items-center gap-3 rounded-full px-5">
            <Search className="size-5 text-muted" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t(locale, "searchPlaceholder")}
              className="w-full bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
        </div>

        <div
          className={cn(
            "relative z-10 mb-5 flex gap-2 overflow-x-auto pb-1",
            tab !== "home" && tab !== "recipes" && "hidden",
          )}
        >
          {DIET_IDS.map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => updatePrefs({ diet: d, maxMinutes: d === "fast" ? 15 : 40 })}
              className={cn(
                "h-10 shrink-0 rounded-full px-4 text-sm font-medium transition-colors",
                prefs.diet === d ? "bg-accent text-accent-fg" : "glass text-fg",
              )}
            >
              {dietLabel(locale, d)}
            </button>
          ))}
          <button
            type="button"
            onClick={() =>
              updatePrefs({
                course: prefs.course === "dessert" ? "main" : "dessert",
              })
            }
            className={cn(
              "flex h-10 shrink-0 items-center gap-1.5 rounded-full px-4 text-sm font-medium transition-colors",
              prefs.course === "dessert" ? "bg-accent text-accent-fg" : "glass text-fg",
            )}
          >
            <Cake className="size-4" />
            {t(locale, "dessert")}
          </button>
        </div>

        {tab === "home" && phase === "idle" && (
          <section className="relative z-10 space-y-5">
            <Button variant="lime" size="lg" className="w-full" onClick={() => fileRef.current?.click()}>
              <Camera className="size-5" />
              {t(locale, "shootPhoto")}
            </Button>
            <div className="glass rounded-[28px] p-4">
              <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">{t(locale, "orType")}</p>
              <div className="flex gap-2">
                <input
                  value={manual}
                  onChange={(e) => setManual(e.target.value)}
                  placeholder={t(locale, "manualPlaceholder")}
                  className="h-12 flex-1 rounded-full bg-fg/8 px-4 text-sm outline-none"
                  onKeyDown={(e) => e.key === "Enter" && addManual()}
                />
                <Button variant="lime" onClick={addManual}>
                  {t(locale, "go")}
                </Button>
              </div>
            </div>
          </section>
        )}

        {tab === "home" && phase === "analyzing" && (
          <section className="relative z-10 flex flex-col items-center gap-4 py-16">
            <div className="size-12 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">{t(locale, "analyzing")}</p>
          </section>
        )}

        {tab === "home" && phase === "thinking" && (
          <section className="relative z-10 flex flex-col items-center gap-4 py-16">
            <div className="size-12 animate-spin rounded-full border-2 border-accent border-t-transparent" />
            <p className="text-sm text-muted">{t(locale, "thinking")}</p>
          </section>
        )}

        {tab === "home" && phase === "ready" && analysis && (
          <section className="relative z-10 space-y-5">
            {photo && (
              <img src={photo} alt="" className="h-32 w-full rounded-[24px] object-cover" />
            )}
            <div>
              <h2 className="text-lg font-semibold">{t(locale, "inFridge")}</h2>
              <div className="mt-2 flex flex-wrap gap-2">
                {analysis.ingredients.map((ing) => (
                  <button
                    key={ing.name}
                    type="button"
                    onClick={() => toggleIngredient(ing.name)}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-medium",
                      ing.have ? "bg-accent text-accent-fg" : "glass text-muted line-through",
                    )}
                  >
                    {ingredientLabel(ing)}
                  </button>
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                <input
                  value={extraIngredient}
                  onChange={(e) => setExtraIngredient(e.target.value)}
                  placeholder={t(locale, "extraPlaceholder")}
                  className="h-11 flex-1 rounded-full bg-fg/8 px-4 text-sm outline-none"
                />
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <Button variant="lime" size="lg" className="w-full" onClick={() => runCreateRecipes()}>
                <Sparkles className="size-5" />
                {t(locale, "createRecipes")}
              </Button>
              <Button variant="outline" size="lg" className="w-full" onClick={runCookbookRecipes}>
                <ChefHat className="size-5" />
                {t(locale, "classicCookbook")}
              </Button>
              <Button variant="outline" size="lg" className="w-full" onClick={runOrganizeFridge} disabled={organizing}>
                {organizing ? t(locale, "organizing") : t(locale, "organizeFridge")}
              </Button>
              {prefsDirty && (
                <Button variant="outline" className="w-full" onClick={() => runCreateRecipes()}>
                  {t(locale, "updateWithFilters")}
                </Button>
              )}
            </div>

            {fridgePlan && (
              <FridgePlanPanel locale={locale} plan={fridgePlan} onClose={() => setFridgePlan(null)} />
            )}

            {error && (
              <p className="rounded-2xl bg-red-500/15 px-4 py-3 text-sm text-red-200">{error}</p>
            )}

            {analysis.recipes.length > 0 && (
              <>
                <RecipeGrid
                  title={t(locale, "cookingNow")}
                  recipes={shownRecipes}
                  onOpen={setSelected}
                  source={analysis.source}
                  locale={locale}
                />
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() =>
                    runCreateRecipes({
                      avoidTitles: analysis.recipes.map((r) => r.title),
                      append: true,
                    })
                  }
                >
                  {t(locale, "moreIdeas")}
                </Button>
              </>
            )}

            <Button variant="outline" className="w-full" onClick={reset}>
              {t(locale, "shootPhoto")}
            </Button>
          </section>
        )}

        {tab === "recipes" && (
          <section className="relative z-10 space-y-3">
            <h2 className="text-lg font-semibold">{t(locale, "classicTitle")}</h2>
            <p className="text-sm text-muted">{t(locale, "classicHint")}</p>
            {catalogSections.map((sec) => {
              const open = openCatalogId === sec.id;
              return (
                <div key={sec.id} className="glass overflow-hidden rounded-[24px]">
                  <button
                    type="button"
                    className="flex w-full items-center justify-between px-4 py-3 text-left"
                    onClick={() => setOpenCatalogId(open ? null : sec.id)}
                  >
                    <span className="font-semibold">{catalogSectionTitle(locale, sec.id, sec.title)}</span>
                    <span className="flex items-center gap-2 text-sm text-muted">
                      {sec.recipes.length}{" "}
                      {sec.recipes.length === 1 ? t(locale, "recipesCount1") : t(locale, "recipesCountN")}
                      <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
                    </span>
                  </button>
                  {open && (
                    <div className="border-t border-fg/10 p-3">
                      <RecipeGrid
                        title=""
                        recipes={sec.recipes}
                        onOpen={setSelected}
                        source="book"
                        locale={locale}
                      />
                    </div>
                  )}
                </div>
              );
            })}
            {!catalogSections.length && (
              <p className="text-sm text-muted">{t(locale, "noRecipesSearch")}</p>
            )}
          </section>
        )}

        {tab === "history" && (
          <section className="relative z-10 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">{t(locale, "historyTitle")}</h2>
              {history.length > 0 && (
                <button type="button" className="text-sm text-muted" onClick={() => setHistory(clearHistory())}>
                  {t(locale, "clearAll")}
                </button>
              )}
            </div>
            {!history.length ? (
              <p className="text-sm text-muted">{t(locale, "historyEmpty")}</p>
            ) : (
              <ul className="space-y-2">
                {history.map((h) => (
                  <li key={h.id}>
                    <button
                      type="button"
                      className="glass flex w-full items-center gap-3 rounded-[20px] p-3 text-left"
                      onClick={() => setSelected(h.recipe)}
                    >
                      <img
                        src={artForRecipe(h.recipe.title, h.recipe.art)}
                        alt=""
                        className="size-14 rounded-xl object-cover"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{h.recipe.title}</p>
                        <p className="text-xs text-muted">
                          {new Date(h.at).toLocaleDateString(
                            locale === "zh" ? "zh-CN" : locale === "ar" ? "ar" : locale === "hi" ? "hi-IN" : locale,
                          )}
                        </p>
                      </div>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {tab === "profile" && (
          <section className="relative z-10 space-y-5">
            <h2 className="text-lg font-semibold">{t(locale, "profileTitle")}</h2>
            <div className="glass space-y-4 rounded-[28px] p-4">
              <div>
                <p className="mb-2 text-sm font-medium">{t(locale, "portions")}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full bg-fg/8"
                    onClick={() => updatePrefs({ servings: Math.max(1, prefs.servings - 1) })}
                    aria-label={t(locale, "lessPortions")}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="min-w-8 text-center text-lg font-semibold">{prefs.servings}</span>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full bg-fg/8"
                    onClick={() => updatePrefs({ servings: Math.min(8, prefs.servings + 1) })}
                    aria-label={t(locale, "morePortions")}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t(locale, "maxTime")}</p>
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full bg-fg/8"
                    onClick={() => updatePrefs({ maxMinutes: Math.max(10, prefs.maxMinutes - 5) })}
                    aria-label={t(locale, "maxTime")}
                  >
                    <Minus className="size-4" />
                  </button>
                  <span className="min-w-12 text-center text-lg font-semibold">
                    {prefs.maxMinutes} {t(locale, "minutes")}
                  </span>
                  <button
                    type="button"
                    className="grid size-10 place-items-center rounded-full bg-fg/8"
                    onClick={() => updatePrefs({ maxMinutes: Math.min(120, prefs.maxMinutes + 5) })}
                    aria-label={t(locale, "maxTime")}
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium">{t(locale, "onlyDessert")}</p>
                  <p className="text-xs text-muted">{t(locale, "onlyDessertHint")}</p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    updatePrefs({ course: prefs.course === "dessert" ? "main" : "dessert" })
                  }
                  className={cn(
                    "rounded-full px-4 py-2 text-sm font-semibold",
                    prefs.course === "dessert" ? "bg-accent text-accent-fg" : "bg-fg/8 text-muted",
                  )}
                >
                  {prefs.course === "dessert" ? t(locale, "on") : t(locale, "off")}
                </button>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">{t(locale, "language")}</p>
                <div className="flex flex-wrap gap-2">
                  {LOCALES.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      onClick={() => {
                        setLocale(l.id);
                        saveLocale(l.id);
                      }}
                      className={cn(
                        "rounded-full px-3 py-1.5 text-sm",
                        locale === l.id ? "bg-accent text-accent-fg" : "bg-fg/8",
                      )}
                    >
                      {l.flag} {l.short}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        )}

        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={(e) => handleFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-40 border-t border-fg/10 bg-bg/90 backdrop-blur-xl">
        <div className="mx-auto flex max-w-[430px] items-center justify-around px-2 py-2">
          <NavBtn active={tab === "home"} onClick={() => setTab("home")} icon={Home} label={t(locale, "navHome")} />
          <NavBtn active={tab === "recipes"} onClick={() => setTab("recipes")} icon={ChefHat} label={t(locale, "navRecipes")} />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="grid size-14 -translate-y-3 place-items-center rounded-full bg-accent text-accent-fg shadow-lg"
            aria-label={t(locale, "shootPhotoAria")}
          >
            <Camera className="size-6" />
          </button>
          <NavBtn active={tab === "history"} onClick={() => setTab("history")} icon={Clock3} label={t(locale, "navHistory")} />
          <NavBtn active={tab === "profile"} onClick={() => setTab("profile")} icon={UserRound} label={t(locale, "navProfile")} />
        </div>
      </nav>

      {selected && (
        <RecipeSheet
          recipe={selected}
          locale={locale}
          onClose={() => setSelected(null)}
          onCook={() => {
            cookRecipe(selected);
            setSelected(null);
          }}
          onAddMissing={() => addMissing(selected)}
        />
      )}

      {shoppingOpen && (
        <ShoppingSheet
          items={shopping}
          locale={locale}
          onClose={() => setShoppingOpen(false)}
          onToggle={(id) => setShopping(toggleShopping(id))}
          onRemove={(id) => setShopping(removeShopping(id))}
          onClearDone={() => setShopping(clearDoneShopping())}
        />
      )}

      {showOnboarding && (
        <OnboardingOverlay
          locale={locale}
          step={onboardingStep}
          onNext={() => {
            if (onboardingStep >= 2) dismissOnboarding();
            else setOnboardingStep((s) => s + 1);
          }}
          onSkip={dismissOnboarding}
        />
      )}

      {toast && (
        <div className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded-full bg-fg px-4 py-2 text-sm font-medium text-bg shadow-lg">
          {toast}
        </div>
      )}
    </main>
  );
}
