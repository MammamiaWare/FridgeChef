/**
 * FridgeChef · Ricette create dall'AI per un palato italiano
 *
 * Due chiamate separate a Gemini (endpoint OpenAI-compatibile):
 *   1) detectIngredients() → foto del frigo → inventario
 *   2) generateRecipes()   → ingredienti confermati + preferenze → ricette
 *
 * Variabili: GEMINI_API_KEY, GEMINI_VISION_MODEL, GEMINI_RECIPE_MODEL
 */
import type { Ingredient, Prefs, Recipe } from "./types";

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
export const DEFAULT_VISION_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_RECIPE_MODEL = "gemini-3.5-flash";
export const DISPENSA_BASE: readonly string[] = [
  "sale", "pepe nero", "olio extravergine d'oliva", "aglio", "pasta secca",
  "riso", "farina", "zucchero", "aceto di vino", "origano secco", "peperoncino secco",
];
const MESI = ["gennaio","febbraio","marzo","aprile","maggio","giugno","luglio","agosto","settembre","ottobre","novembre","dicembre"];

export type Portata = "primo" | "secondo" | "contorno" | "piatto unico" | "dolce";
export type Confidence = "alta" | "media" | "bassa";
export type DetectedIngredient = { name: string; quantity: string; confidence: Confidence };
export type AppIngredient = Ingredient & { quantity?: string; confidence?: Confidence };
export type AiRecipe = Recipe & { portata: Portata; source: "ai" };
export type AiLocale = "it" | "en" | "pl" | "es" | "hi" | "ar" | "zh";
export type AiFailure =
  | "no_key" | "auth" | "quota" | "model_unavailable" | "http" | "timeout" | "network"
  | "truncated" | "empty" | "invalid_json" | "bad_input" | "nothing_found" | "no_valid_recipes";
export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; detail: string };

