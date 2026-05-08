-- Copy and paste this into the SQL Editor in your Supabase Dashboard

-- 1. Create Enums for type and status to ensure data integrity
CREATE TYPE item_type AS ENUM ('PLACE', 'RECIPE', 'GEAR');
CREATE TYPE item_status AS ENUM ('SAVED', 'EXPERIENCED');

-- 2. Create the main table
CREATE TABLE culinary_items (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
-- Note: Since you are connecting via the anonymous key on the frontend right now,
-- you either need to enable these policies or turn off RLS for testing.

-- Turn on RLS
ALTER TABLE culinary_items ENABLE ROW LEVEL SECURITY;

-- Allow read access to anyone (for the frontend app)
CREATE POLICY "Allow public read access"
ON culinary_items
FOR SELECT
USING (true);

-- Allow insert access to anyone (for the frontend add manually option)
CREATE POLICY "Allow public insert access"
ON culinary_items
FOR INSERT
WITH CHECK (true);

-- Allow update access to anyone (for the frontend toggle status option)
CREATE POLICY "Allow public update access"
ON culinary_items
FOR UPDATE
USING (true);

-- Allow delete access to anyone (if you want this feature later)
CREATE POLICY "Allow public delete access"
ON culinary_items
FOR DELETE
USING (true);
