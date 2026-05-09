-- Safe RLS Migration — paste into the Supabase SQL Editor.
-- This script does NOT drop or recreate the table; all existing data is preserved.

-- Step 1: Make user_id nullable so the Telegram bot can insert rows.
-- The Python backend uses SUPABASE_SERVICE_ROLE_KEY, which operates outside the
-- Supabase auth context. auth.uid() therefore returns NULL in that context, and a
-- NOT NULL constraint would reject every bot insert with a constraint violation.
ALTER TABLE culinary_items ALTER COLUMN user_id DROP NOT NULL;

-- Step 2: Remove the old per-user policies.
DROP POLICY IF EXISTS "Users can view own items" ON culinary_items;
DROP POLICY IF EXISTS "Users can insert own items" ON culinary_items;
DROP POLICY IF EXISTS "Users can update own items" ON culinary_items;
DROP POLICY IF EXISTS "Users can delete own items" ON culinary_items;

-- Step 3: Create the new two-tier policies.

-- Public SELECT: the gallery loads for any visitor without requiring a login.
-- The anon key (used by the React frontend) satisfies this policy.
CREATE POLICY "Public read access"
ON culinary_items
FOR SELECT
USING (true);

-- Admin-only writes: only a signed-in user (the admin via Google OAuth) can
-- mutate data through the React frontend.
-- The Telegram bot bypasses all RLS via the service_role key — these three
-- policies do not affect it.
CREATE POLICY "Admin insert access"
ON culinary_items
FOR INSERT
WITH CHECK (auth.role() = 'authenticated');

CREATE POLICY "Admin update access"
ON culinary_items
FOR UPDATE
USING (auth.role() = 'authenticated');

CREATE POLICY "Admin delete access"
ON culinary_items
FOR DELETE
USING (auth.role() = 'authenticated');