const AI_FAILURE_MESSAGE_IT: Record<AiFailure, string> = {
  no_key: "L'AI non è configurata: manca la chiave Gemini.",
  auth: "La chiave Gemini non è valida o non è più accettata da Google.",
  quota: "Limite di utilizzo gratuito di Gemini raggiunto: riprova più tardi.",
  model_unavailable: "Il modello AI configurato non è più disponibile.",
  http: "Il servizio AI ha risposto con un errore.",
  timeout: "L'AI non ha risposto in tempo.",
  network: "Connessione al servizio AI non riuscita.",
  truncated: "La risposta dell'AI si è interrotta: riprova.",
  empty: "L'AI non ha restituito una risposta: riprova.",
  invalid_json: "La risposta dell'AI non era leggibile: riprova.",
  bad_input: "Immagine non valida: riprova con un'altra foto.",
  nothing_found: "Non ho riconosciuto alimenti nella foto: aggiungili a mano.",
  no_valid_recipes: "Nessuna ricetta rispetta insieme dieta, tempo e ingredienti: prova ad allargare i filtri.",
};
const AI_FAILURE_MESSAGE_EN: Record<AiFailure, string> = {
  no_key: "AI is not configured: Gemini API key is missing.",
  auth: "The Gemini key is invalid or no longer accepted by Google.",
  quota: "Gemini free-tier limit reached. Try again later.",
  model_unavailable: "The configured AI model is no longer available.",
  http: "The AI service returned an error.",
  timeout: "The AI did not respond in time.",
  network: "Could not reach the AI service.",
  truncated: "The AI response was cut off. Try again.",
  empty: "The AI returned an empty response. Try again.",
  invalid_json: "The AI response was not readable. Try again.",
  bad_input: "Invalid image. Try another photo.",
  nothing_found: "No foods recognized in the photo. Add them manually.",
  no_valid_recipes: "No recipe matches diet, time and ingredients together. Try relaxing the filters.",
};
export const AI_FAILURE_MESSAGE = AI_FAILURE_MESSAGE_IT;
const AI_FAILURE_MESSAGE_PL: Record<AiFailure, string> = {
  no_key: "AI nie jest skonfigurowane: brakuje klucza Gemini.",
  auth: "Klucz Gemini jest nieprawidłowy lub nieakceptowany przez Google.",
  quota: "Osiągnięto limit darmowego Gemini. Spróbuj później.",
  model_unavailable: "Skonfigurowany model AI nie jest już dostępny.",
  http: "Usługa AI zwróciła błąd.",
  timeout: "AI nie odpowiedziało na czas.",
  network: "Nie udało się połączyć z usługą AI.",
  truncated: "Odpowiedź AI została przerwana. Spróbuj ponownie.",
  empty: "AI zwróciło pustą odpowiedź. Spróbuj ponownie.",
  invalid_json: "Odpowiedź AI była nieczytelna. Spróbuj ponownie.",
  bad_input: "Nieprawidłowe zdjęcie. Spróbuj inne.",
  nothing_found: "Nie rozpoznano produktów na zdjęciu. Dodaj je ręcznie.",
  no_valid_recipes: "Żaden przepis nie spełnia diety, czasu i składników. Poluzuj filtry.",
};
const AI_FAILURE_MESSAGE_ES: Record<AiFailure, string> = {
  no_key: "La IA no está configurada: falta la clave de Gemini.",
  auth: "La clave de Gemini no es válida o Google ya no la acepta.",
  quota: "Se alcanzó el límite gratuito de Gemini. Inténtalo más tarde.",
  model_unavailable: "El modelo de IA configurado ya no está disponible.",
  http: "El servicio de IA respondió con un error.",
  timeout: "La IA no respondió a tiempo.",
  network: "No se pudo conectar con el servicio de IA.",
  truncated: "La respuesta de la IA se cortó. Inténtalo de nuevo.",
  empty: "La IA devolvió una respuesta vacía. Inténtalo de nuevo.",
  invalid_json: "La respuesta de la IA no era legible. Inténtalo de nuevo.",
  bad_input: "Imagen no válida. Prueba con otra foto.",
  nothing_found: "No se reconocieron alimentos en la foto. Añádelos a mano.",
  no_valid_recipes: "Ninguna receta cumple a la vez dieta, tiempo e ingredientes. Amplía los filtros.",
};
const AI_FAILURE_MESSAGE_HI: Record<AiFailure, string> = {
  no_key: "AI सेट नहीं है: Gemini कुंजी नहीं मिली।",
  auth: "Gemini कुंजी अमान्य है या Google स्वीकार नहीं कर रहा।",
  quota: "मुफ़्त Gemini सीमा पूरी हो गई। बाद में कोशिश करें।",
  model_unavailable: "कॉन्फ़िगर किया गया AI मॉडल उपलब्ध नहीं है।",
  http: "AI सेवा ने त्रुटि दी।",
  timeout: "AI समय पर जवाब नहीं दिया।",
  network: "AI सेवा से कनेक्ट नहीं हो सका।",
  truncated: "AI जवाब अधूरा रह गया। फिर कोशिश करें।",
  empty: "AI ने खाली जवाब दिया। फिर कोशिश करें।",
  invalid_json: "AI जवाब पढ़ने योग्य नहीं था। फिर कोशिश करें।",
  bad_input: "अमान्य फ़ोटो। दूसरी आज़माएँ।",
  nothing_found: "फ़ोटो में खाद्य नहीं पहचाने गए। खुद जोड़ें।",
  no_valid_recipes: "कोई रेसिपी आहार, समय और सामग्री एक साथ पूरा नहीं करती। फ़िल्टर ढीले करें।",
};
export function aiFailureMessage(locale: AiLocale | undefined, reason: AiFailure): string {
  if (locale === "en") return AI_FAILURE_MESSAGE_EN[reason];
  if (locale === "pl") return AI_FAILURE_MESSAGE_PL[reason];
  if (locale === "es") return AI_FAILURE_MESSAGE_ES[reason];
  if (locale === "hi") return AI_FAILURE_MESSAGE_HI[reason];
  if (locale === "ar" || locale === "zh") return AI_FAILURE_MESSAGE_EN[reason];
  return AI_FAILURE_MESSAGE_IT[reason];
}

export type RecipeRequest = {
  ingredients: string[];
  prefs: Prefs;
  count?: number;
  avoidTitles?: string[];
  pantry?: readonly string[];
  maxMissing?: number;
  now?: Date;
};
export type CallOptions = { apiKey?: string; model?: string; fetchImpl?: typeof fetch; locale?: AiLocale };

