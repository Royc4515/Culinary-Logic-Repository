# CLAUDE.md - Culinary Logic Repository (CLR)

## What this is
Lets a food enthusiast save restaurants, recipes and kitchen gear by forwarding a link, text note, voice message or photo to a Telegram bot, which scrapes, enriches (Google Places) and LLM-extracts it into a structured item shown in a personal web gallery and map.

## Stack & layout
- `backend/app.py` - Flask service (gunicorn on Render, `render.yaml`). Owns ALL server logic: Telegram webhook, scraping (Microlink, BeautifulSoup fallback), Google Places enrichment, LLM extraction, Supabase writes. Routes: `/`, `/api/link/start`, `/api/webhook`. Webhook registration is CLI-only via `backend/set_webhook.py` (the old unauthenticated `/api/setup` route was removed).
- `backend/prompts.py` - extraction prompts (few-shot, one per PLACE / RECIPE / GEAR).
- `backend/migrations/00N_*.sql` - ordered schema changes. `schema.sql` is the baseline (destructive, see Gotchas).
- `backend/set_webhook.py` - register / clear / inspect the Telegram webhook.
- `src/` - React 19 + Vite + Tailwind v4 SPA (Vercel, `vercel.json`). `src/App.tsx` is the main screen; `src/lib/supabase.ts` is the browser Supabase client; `src/data/mockData.ts` holds the `CulinaryItem` type.
- `server.ts` - frontend host only (Vite middleware in dev, static `dist/` in prod). No API logic; keep it that way.
- LLM: text extraction via `LLM_PROVIDER` = `groq` (default) | `gemini` | `anthropic`. Voice (Whisper) and photo vision always use Groq.

## Commands
- Frontend install: `npm ci` (verified)
- Frontend dev: `npm run dev` (runs `tsx server.ts`, port 3000) - unverified
- Type check: `npm run lint` (`tsc --noEmit`) - verified, passes
- Build: `npm run build` - verified, passes (chunk-size warning only)
- Backend: `cd backend && pip install -r requirements.txt && python app.py` (port 8000) - unverified; `bash backend/run_local.sh` does venv + env check + start
- Backend syntax check: `python3 -m py_compile backend/*.py` - verified
- Webhook: `python backend/set_webhook.py <https://host/api/webhook> | --delete | --info`
- Tests: none exist. There is no CI.

## Conventions (Roy's standing rules)
- Comments explain WHY, not what.
- Flag counterintuitive, load-bearing or past-bug-hiding lines with a `don't touch / <reason>` comment (`#` in Python/SQL-style `--`, `//` in TS).
- Edge cases and input validation are priorities; prefer clean OOP, good naming, reuse.
- No em dashes in any user-facing text or docs; use a plain hyphen.
- Secrets only via environment variables, never committed.

## Supabase rules
- Schema changes go through a new numbered file in `backend/migrations/` (next: `005_*.sql`), committed with the code that needs it. Never run ad-hoc SQL against the live project.
- Keys: backend reads `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` from env (`.env` locally, Render dashboard in prod). The service-role key bypasses RLS and must NEVER reach the frontend: no `VITE_` prefix, no import from `src/`.
- Frontend uses only the public anon key, hardcoded in `src/lib/supabase.ts` (intentional, see Gotchas). All browser access is gated by per-user RLS (`migrations/003`).
- `linking_tokens` and `pending_items` have RLS enabled with no client policies: service-role only by design.

## Gotchas
- `src/lib/supabase.ts` ignores `VITE_SUPABASE_ANON_KEY` on purpose: the Vercel env var was once set to an unrelated Google key and broke auth. Do not "fix" it back to env.
- `src/App.tsx` falls back to the hardcoded Render URL when `VITE_BACKEND_URL` is unset.
- `schema.sql` starts with `DROP TABLE culinary_items`. Never run it against a project with data.
- `/api/webhook` returns 403 unless `X-Telegram-Bot-Api-Secret-Token` matches `TELEGRAM_WEBHOOK_SECRET`. If the env var is unset it logs a warning and accepts everything (local dev only). Changing the secret means re-running `set_webhook.py` after the deploy is live, or every update is rejected until you do.
- Preview-before-save depends on migration 004; without `pending_items` the bot silently falls back to immediate save + "Remove" button (`app.py`, `create_pending_item`).
- CORS: `ALLOWED_ORIGINS` empty = `*`. Any non-empty value switches to restricted mode, so leave it blank locally.
- `render.yaml` does not declare `LLM_PROVIDER`, `GEMINI_*` or `ANTHROPIC_*`; add them in the Render UI when switching provider.
- Groq model names drift: `MODELS_TO_TRY` (env `GROQ_TEXT_MODELS`) and `VISION_MODELS` (env `GROQ_VISION_MODELS`) are fallback chains. If every text model fails, `_groq_complete_json` discovers usable models via `models.list()`. The webhook's 500 body includes a `reason` field with the last LLM error.
- The server.ts header comment points to `backend/render.yaml`; the file is at the repo root.
- `ASSESSMENT.md` (2026-06-21) is partly stale: server.ts no longer has webhook logic, `npm run lint` now passes, the fallback images no longer use `source.unsplash.com`.
- Frontend Maps key is `GOOGLE_MAPS_PLATFORM_KEY` (injected in `vite.config.ts`) and is missing from `.env.example`; backend uses `MAPS_API_KEY`.
- `app.py` `__main__` runs Flask with `debug=True`; production must go through gunicorn.
