-- Migration 003: per-user privacy.
-- Run AFTER 002_telegram_linking.sql in the Supabase SQL Editor.
-- This converts culinary_items from a shared public dataset into a
-- private, user-scoped dataset. After this migration:
--   • a user only sees their own items
--   • only the owner can insert/update/delete their items
--   • the bot must use a linked telegram_id to attribute saves

-- ---------------------------------------------------------------------------
-- Step 1: Backfill any rows currently owned by NULL.
-- Strategy: assign them to the primary admin (by email), with sensible fallbacks.
-- Adjust the email below if yours is different.
-- ---------------------------------------------------------------------------
do $$
declare
  admin_id uuid;
begin
  select id into admin_id
  from auth.users
  where email = 'roy.y.carmelli@gmail.com'
  limit 1;

  -- Fallback: most recently linked Telegram user
  if admin_id is null then
    select user_id into admin_id
    from public.telegram_links
    order by linked_at desc
    limit 1;
  end if;

  -- Last resort: oldest auth user
  if admin_id is null then
    select id into admin_id
    from auth.users
    order by created_at
    limit 1;
  end if;

  if admin_id is null then
    raise exception 'No auth user found to assign orphan items to. Create a Supabase user first.';
  end if;

  update public.culinary_items
  set user_id = admin_id
  where user_id is null;
end $$;

-- ---------------------------------------------------------------------------
-- Step 2: Make user_id required and indexed.
-- ---------------------------------------------------------------------------
alter table public.culinary_items alter column user_id set not null;
create index if not exists culinary_items_user_id_idx on public.culinary_items(user_id);

-- ---------------------------------------------------------------------------
-- Step 3: Replace the public/shared policies with per-user policies.
-- ---------------------------------------------------------------------------
drop policy if exists "Public read access"   on public.culinary_items;
drop policy if exists "Admin insert access"  on public.culinary_items;
drop policy if exists "Admin update access"  on public.culinary_items;
drop policy if exists "Admin delete access"  on public.culinary_items;

drop policy if exists "Users can read own items"   on public.culinary_items;
drop policy if exists "Users can insert own items" on public.culinary_items;
drop policy if exists "Users can update own items" on public.culinary_items;
drop policy if exists "Users can delete own items" on public.culinary_items;

create policy "Users can read own items"
on public.culinary_items
for select
using (auth.uid() = user_id);

create policy "Users can insert own items"
on public.culinary_items
for insert
with check (auth.uid() = user_id);

create policy "Users can update own items"
on public.culinary_items
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "Users can delete own items"
on public.culinary_items
for delete
using (auth.uid() = user_id);

-- The bot continues to bypass RLS via the service_role key, but it now MUST
-- supply user_id on insert (NOT NULL). The backend refuses to save items from
-- unlinked Telegram chats — see backend/app.py.
