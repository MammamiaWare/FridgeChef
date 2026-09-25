import type { Diet, Ingredient, Prefs, Recipe } from "./types";
import { filterShoppingMissing } from "./shopping";
import { translateRecipeText } from "./recipe-translations";
import type { Locale } from "./i18n";
import { RECIPES_BASE } from "./recipes-base";
import { RECIPES_PASTA } from "./recipes-pasta";
import { RECIPES_MEAT } from "./recipes-meat";
import { RECIPES_DESSERT } from "./recipes-dessert";
import { RECIPES_CLASSIC } from "./recipes-classic";
import { RECIPES_SECONDI } from "./recipes-secondi";
import { RECIPES_PRIMI_DESSERT } from "./recipes-primi-dessert";

/** Classic cookbook has en/pl/es/hi text; ar/zh fall back to English until full translations exist. */
function recipeTextLocale(locale: Locale): "it" | "en" | "pl" | "es" | "hi" {
  if (locale === "ar" || locale === "zh") return "en";
  return locale;
}

export const FOOD_ART = {
  avocado: "/graphics/avocado.jpg",
  tomato: "/graphics/tomato.jpg",
  lettuce: "/graphics/lettuce.jpg",
  onion: "/graphics/onion.jpg",
  lemon: "/graphics/lemon.jpg",
  pepper: "/graphics/pepper.jpg",
  mushrooms: "/graphics/mushrooms.jpg",
  pasta: "/graphics/pasta.jpg",
  steak: "/graphics/steak.jpg",
  salmon: "/graphics/salmon.jpg",
  tiramisu: "/graphics/tiramisu.jpg",
  egg: "/graphics/egg.jpg",
  vegetables: "/graphics/vegetables.jpg",
  hero: "/graphics/hero.jpg",
} as const;

export const SAMPLE_INGREDIENTS: Ingredient[] = [
  "uova",
  "latte",
  "pomodori",
  "pesto",
  "mozzarella",
  "limone",
  "vino bianco",
  "parmigiano",
  "insalata",
  "yogurt",
  "carote",
  "zucchine",
  "pasta",
  "cipolla",
  "olio extravergine",
  "pollo",
  "carne macinata",
].map((name) => ({ name, have: true }));

type BookRecipe = Omit<Recipe, "missing" | "servings"> & {
  tags: string[];
  baseServings: number;
};

const BOOK: BookRecipe[] = [
  ...RECIPES_BASE,
  ...RECIPES_PASTA,
  ...RECIPES_MEAT,
  ...RECIPES_DESSERT,
  ...RECIPES_CLASSIC,
  ...RECIPES_SECONDI,
  ...RECIPES_PRIMI_DESSERT,
];

const ALIASES: Record<string, string[]> = {
  pasta: ["spaghetti", "penne", "fusilli", "trofie", "pasta avanzata", "tonnarelli", "rigatoni"],
  pomodori: ["pomodoro", "pomodorini", "pelati", "passata"],
  uova: ["uovo", "eggs", "tuorli"],
  mozzarella: ["fior di latte"],
  parmigiano: ["parmigiano reggiano", "grana", "pecorino"],
  insalata: ["lattuga", "verde", "boston", "misticanza", "iceberg"],
  funghi: ["champignon", "porcini"],
  peperoni: ["peperone"],
  cipolla: ["cipolle"],
  zucchine: ["zucchina"],
  limone: ["limoni"],
  pesto: ["pesto genovese"],
  aglio: ["spicchio"],
  yogurt: ["yogurt bianco", "yogurt greco"],
  latte: ["latte intero"],
  burro: ["noce di burro"],
  pollo: ["petto di pollo", "fusi", "sovracosce"],
  "carne macinata": ["macinato", "manzo", "vitello macinato"],
  salsiccia: ["salsicce"],
  tonno: ["tonno sott'olio"],
  ricotta: ["ricotta fresca", "ricotta salata"],
  broccoli: ["broccolo"],
  melanzane: ["melanzana"],
  guanciale: ["pancetta"],
  mascarpone: ["mascarpone"],
};

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .trim();
}