export const VISION_SYSTEM_PROMPT = `Sei l'assistente di inventario di FridgeChef. Ricevi la foto dell'interno di un frigorifero e fai l'inventario degli alimenti utilizzabili per cucinare.
# Regole
- Elenca solo ciò che vedi. Non indovinare contenitori chiusi.
- Nomi generici in italiano, minuscoli, senza marchi.
- Una sola voce per alimento. In quantity stima pratica o stringa vuota.
- confidence: alta/media/bassa.
- Escludi acqua, bibite, farmaci.`;

export const INVENTORY_SCHEMA = {
  type: "object",
  properties: {
    ingredients: {
      type: "array", maxItems: 40,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "string" },
          confidence: { type: "string", enum: ["alta", "media", "bassa"] },
        },
        required: ["name", "quantity", "confidence"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["ingredients", "notes"],
  additionalProperties: false,
};

export const RECIPE_SYSTEM_PROMPT = `Sei il cuoco di FridgeChef: cucini ogni giorno a casa in Italia. Proponi piatti veri della cucina di casa, non da ristorante.
# Compito
Ricevi ingredienti, dispensa e preferenze. Proponi ricette semplici e convincenti. Verifica dieta, tempo e ingredienti.
# Regole
1. Un protagonista e pochi comprimari (max ~5 ingredienti caratterizzanti oltre alla dispensa).
2. Ruolo chiaro: primo, secondo, contorno, piatto unico o dolce.
3. Formato pasta adatto al sugo; manteca con acqua di cottura.
4. Base aromatica coerente (aglio O cipolla O soffritto).
5. Equilibra con limone, aceto, capperi, olive, pomodoro, erbe, peperoncino.
6. Tecniche di casa: soffriggere, rosolare, mantecare, stufare, frittate, polpette.
7. Vietato: panna in carbonara; pollo come condimento pasta; formaggio su pesce; pasta sciacquata; ketchup sulla pasta.
8. Titoli onesti in italiano naturale.
9. Rispetta stagione (mese indicato).
Rispondi SOLO con JSON valido secondo lo schema richiesto.`;

export const RECIPES_SCHEMA = {
  type: "object",
  properties: {
    recipes: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          minutes: { type: "number" },
          diet: { type: "string" },
          portata: { type: "string" },
          servings: { type: "number" },
          ingredients: { type: "array", items: { type: "string" } },
          steps: { type: "array", items: { type: "string" } },
          tip: { type: "string" },
          missing: { type: "array", items: { type: "string" } },
        },
        required: ["title", "minutes", "ingredients", "steps"],
        additionalProperties: false,
      },
    },
  },
  required: ["recipes"],
  additionalProperties: false,
};

export const ORGANIZE_SYSTEM_PROMPT = `Sei un esperto di conservazione degli alimenti in frigorifero domestico. Assegna ogni alimento alla zona corretta con una breve motivazione. Rispondi SOLO con JSON valido.`;

export const ORGANIZE_SCHEMA = {
  type: "object",
  properties: {
    zones: {
      type: "array",
      items: {
        type: "object",
        properties: {
          zone: { type: "string" },
          items: { type: "array", items: { type: "object", properties: { name: { type: "string" }, reason: { type: "string" } }, required: ["name"] } },
        },
        required: ["zone", "items"],
      },
    },
  },
  required: ["zones"],
  additionalProperties: false,
};

function visionSystemPrompt(locale: AiLocale): string {
  if (locale === "it") return VISION_SYSTEM_PROMPT;
  const lang = locale === "pl" ? "Polish" : locale === "es" ? "Spanish" : locale === "hi" ? "Hindi" : locale === "ar" ? "Arabic" : locale === "zh" ? "Simplified Chinese" : "English";
  return `You are FridgeChef inventory assistant. Analyze the fridge photo and list usable foods.\nReply ONLY with valid JSON (no markdown):\n{"ingredients":[{"name":"generic lowercase name","quantity":"estimate or empty","confidence":"alta|media|bassa"}],"notes":"one short note or empty"}\nRules: list only what is visible; ingredient names and notes must be in ${lang}.`;
}

