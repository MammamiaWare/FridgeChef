/**
 * FridgeChef · Ricette create dall'AI per un palato italiano
 *
 * Due chiamate separate a Gemini (endpoint OpenAI-compatibile):
 *   1) detectIngredients() → foto del frigo → inventario (l'utente lo conferma o corregge)
 *   2) generateRecipes()   → ingredienti confermati + preferenze → ricette
 *
 * Nessuna funzione fallisce in silenzio: in caso di problemi restituisce
 * { ok: false, reason, detail }, così la UI può usare il ricettario locale DICHIARANDOLO.
 *
 * Variabili d'ambiente (in locale .env, su Vercel: Settings → Environment Variables):
 *   GEMINI_API_KEY        chiave di tipo "auth" creata in Google AI Studio
 *   GEMINI_VISION_MODEL   facoltativa, default gemini-3.5-flash-lite
 *   GEMINI_RECIPE_MODEL   facoltativa, default gemini-3.5-flash
 */
import type { Ingredient, Prefs, Recipe } from "./types";

// ─────────────────────────────────────────────────────────────────────────────
// Configurazione
// ─────────────────────────────────────────────────────────────────────────────

const GEMINI_ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";

/** Modelli stabili con data di dismissione lontana; si cambiano da env senza toccare il codice. */
export const DEFAULT_VISION_MODEL = "gemini-3.5-flash-lite";
export const DEFAULT_RECIPE_MODEL = "gemini-3.5-flash";

/** Dispensa che si assume sempre presente: non finisce mai tra gli ingredienti "mancanti". */
export const DISPENSA_BASE: readonly string[] = [
  "sale",
  "pepe nero",
  "olio extravergine d'oliva",
  "aglio",
  "pasta secca",
  "riso",
  "farina",
  "zucchero",
  "aceto di vino",
  "origano secco",
  "peperoncino secco",
];

const MESI = [
  "gennaio",
  "febbraio",
  "marzo",
  "aprile",
  "maggio",
  "giugno",
  "luglio",
  "agosto",
  "settembre",
  "ottobre",
  "novembre",
  "dicembre",
];

// ─────────────────────────────────────────────────────────────────────────────
// Tipi
// ─────────────────────────────────────────────────────────────────────────────

export type Portata = "primo" | "secondo" | "contorno" | "piatto unico" | "dolce";
export type Confidence = "alta" | "media" | "bassa";

export type DetectedIngredient = { name: string; quantity: string; confidence: Confidence };

/** Ingrediente per la UI: compatibile con Ingredient, con quantità e affidabilità facoltative. */
export type AppIngredient = Ingredient & { quantity?: string; confidence?: Confidence };

/** Ricetta AI: compatibile con Recipe, più portata e origine (per etichettarla in UI). */
export type AiRecipe = Recipe & { portata: Portata; source: "ai" };

export type AiLocale = "it" | "en" | "pl" | "es" | "hi" | "ar" | "zh";

export type AiFailure =
  | "no_key"
  | "auth"
  | "quota"
  | "model_unavailable"
  | "http"
  | "timeout"
  | "network"
  | "truncated"
  | "empty"
  | "invalid_json"
  | "bad_input"
  | "nothing_found"
  | "no_valid_recipes";

export type AiResult<T> = { ok: true; data: T } | { ok: false; reason: AiFailure; detail: string };

/** Messaggi pronti per l'utente. Il campo `detail` va solo nei log, mai a schermo. */
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
  no_valid_recipes:
    "Nessuna ricetta rispetta insieme dieta, tempo e ingredienti: prova ad allargare i filtri.",
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
  no_valid_recipes:
    "No recipe matches diet, time and ingredients together. Try relaxing the filters.",
};

/** @deprecated Prefer aiFailureMessage(locale, reason) */
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
  no_valid_recipes:
    "Żaden przepis nie spełnia diety, czasu i składników. Poluzuj filtry.",
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
  no_valid_recipes:
    "Ninguna receta cumple a la vez dieta, tiempo e ingredientes. Amplía los filtros.",
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
  no_valid_recipes:
    "कोई रेसिपी आहार, समय और सामग्री एक साथ पूरा नहीं करती। फ़िल्टर ढीले करें।",
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

// NOTE: This is a temporary restore stub. Full file push follows.
export async function detectIngredients(): Promise<AiResult<never>> {
  return { ok: false, reason: "no_key", detail: "stub" };
}
export async function generateRecipes(): Promise<AiResult<never>> {
  return { ok: false, reason: "no_key", detail: "stub" };
}
