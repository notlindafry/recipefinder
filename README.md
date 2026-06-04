# Recipe Finder

Search your personal cookbook catalogue (a Google Sheet of 5,000+ recipes across your
cookbooks) in plain English — _"a soup with chicken and pasta"_, _"italian eggplant
dishes"_, _"guest-worthy desserts I haven't tried"_ — and get back the exact book,
author, chapter, and page to turn to.

Built with **Next.js** and powered by **Claude**, which understands what you mean
(mapping "chicken" → `Poultry`, "soup" → `Soup or stew`, recognizing that "Caprese" is
Italian) instead of just matching keywords.

---

## How it works

1. **Live data.** The app reads your sheet through its _Publish to web_ CSV link, so
   every recipe you add shows up automatically (cached for a few minutes).
2. **Understand.** Claude turns your sentence into a structured filter over your sheet's
   real columns and controlled vocabularies (Category, Main ingredient, Tried tag).
3. **Narrow.** A fast local pass filters and scores candidates — so Claude never has to
   read all 5,000+ rows, and the app stays cheap and quick as your catalogue grows.
4. **Rank & explain.** Claude reranks the top candidates with real culinary knowledge
   and gives a one-line reason for each match.

If no API key is configured, the app gracefully falls back to keyword search.

---

## One-time setup

### 1. Publish your sheet as CSV

In your **Cookbook catalogue** sheet:

`File` → `Share` → `Publish to web` → choose the recipe sheet → **Comma-separated
values (.csv)** → **Publish**. Copy the URL (it looks like
`https://docs.google.com/spreadsheets/d/e/…/pub?gid=0&single=true&output=csv`).

> The published CSV is read-only, but anyone with the link can view it. If you'd prefer
> to keep the sheet fully private, switch to the Google Sheets API (service account) —
> the data layer in `lib/data.ts` is the only thing that would change.

The app expects your existing columns: **Book title, Author, Chapter name, Recipe name,
Page #, Category, Main ingredient, Recipe link, Tried tag, Prep notes.** Column order
doesn't matter — they're matched by name.

### 2. Configure environment variables

```bash
cp .env.example .env.local
```

Then fill in `.env.local`:

- `SHEET_CSV_URL` — the published CSV link from step 1 (**required**)
- `ANTHROPIC_API_KEY` — from <https://console.anthropic.com/> (**required** for
  natural-language search)
- `ANTHROPIC_MODEL` — optional, defaults to `claude-haiku-4-5` (fast + low cost). Use
  `claude-sonnet-4-6` or `claude-opus-4-8` for higher-quality understanding.
- `SHEET_CACHE_TTL_SECONDS` — optional, defaults to `300`.

### 3. Install & run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

---

## Your API key, securely (set once — never per use)

The app reads your key from the `ANTHROPIC_API_KEY` **environment variable** — never
from the code or the UI. You set it **once** per place you run the app, and it stays
out of the repo (`.env*` is gitignored). There is no per-search key prompt.

| Where you run it | Where to put the key (its secret store) |
| --- | --- |
| **Production (Vercel)** | Project → **Settings → Environment Variables** → add `ANTHROPIC_API_KEY`. Encrypted at rest, injected at runtime. This is the permanent "set it once" home. |
| **Claude Code on the web** | Add it as a secret/env var in your environment's configuration so future sessions have it automatically — see <https://code.claude.com/docs/en/claude-code-on-the-web>. |
| **Local development** | `.env.local` (created in step 2). Gitignored, persists between runs. |

**Never** hardcode the key in source or commit a `.env` file. If a key is ever exposed,
rotate it at <https://console.anthropic.com/>.

---

## Deploy (Vercel)

1. Push this repo to GitHub.
2. Import it at <https://vercel.com/new>.
3. Add these environment variables in the Vercel project settings (Production scope):
   `APP_PASSWORD`, `SESSION_SECRET`, `SHEET_CSV_URL`, and your Anthropic key
   (`ANTHROPIC_API_KEY` / `CLAUDE_API_KEY`). **Without `APP_PASSWORD` and
   `SESSION_SECRET` the app fails closed and no one — including you — can log in.**
4. Deploy. You'll get a URL you can open on your phone and add to your home screen.

---

## Security

The app is private by design:

- **Password gate.** Every page and API route is blocked by middleware until you log in
  with `APP_PASSWORD`. Sessions are signed JWTs (HS256, signed with `SESSION_SECRET`)
  stored in an **httpOnly, Secure, SameSite=Lax** cookie that JavaScript can't read.
  Passwords are compared in constant time. Set `SESSION_SECRET` to a long random string
  (`openssl rand -base64 32`).
- **Abuse protection.** Per-IP rate limiting on login (brute force) and search
  (Claude-cost), a 300-character query cap, and filter-size caps. *(Rate limiting is
  in-memory/best-effort per serverless instance; for strict global limits, back it with
  Upstash Redis — see `lib/ratelimit.ts`.)*
- **CSRF.** State-changing POSTs (`/api/login`, `/api/search`) require a same-origin
  `Origin`/`Referer`, on top of the SameSite cookie.
- **Hardened headers.** Every response carries a nonce-based Content-Security-Policy,
  `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy`,
  `Permissions-Policy`, and HSTS.
- **Secrets stay server-side.** The Anthropic key is only ever read on the server; it is
  never sent to the browser.

If you ever think a credential leaked, rotate `APP_PASSWORD` / `SESSION_SECRET` (which
also invalidates all existing sessions) and your Anthropic key.

---

## Project layout

```
app/
  page.tsx            # the search UI (client)
  api/search/route.ts # POST endpoint that runs the search pipeline
lib/
  data.ts             # fetch + parse + cache the published CSV
  search.ts           # parse query → filter/score → rerank (the Claude pipeline)
  vocab.ts            # the sheet's controlled vocabularies
  types.ts            # shared types
```

## Cost

With the default `claude-haiku-4-5`, each search makes two small, prompt-cached Claude
calls (understand + rerank) over a few hundred candidate rows — typically a fraction of
a cent. The local pre-filter keeps token usage flat as your catalogue grows.
