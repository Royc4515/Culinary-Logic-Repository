-- Copy and paste this into the SQL Editor in your Supabase Dashboard

-- Drop existing tables and types so this script can be re-run cleanly
DROP TABLE IF EXISTS culinary_items;
DROP TYPE IF EXISTS item_type;
DROP TYPE IF EXISTS item_status;

-- 1. Create Enums for type and status to ensure data integrity
CREATE TYPE item_type AS ENUM ('PLACE', 'RECIPE', 'GEAR');
CREATE TYPE item_status AS ENUM ('SAVED', 'EXPERIENCED');

-- 2. Create the main table
CREATE TABLE culinary_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users NOT NULL DEFAULT auth.uid(),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    type item_type NOT NULL,
    title TEXT NOT NULL,
    thumbnail_url TEXT NOT NULL,
    context_tags TEXT[] DEFAULT '{}',
    original_url TEXT,
    status item_status DEFAULT 'SAVED',
    specific_data JSONB DEFAULT '{}'::jsonb
);

-- 3. Set up Row Level Security (RLS) policies
ALTER TABLE culinary_items ENABLE ROW LEVEL SECURITY;

-- Anyone (including unauthenticated visitors) can view items in the public gallery.
-- The Telegram bot bypasses RLS entirely via the service_role key, so this policy
-- is only relevant to the anon key used by the React frontend.
CREATE POLICY "Public read access"
ON culinary_items
FOR SELECT
USING (true);

-- Only a signed-in admin can write data. The Telegram bot uses the service_role key
-- and therefore bypasses RLS — these three policies only gate the React frontend.
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