function recipeSystemPrompt(locale: AiLocale): string {
  if (locale === "it") return RECIPE_SYSTEM_PROMPT;
  const lang = locale === "pl" ? "Polish" : locale === "es" ? "Spanish" : locale === "hi" ? "Hindi" : locale === "ar" ? "Arabic" : locale === "zh" ? "Simplified Chinese" : "English";
  return `You are FridgeChef home cook. Propose realistic Italian-style home recipes from the given ingredients.\nReply ONLY with valid JSON. All user-facing text (title, description, ingredients list, steps, tip) must be in ${lang}.\nInclude practical quantities, 4–6 concrete steps, and one useful tip. Prefer simple home cooking.`;
}

function organizeSystemPrompt(locale: AiLocale): string {
  if (locale === "it") return ORGANIZE_SYSTEM_PROMPT;
  const lang = locale === "pl" ? "Polish" : locale === "es" ? "Spanish" : locale === "hi" ? "Hindi" : locale === "ar" ? "Arabic" : locale === "zh" ? "Simplified Chinese" : "English";
  return `You are a home fridge organization expert. Place each food in the correct zone with a short reason.\nReply ONLY with valid JSON. Zone labels and notes must be in ${lang}.`;
}

export function buildRecipeUserMessage(req: RecipeRequest, locale: AiLocale = "it"): string {
  const count = clampInt(req.count ?? 4, 1, 6);
  const maxMissing = clampInt(req.maxMissing ?? 2, 0, 4);
  const pantry = uniqueCaseInsensitive((req.pantry?.length ? req.pantry : DISPENSA_BASE).map((p) => cleanItem(p)));
  const ingredients = uniqueCaseInsensitive(req.ingredients.map((i) => cleanItem(i))).slice(0, 60);
  const avoid = uniqueCaseInsensitive((req.avoidTitles ?? []).map((x) => cleanItem(x))).slice(0, 30);
  const monthIt = MESI[(req.now ?? new Date()).getMonth()];
  const monthEn = ["January","February","March","April","May","June","July","August","September","October","November","December"][(req.now ?? new Date()).getMonth()];
  const servings = clampInt(req.prefs.servings, 1, 12);
  const maxMin = effectiveMaxMinutes(req.prefs);
  const isIt = locale === "it";
  const diet = req.prefs.diet === "vegan" ? (isIt ? "vegana" : "vegan") : req.prefs.diet === "vegetarian" ? (isIt ? "vegetariana" : "vegetarian") : (isIt ? "nessuna restrizione" : "no restriction");
  const course = req.prefs.course === "dessert" ? (isIt ? "solo dessert" : "desserts only") : (isIt ? "solo piatti salati" : "savory dishes only");
  const month = isIt ? monthIt : monthEn;
  return ["<ingredients>", ...(ingredients.length ? ingredients.map((i) => `- ${i}`) : [isIt ? "(nessuno)" : "(none)"]), "</ingredients>", "", "<pantry>", pantry.join(", "), "</pantry>", "", "<preferences>", isIt ? `Numero ricette: ${count}` : `Number of recipes: ${count}`, isIt ? `Porzioni: ${servings}` : `Servings: ${servings}`, isIt ? `Portata: ${course}` : `Course: ${course}`, isIt ? `Dieta: ${diet}` : `Diet: ${diet}`, isIt ? `Tempo massimo: ${maxMin} min` : `Max time: ${maxMin} min`, isIt ? `Mancanti ammessi: ${maxMissing}` : `Missing allowed: ${maxMissing}`, isIt ? `Mese: ${month}` : `Month: ${month}`, "</preferences>", "", "<avoid_titles>", ...(avoid.length ? avoid.map((x) => `- ${x}`) : [isIt ? "nessuno" : "none"]), "</avoid_titles>"].join("\n");
}

