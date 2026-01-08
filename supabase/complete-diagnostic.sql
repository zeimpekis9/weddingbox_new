-- Complete Diagnostic and Fix for Upload Issues
-- Run this step by step in Supabase SQL Editor

-- Step 1: Check if RLS is enabled
SELECT relrowsecurity FROM pg_class WHERE relname = 'submissions';

-- Step 2: If RLS is disabled, enable it
-- ALTER TABLE submissions ENABLE ROW LEVEL SECURITY;

-- Step 3: Recreate policies with explicit anon role
DROP POLICY IF EXISTS "Guests can insert submissions" ON submissions;
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

-- Step 4: Check storage bucket exists
SELECT * FROM storage.buckets WHERE name = 'wedding-media';

-- Step 5: If bucket doesn't exist, create it (may require admin rights)
-- INSERT INTO storage.buckets (id, name, public) VALUES ('wedding-media', 'wedding-media', true);

-- Step 6: Create storage policies
DROP POLICY IF EXISTS "Allow public uploads" ON storage.objects;
CREATE POLICY "Allow public uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'wedding-media');

DROP POLICY IF EXISTS "Allow public access" ON storage.objects;
CREATE POLICY "Allow public access" ON storage.objects
  FOR SELECT USING (bucket_id = 'wedding-media');
