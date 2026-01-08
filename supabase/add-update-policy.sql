-- Try to create UPDATE policy for storage
-- Run this in Supabase SQL Editor - might work with your permissions

DROP POLICY IF EXISTS "Authenticated update access for wedding media" ON storage.objects;
CREATE POLICY "Authenticated update access for wedding media" ON storage.objects 
    FOR UPDATE USING (bucket_id = 'wedding-media');

-- Also try a more permissive policy
DROP POLICY IF EXISTS "Public upload access for wedding media" ON storage.objects;
CREATE POLICY "Public upload access for wedding media" ON storage.objects 
    FOR ALL USING (bucket_id = 'wedding-media') WITH CHECK (bucket_id = 'wedding-media');