export async function detectIngredients(
  imageDataUrl: string,
  opts: CallOptions = {},
): Promise<AiResult<{ ingredients: DetectedIngredient[]; notes: string }>> {
  const model = opts.model ?? readEnv("GEMINI_VISION_MODEL") ?? DEFAULT_VISION_MODEL;
  const locale = opts.locale ?? "it";
  const system = visionSystemPrompt(locale);
  const userText = locale === "en" || locale === "ar" || locale === "zh"
    ? "Inventory the foods visible in this refrigerator photo."
    : "Fai l'inventario degli alimenti visibili in questa foto del frigorifero.";
  const result = await callGeminiJson({
    model, maxTokens: 2048, timeoutMs: 45000, reasoningEffort: "low",
    messages: [
      { role: "system", content: system },
      { role: "user", content: [
        { type: "text", text: userText },
        { type: "image_url", image_url: { url: imageDataUrl } },
      ]},
    ],
    schema: INVENTORY_SCHEMA,
  }, opts);
  if (!result.ok) return result;
  const inv = normalizeInventory(result.data);
  if (!inv.ingredients.length) return fail("nothing_found", "nessun alimento riconosciuto");
  return { ok: true, data: inv };
}

export async function generateRecipes(
  req: RecipeRequest,
  opts: CallOptions = {},
): Promise<AiResult<AiRecipe[]>> {
  const model = opts.model ?? readEnv("GEMINI_RECIPE_MODEL") ?? DEFAULT_RECIPE_MODEL;
  const locale = opts.locale ?? "it";
  const system = recipeSystemPrompt(locale);
  const user = buildRecipeUserMessage(req, locale);
  const result = await callGeminiJson({
    model, maxTokens: 4096, timeoutMs: 60000, reasoningEffort: "low",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    schema: RECIPES_SCHEMA,
  }, opts);
  if (!result.ok) return result;
  const recipes = normalizeRecipes(result.data, req);
  if (!recipes.length) return fail("no_valid_recipes", "nessuna ricetta valida");
  return { ok: true, data: recipes };
}

export type FridgeOrganization = { zones: { zone: string; items: { name: string; reason?: string }[] }[] };

export async function organizeFridge(
  ingredients: { name: string; quantity?: string; confidence?: string }[],
  opts: CallOptions = {},
): Promise<AiResult<FridgeOrganization>> {
  const list = ingredients.map((i) => i.name).filter(Boolean);
  if (!list.length) return fail("bad_input", "nessun ingrediente");
  const model = opts.model ?? readEnv("GEMINI_RECIPE_MODEL") ?? DEFAULT_RECIPE_MODEL;
  const locale = opts.locale ?? "it";
  const system = organizeSystemPrompt(locale);
  const user = locale === "en" || locale === "ar" || locale === "zh"
    ? ["Organize these foods in the refrigerator.", ...list.map((n) => `- ${n}`)].join("\n")
    : ["Organizza questi alimenti nel frigorifero.", ...list.map((n) => `- ${n}`)].join("\n");
  const result = await callGeminiJson({
    model, maxTokens: 2048, timeoutMs: 45000, reasoningEffort: "low",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    schema: ORGANIZE_SCHEMA,
  }, opts);
  if (!result.ok) return result;
  const data = result.data as FridgeOrganization;
  if (!data?.zones?.length) return fail("invalid_json", "zones mancanti");
  return { ok: true, data };
}

