# FridgeChef

<p align="center">
  <img src="docs/fridgechef-hero.png" alt="FridgeChef — robot chef in a neon kitchen" width="720" />
</p>

> **UPDATE — UPDATED VERSION**  
> Multilingual UI (**IT · EN · PL · ES · HI**), flag language picker, localized classic cookbook, chef prompts, and photo → recipe flow. Clone or pull `main` for the latest release.  
> **Try it now:** [https://frigo-chef-omega.vercel.app](https://frigo-chef-omega.vercel.app/)

Photograph the inside of your fridge. Confirm the ingredients. Get recipes you can cook tonight — written in the style of an Italian home kitchen — or a shelf-by-shelf plan to store the food correctly.

**FridgeChef is the first app built with a real Italian chef** to generate everyday recipes in an Italian cooking style: clear steps, realistic times, pantry-aware dishes, and the taste of home rather than restaurant showpieces.

Snap a photo of your fridge and get tailored recipes. 3D grocery-style UI, navy glass, and lime accents.

For people who open the fridge, freeze for ten seconds, and still don’t know what to make.

[![Node](https://img.shields.io/badge/node-18%2B-blue)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](./LICENSE)
[![Languages](https://img.shields.io/badge/UI-IT%20%7C%20EN%20%7C%20PL%20%7C%20ES%20%7C%20HI-informational)](#languages)
[![Live](https://img.shields.io/badge/live-frigo--chef--omega.vercel.app-success)](https://frigo-chef-omega.vercel.app/)

---

## Use it now

**Live app:** [https://frigo-chef-omega.vercel.app](https://frigo-chef-omega.vercel.app/)

Open that link on your phone or desktop to use FridgeChef immediately (photo → recipes, classic cookbook, fridge organization, IT / EN / PL / ES / HI).

> Note: `https://frigo-chef.vercel.app` is a **different** public project (French “Cuisine Intelligente”). This app’s production URL is **https://frigo-chef-omega.vercel.app**.

### Install on your phone (PWA)

1. Open **[https://frigo-chef-omega.vercel.app](https://frigo-chef-omega.vercel.app/)** in **Chrome** (Android) or **Safari** (iOS).
2. **Android:** browser menu → **Install app** / **Add to Home screen**.
3. **iOS (Safari):** Share → **Add to Home Screen**.

Manifest + service worker enable standalone mode. AI features need network and `GEMINI_API_KEY` on the server.

## Languages

The app UI, AI chef prompts, error messages, and the classic cookbook text can be switched from the header language control (flag + fixed list — no free typing):

| Flag | Language |
|------|----------|
| 🇮🇹 | Italiano |
| 🇬🇧 | English |
| 🇵🇱 | Polski |
| 🇪🇸 | Español |
| 🇮🇳 | हिन्दी (Hindi) |

Choice is saved in the browser (`localStorage`).

---

## Quick start

```bash
git clone https://github.com/Dariolex/FridgeChef.git
cd FridgeChef
npm install
export GEMINI_API_KEY=your_key_from_aistudio
npm run dev
```

Open [http://localhost:8080](http://localhost:8080).

**Expected result:** the app loads, the language control shows the current flag (🇮🇹 / 🇬🇧 / 🇵🇱 / 🇪🇸), and the home screen offers **Take a photo** (or type ingredients by hand).

Get a free Gemini key (type **auth**) from [Google AI Studio](https://aistudio.google.com/apikey).  
Without a key, photo recognition is off — manual ingredients and the classic cookbook still work.

---

## Why this project

Most “recipe AI” tools ask you to type a list and answer in a generic tone. FridgeChef was shaped with **a real Italian chef’s approach**: what to do with what is already in the fridge, how a home cook in Italy would actually cook it, and how to keep steps practical.

The flow starts from the **fridge photo**, lets you **confirm chips**, then branches into three actions:

1. **Create recipes** (Gemini, prompted for Italian-style home cooking)  
2. **Classic cookbook** (~120 home-style recipes, shown in the active UI language)  
3. **Organize fridge** (zone-by-zone placement with reasons)

If the AI call fails, the app falls back to the built-in cookbook instead of a blank screen.  
Shopping list and cooking history stay in the browser — no account required for the core flow.

**What it does not do:** meal-plan a whole week, sync a smart fridge, or replace a full nutrition database.

---

## Real use

### 1. Photo → recipes

1. Tap **Take a photo** and shoot the open fridge.  
2. Toggle ingredient chips on/off; add missing ones.  
3. Tap **Create recipes** (or **Classic cookbook** / **Organize fridge**).

AI returns structured recipes (title, minutes, ingredients, steps, tip, optional missing items for the shopping list).

### 2. Manual ingredients only

```text
eggs, zucchini, cooked ham
```

Type them on the home screen → **Go** → same three actions as after a photo.

### 3. Classic cookbook by category

Open the **Recipes** tab. Expand categories (primi, secondi, eggs, sides, dessert).  
Recipe text follows the selected language (IT / EN / PL / ES / HI).

### 4. Diet and time filters

- Diet: Any, Vegetarian, Vegan, or Fast (≤15 minutes)  
- Desserts-only mode  
- Servings 1–8  

---

## Full installation

**Prerequisites**

- Node.js **18+** (LTS recommended)  
- npm (comes with Node)  
- Optional: Gemini API key for vision + recipe generation  

**macOS / Linux / Windows (terminal)**

```bash
git clone https://github.com/Dariolex/FridgeChef.git
cd FridgeChef
npm install
```

**Run locally**

```bash
export GEMINI_API_KEY=...   # Windows PowerShell: $env:GEMINI_API_KEY="..."
npm run dev
```

Server listens on **0.0.0.0:8080**.

**Production build**

```bash
npm run build
npm run preview
```

**Checks used in development**

```bash
npm run typecheck
npm run lint
npm test
```

---

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `GEMINI_API_KEY` | _(empty)_ | Google AI Studio **auth** key. Required for photo inventory, AI recipes, and fridge organization. |
| `GEMINI_VISION_MODEL` | `gemini-3.5-flash-lite` | Model for reading foods from the photo. |
| `GEMINI_RECIPE_MODEL` | `gemini-3.5-flash` | Model for recipes and fridge organization. |

API calls use Gemini’s OpenAI-compatible endpoint (`generativelanguage.googleapis.com`).

---

## Troubleshooting

| Symptom | What to try |
|---------|-------------|
| “AI is not configured” / `no_key` | Export `GEMINI_API_KEY` in the same shell that runs `npm run dev`, then restart the dev server. |
| Auth / invalid key | Create a new **auth** key in AI Studio; restricted keys may not match what the app expects. |
| Quota / rate limit | Free-tier limits; wait and retry, or use **Classic cookbook** / manual entry. |
| No foods detected in the photo | Better light, open door fully, or add ingredients as chips by hand. |
| Port 8080 already in use | Stop the other process, or change the port in the `dev` script in `package.json`. |

---

## Contributing and license

Issues and pull requests are welcome on GitHub. Prefer small, focused changes (UI, cookbook recipes, i18n, tests under `src/lib/recipe-ai.test.ts`).

License: **MIT** — see [`LICENSE`](./LICENSE).

---


## IP logging (Vercel)

On each new browser session the app records the client IP (`x-forwarded-for` / `x-real-ip`), user agent, path and locale.

1. **Always** a structured line in **Vercel Runtime Logs**: `[ip_log] {"ip":"…","path":"…",…}`
2. **Also** a row in Postgres table `ip_logs` when **`DATABASE_URL`** (Neon) is set on the Vercel project.

Without `DATABASE_URL`, serverless cannot persist PGLite files — only runtime logs are kept.

- At most **one DB row per IP per hour** (dedupe).
- **Geolocation** (country, region, city, lat/lon, org) via ipwho.is with geojs.io fallback; stored on `ip_logs` and logged as `[ip_geo]`.
- Hosting/cloud IPs and bot user-agents are not written to the table.
- Not shown in the product UI.

## Stack (for contributors)

React 19 · TanStack Start / Router · Tailwind CSS v4 · Google Gemini (vision + text) · localStorage for shopping list and last 30 cooked dishes · PWA-ready static assets under `public/` · UI and classic cookbook localized for **Italian, English, Polish, Spanish, and Hindi**.