function hasIngredient(have: string[], needed: string) {
  const n = norm(needed);
  const baseKey = Object.keys(ALIASES).find((k) => n.includes(norm(k))) ?? n;
  const aliases = [norm(baseKey), n, ...(ALIASES[baseKey] ?? []).map(norm)];
  return have.some((h) => {
    const hn = norm(h);
    return aliases.some((a) => hn.includes(a) || a.includes(hn) || n.includes(hn));
  });
}

function dietOk(recipe: BookRecipe, diet: Diet) {
  if (diet === "vegan") return recipe.diet === "vegan";
  if (diet === "vegetarian") return recipe.diet !== "omnivore";
  return true;
}

function isDessert(recipe: BookRecipe) {
  return recipe.tags.includes("dessert");
}

function courseOk(recipe: BookRecipe, course: Prefs["course"]) {
  if (course === "dessert") return isDessert(recipe);
  return !isDessert(recipe);
}

function toRecipe(r: BookRecipe, servings: number, missing: string[], locale: Locale = "it"): Recipe {
  const text = translateRecipeText(r.id, recipeTextLocale(locale), {
    title: r.title,
    description: r.description ?? "",
    ingredients: r.ingredients,
    steps: r.steps,
    tip: r.tip ?? "",
  });
  return {
    id: r.id,
    title: text.title,
    description: text.description,
    minutes: r.minutes,
    diet: r.diet,
    servings,
    missing: filterShoppingMissing(missing),
    ingredients: text.ingredients,
    steps: text.steps,
    tip: text.tip,
    art: r.art,
  };
}

export function matchCookbook(haveRaw: string[], prefs: Prefs, locale: Locale = "it"): Recipe[] {
  const have = haveRaw.map(norm).filter(Boolean);
  const pool = BOOK.filter((r) => dietOk(r, prefs.diet))
    .filter((r) => courseOk(r, prefs.course))
    .filter((r) => r.minutes <= prefs.maxMinutes);

  const scored = pool
    .map((r) => {
      const localized = translateRecipeText(r.id, recipeTextLocale(locale), {
        title: r.title,
        description: r.description ?? "",
        ingredients: r.ingredients,
        steps: r.steps,
        tip: r.tip ?? "",
      });
      const missing = localized.ingredients.filter((ing) => !hasIngredient(have, ing));
      const hit = localized.ingredients.length - missing.length;
      const score = hit * 3 - missing.length + (r.minutes <= 15 ? 1 : 0);
      return { recipe: toRecipe(r, prefs.servings, missing, locale), score, hit };
    })
    .filter((x) => x.hit > 0)
    .sort((a, b) => b.score - a.score);

  const out = scored.map((s) => s.recipe);
  if (out.length >= 4) return out.slice(0, 6);

  const extras = pool
    .filter((r) => !out.some((o) => o.id === r.id))
    .slice(0, 6 - out.length)
    .map((r) =>
      toRecipe(r, prefs.servings, r.ingredients.filter((ing) => !hasIngredient(have, ing)), locale),
    );
  return [...out, ...extras].slice(0, 6);
}

export function popularRecipes(prefs: Prefs, locale: Locale = "it"): Recipe[] {
  return BOOK.filter((r) => dietOk(r, prefs.diet))
    .filter((r) => courseOk(r, prefs.course))
    .filter((r) => (prefs.diet === "fast" ? r.minutes <= 15 : r.minutes <= prefs.maxMinutes))
    .slice(0, 6)
    .map((r) => toRecipe(r, prefs.servings, [], locale));
}

export type CatalogSection = {
  id: string;
  title: string;
  recipes: Recipe[];
};

