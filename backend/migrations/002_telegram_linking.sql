-- Telegram ↔ Supabase user linking.
-- Paste this into the Supabase SQL Editor and run.

create table if not exists public.linking_tokens (
  token       text primary key,
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create index if not exists linking_tokens_user_id_idx on public.linking_tokens(user_id);
create index if not exists linking_tokens_expires_at_idx on public.linking_tokens(expires_at);

create table if not exists public.telegram_links (
  telegram_id  bigint primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  username     text,
  linked_at    timestamptz not null default now()
);

create unique index if not exists telegram_links_user_id_idx on public.telegram_links(user_id);

alter table public.linking_tokens enable row level security;
alter table public.telegram_links enable row level security;

-- Frontend (anon/authenticated) only needs to read its own telegram_links row
-- and delete it (disconnect). All writes from the bot go through service_role
-- which bypasses RLS, so no insert/update policies are needed here.
drop policy if exists "Users can read their own telegram_links" on public.telegram_links;
create policy "Users can read their own telegram_links"
on public.telegram_links
for select
using (auth.uid() = user_id);

drop policy if exists "Users can delete their own telegram_links" on public.telegram_links;
create policy "Users can delete their own telegram_links"
on public.telegram_links
for delete
using (auth.uid() = user_id);

-- linking_tokens is service_role only — no frontend access.

-- Backfill: existing items have null user_id. Once a user links their Telegram,
-- new items will be tagged with their user_id automatically. Old rows stay
-- visible via the existing public-read policy.
