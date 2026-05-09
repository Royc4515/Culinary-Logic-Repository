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

-- Allow users to view only their own items
CREATE POLICY "Users can view own items"
ON culinary_items
FOR SELECT
USING (auth.uid() = user_id);

-- Allow users to insert their own items
CREATE POLICY "Users can insert own items"
ON culinary_items
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Allow users to update their own items
CREATE POLICY "Users can update own items"
ON culinary_items
FOR UPDATE
USING (auth.uid() = user_id);

-- Allow users to delete their own items
CREATE POLICY "Users can delete own items"
ON culinary_items
FOR DELETE
USING (auth.uid() = user_id);