/** Catalogo del ricettario organizzato per tipo, filtrato da preferenze e ricerca. */
export function catalogBySection(prefs: Prefs, query = "", locale: Locale = "it"): CatalogSection[] {
  const q = query.trim().toLowerCase();
  const maxMin = prefs.diet === "fast" ? 15 : prefs.maxMinutes;

  const filtered = BOOK.filter((r) => dietOk(r, prefs.diet))
    .filter((r) => r.minutes <= maxMin)
    .filter((r) => !q || r.title.toLowerCase().includes(q) || r.tags.some((t) => t.includes(q)));

  const sectionOf = (r: (typeof BOOK)[number]): { id: string; title: string } => {
    if (isDessert(r) || r.tags.includes("dessert")) return { id: "dolci", title: "Dessert" };
    if (r.tags.includes("pasta") || r.tags.includes("riso")) return { id: "primi", title: "Primi" };
    if (
      r.tags.some((t) =>
        [
          "pollo",
          "carne macinata",
          "salsiccia",
          "guanciale",
          "tonno",
          "pesce",
          "tacchino",
          "manzo",
          "vitello",
          "maiale",
          "hamburger",
          "wurstel",
          "polpette",
          "calamari",
          "seppie",
          "cozze",
          "vongole",
          "sardine",
          "pesce spada",
          "polpo",
          "trota",
          "sgombro",
          "merluzzo",
        ].includes(t),
      )
    ) {
      return { id: "secondi", title: "Secondi" };
    }
    if (r.tags.includes("uova") || r.tags.includes("frittata")) {
      return { id: "uova", title: "Uova e frittate" };
    }
    return { id: "contorni", title: "Contorni e freschi" };
  };

  const order = ["primi", "secondi", "uova", "contorni", "dolci"];
  const buckets = new Map<string, { title: string; recipes: Recipe[] }>();
  for (const r of filtered) {
    const s = sectionOf(r);
    const bucket = buckets.get(s.id) ?? { title: s.title, recipes: [] };
    bucket.recipes.push(toRecipe(r, prefs.servings, [], locale));
    buckets.set(s.id, bucket);
  }

  return order
    .filter((id) => buckets.has(id) && (buckets.get(id)?.recipes.length ?? 0) > 0)
    .map((id) => {
      const b = buckets.get(id)!;
      return { id, title: b.title, recipes: b.recipes };
    });
}

export function sampleAnalysis(prefs: Prefs) {
  return {
    ingredients: SAMPLE_INGREDIENTS,
    notes: "Demo del frigo italiano: latticini, verdure, pollo e basilico.",
    recipes: matchCookbook(
      SAMPLE_INGREDIENTS.map((i) => i.name),
      prefs,
    ),
  };
}

export function artForRecipe(title: string, fallback?: string) {
  const t = norm(title);

  if (
    t.includes("pasta") ||
    t.includes("spaghett") ||
    t.includes("penne") ||
    t.includes("pennette") ||
    t.includes("fusilli") ||
    t.includes("orecchiette") ||
    t.includes("gnocchi") ||
    t.includes("risotto") ||
    t.includes("carbonara") ||
    t.includes("cacio")
  )
    return FOOD_ART.pasta;

  if (
    t.includes("tiramis") ||
    t.includes("mousse") ||
    t.includes("budino") ||
    t.includes("crepes") ||
    t.includes("panna cotta") ||
    t.includes("crumble") ||
    t.includes("cioccolat") ||
    t.includes("mattonella") ||
    t.includes("granita") ||
    t.includes("tartufini") ||
    t.includes("biscott") ||
    t.includes("marmellata") ||
    t.includes("dolce") ||
    t.includes("dolci") ||
    t.includes("frutta") ||
    t.includes("macedonia") ||
    t.includes("torta") ||
    t.includes("cake") ||
    t.includes("crema")
  )
    return FOOD_ART.tiramisu;

  if (
    t.includes("pollo") ||
    t.includes("tacchino") ||
    t.includes("manzo") ||
    t.includes("vitello") ||
    t.includes("maiale") ||
    t.includes("hamburger") ||
    t.includes("wurstel") ||
    t.includes("polpette") ||
    t.includes("salsiccia") ||
    t.includes("guanciale") ||
    t.includes("bistecca") ||
    t.includes("braciol") ||
    t.includes("macinato")
  )
    return FOOD_ART.steak;

  if (
    t.includes("tonno") ||
    t.includes("pesce") ||
    t.includes("calamar") ||
    t.includes("seppi") ||
    t.includes("cozze") ||
    t.includes("vongole") ||
    t.includes("sardine") ||
    t.includes("polpo") ||
    t.includes("trota") ||
    t.includes("sgombro") ||
    t.includes("merluzzo") ||
    t.includes("salmone")
  )
    return FOOD_ART.salmon;

  if (
    t.includes("frittata") ||
    t.includes("omelette") ||
    t.includes("tegamino") ||
    t.includes("uov")
  )
    return FOOD_ART.egg;

  return FOOD_ART.vegetables || fallback;
}