export function toAppIngredients(detected: DetectedIngredient[]): AppIngredient[] {
  return detected.map((d) => ({ id: slugify(d.name), name: d.name, quantity: d.quantity || undefined, confidence: d.confidence }));
}
export function ingredientLabel(i: { name: string; quantity?: string }): string {
  return i.quantity ? `${i.name} (${i.quantity})` : i.name;
}
export function effectiveMaxMinutes(prefs: Prefs): number {
  if (prefs.diet === "fast") return Math.min(prefs.maxMinutes || 15, 15);
  return prefs.maxMinutes || 60;
}
export function normalizeRecipes(raw: unknown, req: RecipeRequest): AiRecipe[] {
  const obj = raw as { recipes?: unknown[] };
  if (!obj?.recipes || !Array.isArray(obj.recipes)) return [];
  const maxMin = effectiveMaxMinutes(req.prefs);
  const out: AiRecipe[] = [];
  for (const r of obj.recipes) {
    if (!r || typeof r !== "object") continue;
    const rec = r as Record<string, unknown>;
    const title = cleanText(rec.title, 120);
    if (!title) continue;
    const minutes = clampInt(Number(rec.minutes) || 30, 5, 180);
    if (minutes > maxMin + 10) continue;
    const ingredients = stringList(rec.ingredients, 20, 80);
    const steps = stringList(rec.steps, 12, 300);
    if (!ingredients.length || !steps.length) continue;
    out.push({
      id: slugify(title),
      title,
      minutes,
      diet: (cleanText(rec.diet, 20) as Recipe["diet"]) || "omnivore",
      servings: clampInt(Number(rec.servings) || req.prefs.servings || 2, 1, 12),
      ingredients,
      steps,
      tip: cleanText(rec.tip, 200) || undefined,
      missing: stringList(rec.missing, 6, 60),
      portata: (cleanText(rec.portata, 20) as Portata) || "piatto unico",
      source: "ai",
    });
  }
  return out;
}
export function normalizeInventory(raw: unknown): { ingredients: DetectedIngredient[]; notes: string } {
  const obj = raw as { ingredients?: unknown[]; notes?: unknown };
  const ingredients: DetectedIngredient[] = [];
  if (Array.isArray(obj?.ingredients)) {
    for (const item of obj.ingredients) {
      if (!item || typeof item !== "object") continue;
      const it = item as Record<string, unknown>;
      const name = cleanItem(it.name);
      if (!name) continue;
      const conf = it.confidence;
      const confidence: Confidence = conf === "alta" || conf === "media" || conf === "bassa" ? conf : "media";
      ingredients.push({ name, quantity: cleanText(it.quantity, 40), confidence });
    }
  }
  return { ingredients, notes: cleanText(obj?.notes, 200) };
}

type GeminiCall = {
  model: string;
  maxTokens: number;
  timeoutMs: number;
  reasoningEffort: string;
  messages: unknown[];
  schema?: unknown;
};

async function callGeminiJson(call: GeminiCall, opts: CallOptions): Promise<AiResult<unknown>> {
  const apiKey = opts.apiKey ?? readEnv("GEMINI_API_KEY");
  if (!apiKey) return fail("no_key", "GEMINI_API_KEY non impostata");
  const doFetch = opts.fetchImpl ?? fetch;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), call.timeoutMs);
  try {
    const body: Record<string, unknown> = {
      model: call.model,
      max_tokens: call.maxTokens,
      messages: call.messages,
    };
    if (call.schema) {
      body.response_format = { type: "json_schema", json_schema: { name: "response", strict: true, schema: call.schema } };
    }
    const res = await doFetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    if (!res.ok) return fail(classifyHttp(res.status, text), text.slice(0, 300));
    let parsed: unknown;
    try {
      const json = JSON.parse(text);
      const content = json?.choices?.[0]?.message?.content;
      if (!content) return fail("empty", "no content");
      parsed = JSON.parse(stripFences(String(content)));
    } catch (e) {
      return fail("invalid_json", String(e));
    }
    return { ok: true, data: parsed };
  } catch (e) {
    clearTimeout(timer);
    const msg = String(e);
    if (msg.includes("abort")) return fail("timeout", msg);
    return fail("network", msg);
  }
}

function classifyHttp(status: number, body: string): AiFailure {
  if (status === 401 || status === 403) return "auth";
  if (status === 429) return "quota";
  if (status === 404) return "model_unavailable";
  return "http";
}
function fail(reason: AiFailure, detail: string): { ok: false; reason: AiFailure; detail: string } {
  return { ok: false, reason, detail };
}
function readEnv(name: string): string | undefined {
  try { return (typeof process !== "undefined" && process.env?.[name]) || undefined; } catch { return undefined; }
}
function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.round(value)));
}
function cleanText(value: unknown, maxLength: number): string {
  if (value == null) return "";
  return String(value).replace(/\s+/g, " ").trim().slice(0, maxLength);
}
function cleanItem(value: unknown): string {
  return cleanText(value, 80).toLowerCase();
}
function stripFences(content: string): string {
  let s = content.trim();
  if (s.startsWith("```")) {
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  }
  return s.trim();
}
function stringList(value: unknown, maxItems: number, maxLength: number): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((v) => cleanText(v, maxLength)).filter(Boolean).slice(0, maxItems);
}
function uniqueCaseInsensitive(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const k = item.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}
function slugify(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "ricetta";
}
