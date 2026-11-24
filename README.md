# Project Plan Builder

**Project Plan Builder** is a full-stack TypeScript and React workspace for turning a plain-language project goal into a structured, deterministically scheduled delivery plan. It combines server-side Gemini task decomposition with a pure TypeScript working-day scheduler, interactive task and dependency editing, a Gantt timeline, browser persistence, and Markdown export.

## Key Features

- **Structured Plan Generation**: Calls Gemini on the server (`POST /api/generate-plan`) with a strict JSON response schema to produce a title, one-sentence success summary, milestones with observable completion criteria, verb-led tasks with whole-number person-day estimates, planning assumptions, and external dependencies with confirmation questions.
- **Deterministic Working-Day Scheduler**: Computes start dates, inclusive finish dates, milestone checkpoints, total effort, and deadline status using DST-safe UTC calendar arithmetic (Monday–Friday, automatic weekend start rollover, full team availability, no public holidays, and no specialist constraints).
- **Interactive Views**:
  - **Overview**: Goal, success summary, projected finish vs. requested deadline, deadline status with specific decisions to explore when late, milestones, assumptions, and external dependencies.
  - **Tasks**: Horizontally scrollable task schedule table with mouse and keyboard row selection plus a live edit panel (name, deliverable, effort estimate, and named checkbox prerequisite picker with cycle detection).
  - **Timeline**: Horizontally scrollable Gantt chart with sticky task labels, calendar dates, weekend shading, overlapping task bars, milestone checkpoints, and a requested deadline marker.
- **Local Persistence & Export**: Saves inputs, generated plan, and local edits to `localStorage`, restores deterministically on refresh, asks for confirmation before overwriting edited plans, and exports the latest plan via **Copy Markdown** or **Download .md**.

---

## Prerequisites

- **Node.js 22+** (required for native TypeScript execution in `npm start` via `node server.ts`)
- **npm**
- A **Gemini API key** from [Google AI Studio](https://aistudio.google.com/)

---

## Local Development Setup

1. **Clone the repository**
   ```bash
   git clone <your-repository-url>
   cd <your-repository-directory>
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Create your local environment file**
   ```bash
   cp .env.example .env
   ```
   Then edit `.env` and add your `GEMINI_API_KEY` (see [Configuring `GEMINI_API_KEY`](#configuring-gemini_api_key) below).

4. **Start the development server**
   ```bash
   npm run dev
   ```
   The Express + Vite middleware server listens on `http://localhost:3000`.

5. **Run tests and checks**
   ```bash
   npm test        # Deterministic scheduler, validation, export, persistence, and server tests
   npm run lint    # TypeScript typecheck (tsc --noEmit)
   npm run build   # Production frontend bundle (outputs to dist/)
   ```

---

## Configuring `GEMINI_API_KEY`

The server reads `GEMINI_API_KEY` from the environment via `dotenv` in `server.ts` and uses it exclusively on the server-side `/api/generate-plan` route—the key is never bundled into or sent to the browser.

### 1. Obtain a Key
1. Open [Google AI Studio](https://aistudio.google.com/) and sign in.
2. Go to **API Keys** and create or copy an API key for your Google Cloud project.

### 2. Local Environment (`.env`)
Copy `.env.example` to `.env` and replace the placeholder value:

```env
GEMINI_API_KEY="your_actual_gemini_api_key_here"
```

- `.gitignore` ignores all `.env*` files (except `.env.example`), so your local `.env` will not be committed to Git.
- Never prefix this variable with `VITE_`; keeping it unprefixed ensures Vite never exposes it to client code.

### 3. Shell Session (Without `.env`)
You can also pass the key inline or export it in your shell:

```bash
export GEMINI_API_KEY="your_actual_gemini_api_key_here"
npm run dev
```

### 4. Production / Cloud Hosting & AI Studio
- **Google AI Studio**: Configure `GEMINI_API_KEY` in the **Settings > Secrets** panel.
- **Node.js Hosting (Cloud Run, Render, Railway, Fly.io)**: Add `GEMINI_API_KEY` in your service's environment variables / secrets dashboard before starting the app.
- If `GEMINI_API_KEY` is missing or invalid, `/api/generate-plan` returns an explicit error (`503` or `502`) and preserves all user inputs and any existing plan in the UI.

---

## Production Build & Running

Because the app relies on `server.ts` for `/api/generate-plan`, deploy it to a Node.js 22+ runtime rather than static-only hosting (such as GitHub Pages):

```bash
npm install
npm run build
NODE_ENV=production npm start
```

- `PORT` defaults to `3000` and can be overridden via the `PORT` environment variable.
