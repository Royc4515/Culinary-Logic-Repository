-- Preview-before-save: holds a parsed item between the bot's preview and the
-- user's ✅ Save / ❌ Discard choice. Paste this into the Supabase SQL Editor
-- and run it once to enable the confirm-before-save flow. (Until it's run, the
-- bot falls back to saving immediately with an inline "❌ Remove" button.)

create table if not exists public.pending_items (
  id          uuid primary key default gen_random_uuid(),
  telegram_id bigint not null,
  user_id     uuid not null references auth.users(id) on delete cascade,
  payload     jsonb not null,
  created_at  timestamptz not null default now()
);

create index if not exists pending_items_telegram_id_idx on public.pending_items(telegram_id);

-- The backend talks to this table with the service_role key (which bypasses
-- RLS). Enable RLS with no policies so anon/authenticated clients are denied.
alter table public.pending_items enable row level security;
