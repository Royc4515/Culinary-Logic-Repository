# CLR — Project Assessment (Job / Portfolio Readiness)

**Date:** 2026-06-21
**Question being answered:** *Should I keep working on my AI assistant ("CLR") and finish it as a job/portfolio piece?*

**Short answer: Yes — finish it.** The core is genuinely good and shows exactly the skills employers
want (full-stack + practical LLM engineering + a real shipped product). But as it stands it is a
*strong personal project*, not yet a *portfolio centerpiece*. The gap is roughly **2–4 focused days**
of work, and most of that is tests, removing dead code, and fixing stale docs — not new features.

---

## 1. What this actually is

"CLR" (Culinary Logic Repository) is a personal app for saving and organizing culinary discoveries
(restaurants, recipes, kitchen gear). The "AI assistant" is an **LLM ingestion pipeline**:

```
User sends a URL or note to a Telegram bot
  → backend scrapes page metadata (Microlink, BeautifulSoup fallback)   [backend/app.py]
  → optionally enriches via Google Places (address, hours, photos, rating)
  → Groq LLM (llama-3.3-70b) extracts a structured PLACE / RECIPE / GEAR JSON  [backend/prompts.py]
  → saved to Supabase (Postgres + RLS)
  → displayed in a React gallery + map UI                                [src/App.tsx]
```

This is a coherent, real product with a believable use case. That matters — it reads as something you
*use*, not a toy built only to impress.

---

## 2. Strengths (what's already portfolio-grade)

- **Genuinely good LLM engineering** in `backend/app.py` + `backend/prompts.py`:
  - Native JSON mode (`response_format={"type": "json_object"}`)
  - A **model fallback chain** (`llama-3.3-70b` → `llama-3.1-70b` → `llama-3.1-8b-instant`)
  - **Few-shot prompting** with one worked example per type, a system prompt, and a clear schema
  - **External data as ground truth**: Google Places overrides the model for address/hours/phone, while
    the model still writes the prose. This "tools for facts, LLM for language" split is a mature pattern.
- **Security basics done right**:
  - Supabase **Row-Level Security** with per-user scoping (`schema.sql`, `backend/migrations/003`)
  - JWT verification on `/api/link/start`; service-role key stays server-side
  - Short-lived, single-use **linking tokens** with a 5-minute expiry for Telegram account linking
- **Thoughtful UX**: live progress updates over Telegram (`editMessageText`), optimistic UI updates with
  rollback on error, masonry grid, map view, image fallbacks.
- **Polished, responsive frontend** (React 19, Tailwind v4) with distinct mobile/desktop layouts.
- **Good hygiene**: README with screenshots, `.env.example`, ordered SQL migrations.

---

## 3. Weaknesses (what a reviewer or interviewer will ding)

Ordered by how much they hurt you in a job context.

### Must-fix

1. **No tests. Anywhere.** Zero unit or integration tests across frontend and backend. For a portfolio
   project this is the single biggest red flag — the extraction, scraping, and Places-merge logic are
   exactly the kind of code interviewers expect to see covered.
2. **Two competing backends / dead code.** `server.ts` (Express/TypeScript) reimplements the Telegram
   webhook **but has no LLM at all** — it hard-codes `type: "PLACE"` and a stub title. The real pipeline
   is `backend/app.py` (Flask, deployed on Render per `render.yaml`). Yet `server.ts` is what
   `npm run dev` runs and what serves the frontend. A reviewer cloning this will be confused about which
   backend is "real." Pick one story: keep `server.ts` purely as the Vite/static host, or delete its
   dead webhook logic.
3. **Stale, misleading docs.** `LLM_IMPROVEMENT_PLAN.md` describes a frontend "AUTO Smart Add" using
   **Gemini** in `AddSmartItemModal.tsx`. That file doesn't exist and Gemini was removed (commit
   `0916cb3`). Most of the plan's backend items are *already implemented*. The README's headline feature
   — "Paste a URL... CLR automatically extracts structured metadata" — is only true via **Telegram**;
   the web app's only "Add" path is the fully **manual** form (`AddManualItemModal.tsx`). Either rebuild
   the in-app smart-add or correct the README so the claim matches reality.

### Should-fix

4. **No CI.** No `.github/workflows`. The only check is `npm run lint`, and it currently reports
   `implicitly has an 'any' type` errors (e.g. untyped params in `src/App.tsx`). Strict TypeScript is
   not clean. A simple GitHub Action running lint + tests would signal a lot of maturity for little effort.
5. **Broken image fallbacks.** `get_fallback_image()` uses `source.unsplash.com`, which Unsplash
   **retired**; `via.placeholder.com` is also unreliable now. The "beautiful visuals when scraping fails"
   promise is likely silently broken in production.
6. **`Access-Control-Allow-Origin: *`** is applied to every response, including the authenticated
   linking endpoint. Tighten to the known frontend origin(s).

### Nice-to-have

7. No rate limiting / abuse protection on the public `/api/webhook` and `/api/link/start`.
8. Hard-coded personal data in the repo: your email in `migrations/003` and the live backend URL in
   `src/App.tsx`. Fine for a personal project, but worth parameterizing before showing it off.
9. Error handling is solid in `app.py` but inconsistent with the `server.ts` path.

---

## 4. Verdict & recommended punch list

**Finish it.** The hard, interesting part — a working, well-engineered LLM pipeline with real external
enrichment and proper auth/RLS — is done and is the part that's hard to fake. What's missing is the
"professional finish" layer, which is cheap to add and disproportionately moves the needle in hiring.

Suggested order (roughly 2–4 days):

1. **Delete or demote `server.ts`'s dead webhook logic** so there's one clear backend story. *(~2h)*
2. **Add tests** — even a handful: prompt-building, the Places-merge in `app.py`, the JSON-cleanup path,
   and a couple of React component/render tests. This is the highest-leverage item. *(~1 day)*
3. **Add a GitHub Actions CI** running lint + tests; fix the `any` typing errors. *(~3h)*
4. **Fix the README/plan mismatch** — either re-add an in-app AI "smart add" or make the docs honest
   about Telegram being the AI entry point. *(~2h, or ~1 day if rebuilding smart-add)*
5. **Repair the image fallback** (use a working source or the Places photos you already fetch). *(~1h)*
6. Tighten CORS, scrub hard-coded personal data. *(~1h)*

Do 1–4 and this moves from "nice personal project" to something you can confidently put at the top of a
résumé and talk through in an interview.
