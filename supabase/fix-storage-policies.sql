-- Storage Bucket Setup for Wedding Media
-- Run this in Supabase SQL Editor to fix upload issues

-- 1. Create the wedding-media bucket if it doesn't exist
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'wedding-media', 
  'wedding-media', 
  true, 
  10485760, -- 10MB limit
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'video/mp4', 'video/webm', 'audio/webm', 'audio/mp4', 'audio/mpeg']
) ON CONFLICT (id) DO NOTHING;

-- 2. Create storage policies to allow anyone to upload and view files
DROP POLICY IF EXISTS "Anyone can upload to wedding-media" ON storage.objects;
CREATE POLICY "Anyone can upload to wedding-media" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'wedding-media'
  );

DROP POLICY IF EXISTS "Anyone can view wedding-media files" ON storage.objects;
CREATE POLICY "Anyone can view wedding-media files" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'wedding-media'
  );

DROP POLICY IF EXISTS "Anyone can update wedding-media files" ON storage.objects;
CREATE POLICY "Anyone can update wedding-media files" ON storage.objects
  FOR UPDATE USING (
    bucket_id = 'wedding-media'
  );

-- 3. Ensure RLS is enabled on storage
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;

-- 4. Fix submissions table RLS policies (redundant but ensures they work)
DROP POLICY IF EXISTS "Guests can insert submissions" ON submissions;
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Anyone can view approved submissions" ON submissions;
CREATE POLICY "Anyone can view approved submissions" ON submissions
    FOR SELECT USING (approved = true);

DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
CREATE POLICY "Admins can view all submissions" ON submissions
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- 5. Grant necessary permissions
GRANT ALL ON storage.buckets TO anon;
GRANT ALL ON storage.objects TO anon;
