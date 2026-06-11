# WinBig — OLG Lottery Number Predictor

> Desktop app that scrapes historical OLG lottery results, runs AI-powered statistical analysis, and predicts likely winning numbers for Lotto 6/49 and Lotto Max.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Tech Stack](#tech-stack)
3. [Project Structure](#project-structure)
4. [Data Pipeline](#data-pipeline)
5. [Scraper — How Draw Data Is Collected](#scraper)
6. [AI Prediction Engine](#ai-prediction-engine)
7. [Statistics Algorithms](#statistics-algorithms)
8. [Endless Training Mode](#endless-training-mode)
9. [JSON Parsing & Repair](#json-parsing--repair)
10. [Database Schema](#database-schema)
11. [IPC Communication](#ipc-communication)
12. [Settings & Configuration](#settings--configuration)
13. [UI Architecture](#ui-architecture)
14. [Dev / Build / Package](#dev--build--package)

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    ELECTRON MAIN PROCESS                      │
│                                                              │
│  ┌──────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  Scraper  │  │  AI Analyzer  │  │  Endless Runner      │   │
│  │ (Browser- │  │ (OpenAI SDK)  │  │  (scrape → analyze   │   │
│  │  Window)  │  │               │  │   → refine → repeat) │   │
│  └────┬─────┘  └──────┬───────┘  └──────────┬───────────┘   │
│       │               │                     │               │
│  ┌────▼───────────────▼─────────────────────▼──────────┐    │
│  │              SQLite Database (sql.js)                │    │
│  │         draws table  │  jobs table                   │    │
│  └─────────────────────────────────────────────────────┘    │
│       │                                                     │
│  ┌────▼──────────────┐    ┌──────────────────┐              │
│  │   IPC Handlers    │    │    Settings      │              │
│  │ (handle/invoke)   │    │ (JSON file on    │              │
│  │                   │    │  disk)           │              │
│  └────────┬─────────┘    └──────────────────┘              │
│           │                                                 │
└───────────┼─────────────────────────────────────────────────┘
            │  contextBridge (preload.ts)
┌───────────▼─────────────────────────────────────────────────┐
│                  NEXT.JS RENDERER (Turbopack)                │
│                                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌────────────┐  │
│  │  Home    │  │ Generate │  │ Settings │  │  History    │  │
│  │  Page    │  │  Page    │  │  Page    │  │  Page       │  │
│  └──────────┘  └──────────┘  └──────────┘  └────────────┘  │
│                                                              │
│  Components: NumberReveal · NumberBall · ProgressIndicator  │
│              NavBar · Logo · LotteryCard · SwipeTransition   │
│                                                              │
│  State: AppContext (React Context)                           │
│  Styling: CSS custom properties + Framer Motion animations  │
└──────────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Desktop shell | Electron 33 |
| Frontend | Next.js 16 (Turbopack, App Router), React 19 |
| Animations | Framer Motion 11 |
| AI SDK | OpenAI npm client (compatible with LM Studio, OpenAI, DeepSeek, any OpenAI-compatible API) |
| Database | SQLite via sql.js (in-process, no external server) |
| Scraper | Electron `BrowserWindow` (renders OLG's SPA, extracts DOM text) |
| Language | TypeScript 5.7 throughout |
| Packaging | electron-builder (NSIS installer for Windows) |

---

## Project Structure

```
win-big/
├── electron/                   # Electron main process
│   ├── main.ts                 # App entry: creates window, starts Next server
│   ├── preload.ts              # contextBridge API + shared types
│   ├── ipc-handlers.ts         # All IPC channel handlers
│   ├── settings.ts             # Load/save settings JSON file
│   ├── database.ts             # SQLite wrapper (sql.js)
│   ├── endless-runner.ts       # Self-training loop controller
│   ├── test-ai.ts              # Standalone AI test script
│   ├── renderer.d.ts           # Type declarations for renderer
│   ├── tsconfig.json           # Electron TypeScript config
│   ├── ai/
│   │   ├── index.ts            # Barrel exports
│   │   ├── analyzer.ts         # Prediction pipeline orchestrator
│   │   ├── prompts.ts          # Prompt templates (649, Max, refinement)
│   │   ├── provider.ts         # Statistics computation engine
│   │   └── test-connection.ts  # AI connectivity test
│   └── scraper/
│       ├── olg-scraper.ts      # OLG lottery results scraper
│       ├── scraper-preload.ts  # Preload script for scraper windows
│       └── types.ts            # Scraper-specific types
├── src/                        # Next.js renderer
│   ├── app/
│   │   ├── layout.tsx          # Root layout (dark theme, providers)
│   │   ├── page.tsx            # Home page — lottery selector
│   │   ├── generate/
│   │   │   └── page.tsx        # Generate page — scrape + predictions UI
│   │   ├── settings/
│   │   │   └── page.tsx        # Settings page
│   │   ├── history/
│   │   │   └── page.tsx        # Prediction history page
│   │   └── api/
│   │       └── lmstudio-models/
│   │           └── route.ts    # Proxy for LM Studio model list
│   ├── components/
│   │   ├── NavBar.tsx          # Bottom tab navigation
│   │   ├── NumberReveal.tsx    # Animated number reveal
│   │   ├── NumberBall.tsx      # Individual number sphere
│   │   ├── ProgressIndicator.tsx # Scrape progress bar
│   │   ├── LotteryCard.tsx     # Lottery selection card
│   │   ├── Logo.tsx            # App logo
│   │   └── SwipeTransition.tsx # Page transition wrapper
│   ├── contexts/
│   │   └── AppContext.tsx      # Global state provider
│   └── lib/
│       ├── types.ts            # Shared TypeScript types
│       └── ipc.ts              # IPC wrapper functions
├── public/                     # Static assets (icons, images)
├── package.json
├── next.config.ts
└── tsconfig.json
```

---

## Data Pipeline

The prediction pipeline has two modes: **Single Run** and **Endless Training**.

### Single Run

```
[User clicks Generate]
       │
       ▼
┌─────────────────┐
│  Phase 1: Scrape │──► BrowserWindow pool scrapes OLG past-results pages
└────────┬────────┘     Dates: last N years of draw dates (Wed/Sat or Tue/Fri)
         │              Each date: render page → extract DOM text → parse JSON
         │              Results stored in SQLite draws table
         ▼
┌─────────────────┐
│  Phase 2: Analyze│──► Load all draws from DB
└────────┬────────┘     Compute frequency statistics
         │              Build prompt with stats embedded
         │              Send to LLM (LM Studio / OpenAI)
         │              Stream response to UI in real-time
         │              Parse & validate JSON
         │              Auto-save to jobs history
         ▼
┌─────────────────┐
│  Phase 3: Display│──► Animated number reveal
└─────────────────┘     Confidence bar
                        Reasoning text
                        Run history panel
```

### Endless Training

```
[User clicks Endless Mode]
       │
       ▼
┌──────────────────────────────────────────────────────┐
│  Run #1: Scrape (full) → Analyze → Confidence 65%    │
│  Run #2:              → Refine  → Confidence 72%    │  ← Multi-turn with
│  Run #3:              → Refine  → Confidence 84%    │     previous prediction
│  Run #N:              → Refine  → Confidence 91% ✓  │     as context
│  Run #N+1:            → Refine  → Confidence 93%    │  ← Keeps going past target!
│  ...                                                 │
└──────────────────────────────────────────────────────┘
```

- Scraping happens **only on Run #1**, subsequent runs reuse existing DB data
- Each run after #1 is a **multi-turn LLM conversation**: the previous prediction is fed back as `assistant` + a refinement `user` message asking for higher confidence
- Temperature drops from `0.3` to `0.25` during refinement for more precise output
- Once the target confidence % is reached, a "complete" event is emitted **but training continues** — the user can stop manually
- Supports pause/resume/stop at any point via `AbortController`

---

## Scraper — How Draw Data Is Collected

### Why BrowserWindow?

The OLG website is a **Single Page Application (SPA)** — a plain `fetch()` returns empty HTML shells. The scraper uses Electron's `BrowserWindow` to fully render each page, then extracts DOM text via a preload script.

### Scrape Algorithm

```
generateDrawDates(lottery, yearsBack)
  │
  ├── 649 draws: Wednesday & Saturday
  └── Max draws: Tuesday & Friday
  
  Generates all draw dates from (today - yearsBack) to today.
  
skipExisting = DB count for this lottery
neededDates = generatedDates.slice(skipExisting)

For each batch of `concurrency` dates (default 6, configurable 1-24):
  ├── Stagger each BrowserWindow.loadURL() by 800ms × position
  │   (prevents OLG from rate-limiting the burst)
  ├── Wait for page to render
  ├── Send 'scraper:extract' IPC to preload script
  ├── Preload extracts DOM text content
  ├── Parse text with regex (parse649Text / parseMaxText)
  ├── Destroy window
  └── Collect ParsedDraw objects

INSERT OR IGNORE all new draws into SQLite
```

### Anti-Detection Measures

- **Chrome user-agent spoof**: `Mozilla/5.0 ... Chrome/131.0.0.0 Safari/537.36`
- **Staggered loading**: 800ms gap between each concurrent window's `loadURL()`
- **Configurable concurrency**: default 6, can be lowered to 1 to be extra stealthy

### Auto-Repair

If existing draws have `encore === '0000000'` (a known broken fallback), the scraper auto-clears all draws for that lottery type and re-scrapes everything fresh.

---

## AI Prediction Engine

### `analyze()` — The Orchestrator

```typescript
analyze(
  lotteryType: '649' | 'max',
  draws: Draw[],
  settings: AppSettings,
  onProgress?: (msg: string) => void,    // real-time streaming to UI
  signal?: AbortSignal,                   // cancellation support
  previousPrediction?: { ... },           // for refinement (endless mode)
): Promise<Prediction>
```

**Pipeline:**

1. **Statistics Computation** — `computeStatistics(draws, lotteryType)` computes frequency tables
2. **Prompt Building** — `build649Prompt(stats)` or `buildMaxPrompt(stats)` injects stats into a structured prompt
3. **Multi-turn (optional)** — If `previousPrediction` is provided, appends assistant/user turn asking for refinement
4. **LLM Call** — OpenAI-compatible streaming chat completion
   - Model: from settings (LM Studio local model or OpenAI/DeepSeek)
   - Temperature: `0.3` (single run) or `0.25` (refinement — more deterministic)
   - Max tokens: 8192
   - Timeout: 120s
   - Retry: up to 2 attempts on parse failure
5. **Stream Handling** — Handles Qwen-style `reasoning_content` + `content` dual-stream; concatenates both for live UI display but parses JSON only from `content`
6. **JSON Parsing** — `parseResponse()` with robust repair (see below)
7. **Validation** — Checks number count, range, uniqueness, bonus validity, encore format, gold ball format

### Prompt Design

Each prompt includes full statistical context embedded as text:

| Statistic | Description |
|---|---|
| **Most frequent main numbers** (top 15) | Numbers that appear most often in history |
| **Least frequent main numbers** (bottom 15) | Numbers that appear least often |
| **Most frequent bonus numbers** (top 10) | Bonus numbers sorted by frequency |
| **Coldest numbers** (top 10) | Numbers with the highest days-since-last-appearance |
| **Hot streaks** (≥3 consecutive draws) | Numbers appearing in 3+ consecutive recent draws |
| **Encore digit frequency** | Per-position (7 positions) top 3 most common digits |
| **Recent draws** (last 10) | Full draw data for pattern recognition |
| **Gold Ball frequency** (649 only) | 8-digit ticket number suffix trends |

---

## Statistics Algorithms

All statistics are computed in `computeStatistics()` in `electron/ai/provider.ts`.

### Number Frequency
```
For each number 1..maxNumber:
  count = COUNT(draws WHERE number IN draw.numbers)
```
Simple occurrence counting across all historical draws, processed chronologically.

### Days Since Last Appearance
```
For each number 1..maxNumber:
  lastSeenIndex = index of most recent draw containing this number
  daysSince = totalDraws - lastSeenIndex - 1
  (if never seen: daysSince = totalDraws × 3)
```
Uses draw index position (not actual calendar days) as the unit. Numbers unseen receive a penalty multiplier.

### Hot Streaks
```
For each number 1..maxNumber:
  streak = 0
  For draw in reversed(sorted draws):
    if number in draw.numbers: streak++
    else: break
```
Counts consecutive appearances starting from the most recent draw backward. Highlights "momentum" numbers.

### Encore Digit Frequency (Per-Position)
```
For each of 7 positions:
  For each draw:
    digit = draw.encore[position]
    positionFrequency[position][digit]++
```
Tracks which digits (0-9) appear most often at each of the 7 positions in the Encore number. This is a **positional** analysis — it finds `Position 1: 9, 8, 7`, `Position 2: 8, 5, 1`, etc.

### Gold Ball Frequency (649 only)
```
For each unique goldBall string (NNNNNNNN-NN):
  count occurrences
```
Simple frequency count of all Gold Ball ticket number suffixes.

---

## Endless Training Mode

The `EndlessRunner` class (`electron/endless-runner.ts`) implements a self-training loop:

```
┌─────────────────────────────────────────────────────┐
│                    START                             │
│  abortController = new AbortController()             │
│  hasReportedComplete = false                         │
│  lastPrediction = undefined                          │
│  confidenceTarget = settings.endlessConfidenceTarget │
│                                                      │
│  LOOP:                                               │
│    ├── Pause gate (checks isPaused flag)             │
│    ├── runNumber++                                    │
│    ├── If runNumber === 1: scrapeResults(...)        │
│    ├── getDraws(lotteryType)                         │
│    ├── analyze(..., lastPrediction)  ◄── refinement  │
│    ├── lastPrediction = prediction                   │
│    ├── saveJob(...)                                  │
│    ├── If confidence >= target && !hasReported:      │
│    │     emit 'complete', hasReportedComplete = true │
│    │     CONTINUE (don't break)                      │
│    ├── emit 'running' with prediction                │
│    └── sleep(2000ms)                                 │
│                                                      │
│  On error: emit error, continue to next run          │
│  On abort/stop: break loop, cleanup                  │
└─────────────────────────────────────────────────────┘
```

**Key behaviors:**
- **Scrape only on run #1**: Subsequent runs reuse existing database data
- **Multi-turn refinement**: Each run feeds the previous prediction back to the LLM as context
- **Keep-going past target**: Once target is hit, it emits a one-time "complete" event but the loop continues so confidence can go even higher
- **2-second cooldown**: Brief pause between runs to avoid hammering the LLM
- **Fault-tolerant**: Individual run errors don't stop the loop — it continues to the next iteration
- **Pause/Resume**: Uses a promise-based gate — clicking pause sets a flag, the loop awaits a resolver that fires on resume
- **Cancellation**: `AbortController` propagates through scraper and analyzer; `isStopped` flag for graceful exit

---

## JSON Parsing & Repair

LLMs sometimes return malformed JSON (truncation, unclosed braces, markdown wrapping). The `parseResponse()` function in `analyzer.ts` handles this robustly:

### Extraction Strategies (tried in order)

1. **Markdown code fences**: Extract from ` ```json ... ``` `
2. **Brace blocks**: Find all `{...}` blocks, try from **last to first** (Qwen puts reasoning with `{set}` early, answer JSON at end)
3. **Raw string**: Fallback to the full raw text

### Repair Steps

| Issue | Fix |
|---|---|
| Unmatched quote | Append `"` if quote count is odd |
| Trailing comma | Remove `,` at end of string |
| Unclosed arrays | Append `]` for each unmatched `[` |
| Unclosed objects | If last token is `"key":`, append `null` first; then append `}` for each unmatched `{` |

After repair, each candidate is `JSON.parse()`d and validated:
- Main numbers: correct count (6 for 649, 7 for Max), range `1..maxNumber`, no duplicates
- Bonus: valid number, distinct from main numbers
- Encore: exactly 7 digits
- Gold Ball: `NNNNNNNN-NN` format (non-fatal if invalid)

---

## Database Schema

**SQLite** via `sql.js` — runs entirely in-process, no external server needed.

### `draws` table
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `lottery` | TEXT | `'649'` or `'max'` |
| `draw_date` | TEXT | ISO date `YYYY-MM-DD` |
| `numbers` | TEXT | JSON array `[12, 34, 5, ...]` |
| `bonus` | INTEGER | Bonus number |
| `encore` | TEXT | 7-digit string |
| `gold_ball` | TEXT | `NNNNNNNN-NN` or NULL |
| `created_at` | TEXT | `datetime('now')` |

Unique index on `(lottery, draw_date)` prevents duplicate scrapes.

### `jobs` table
| Column | Type | Description |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `lottery` | TEXT | `'649'` or `'max'` |
| `draw_count` | INTEGER | How many draws were analyzed |
| `prediction` | TEXT | JSON-serialized Prediction object |
| `created_at` | TEXT | `datetime('now')` |

### Persistence
- WAL mode for concurrent read/write safety
- On-disk file: `{userData}/winbig-draws.db`
- Auto-persisted after every write via `db.export()` → `fs.writeFileSync()`

---

## IPC Communication

All renderer ↔ main process communication uses Electron's `ipcRenderer.invoke` / `ipcMain.handle` pattern with `contextBridge` for security.

### Channels

| Channel | Direction | Purpose |
|---|---|---|
| `scrape-and-analyze` | invoke | Start single-run scrape + analyze |
| `cancel-job` | invoke | Cancel running job |
| `get-draw-history` | invoke | Get draw history from DB |
| `get-settings` | invoke | Load settings from disk |
| `save-settings` | invoke | Save settings to disk |
| `test-ai-connection` | invoke | Test LLM connectivity |
| `fetch-lmstudio-models` | invoke | List models from LM Studio API |
| `clear-draws` | invoke | Clear draws for a lottery type |
| `clear-all-data` | invoke | Clear entire database |
| `get-job-history` | invoke | Get prediction job history |
| `get-latest-draw-date` | invoke | Get newest draw date in DB |
| `get-db-stats` | invoke | Get draw/job counts |
| `scraping-progress` | send → listener | Real-time scrape progress updates |
| `analysis-progress` | send → listener | Real-time LLM streaming output |
| `endless:start` | invoke | Start endless training mode |
| `endless:pause` | invoke | Pause endless training |
| `endless:resume` | invoke | Resume endless training |
| `endless:stop` | invoke | Stop endless training |
| `endless:event` | send → listener | Endless run progress updates |

### Security Model

- `contextIsolation: true` — renderer cannot access Node.js or Electron APIs directly
- `nodeIntegration: false` — no `require()` in renderer
- All IPC goes through `contextBridge.exposeInMainWorld('winbigAPI', api)`
- The renderer uses typed wrappers in `src/lib/ipc.ts` (with fallback defaults for when running outside Electron)

---

## Settings & Configuration

Stored as JSON at `{userData}/winbig-settings.json`.

| Setting | Type | Default | Description |
|---|---|---|---|
| `aiProvider` | `'lmstudio' \| 'openai'` | `'lmstudio'` | Which LLM provider to use |
| `scraperConcurrency` | `number` | `6` | How many simultaneous BrowserWindows for scraping (1-24) |
| `scrapeDepthYears` | `number` | `2` | How many years of history to scrape (1-5) |
| `endlessConfidenceTarget` | `number` | `0.9` | Confidence % target for endless mode (0.50-0.99) |
| `lmstudio.baseUrl` | `string` | `http://192.168.0.13:1234/v1` | LM Studio API endpoint |
| `lmstudio.model` | `string` | `''` | Model name (auto-detected if empty) |
| `openai.baseUrl` | `string` | `https://api.openai.com/v1` | OpenAI-compatible endpoint |
| `openai.apiKey` | `string` | `''` | API key |
| `openai.model` | `string` | `gpt-4o` | Model identifier |

Settings are edited via the in-app Settings page (sliders + text inputs) and saved immediately.

---

## UI Architecture

### Pages (Next.js App Router)

| Route | Page | Purpose |
|---|---|---|
| `/` | Home | Lottery type selector (649 / Max cards), DB status |
| `/generate?lottery=649` | Generate | Main prediction page: scrape, AI analysis, results, endless mode controls |
| `/settings` | Settings | AI provider config, scraper speed, history depth, confidence target, DB stats, danger zone |
| `/history` | History | Past prediction jobs with details |

### Global State (`AppContext`)

```typescript
{
  lottery: '649' | 'max',
  prediction: Prediction | null,
  isGenerating: boolean,
  isAnalysisPhase: boolean,
  activeJobType: 'single' | 'endless' | null,
  scrapingProgress: ScrapingProgress | null,
  analysisText: string | null,
  error: string | null,
  settings: AppSettings | null,
}
```

### Animations

All UI animations use **Framer Motion**:
- **NumberReveal**: Staggered entrance with spring physics for predicted numbers
- **NumberBall**: Individual number sphere with scale/rotate transitions
- **ProgressIndicator**: Smooth width transition on scrape progress bar
- **SwipeTransition**: Page navigation transitions
- **Logo**: Gentle pulse animation on home page

### Theming

Dark theme via CSS custom properties on `:root`:
- `--text-primary`, `--text-secondary`, `--accent`, `--accent-gold`, `--success`, `--error`
- `--bg-card`, `--bg-secondary`, `--border`
- Glass-morphism effects on cards and buttons

---

## Dev / Build / Package

### Development

```bash
npm run dev:electron
```

This runs:
1. `tsc -p electron/tsconfig.json` — compiles Electron TypeScript to `dist-electron/`
2. `next dev -p 6049` — starts Next.js with Turbopack
3. `wait-on http://localhost:6049 && electron .` — waits for Next.js, then launches Electron

### Build for Production

```bash
npm run build        # Build both Next.js and Electron TS
npm run package      # Package into Windows NSIS installer
```

Electron-builder output goes to `release/`.

### Standalone AI Test

```bash
npx ts-node -P electron/tsconfig.json electron/test-ai.ts
```

Runs the analyzer with hardcoded sample draw data — useful for testing LLM connectivity without launching the full app.
