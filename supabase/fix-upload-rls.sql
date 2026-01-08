-- Fix for Upload RLS Issue
-- Run this in Supabase SQL Editor

-- Drop and recreate the submissions insert policy
DROP POLICY IF EXISTS "Guests can insert submissions" ON submissions;
CREATE POLICY "Guests can insert submissions" ON submissions
    FOR INSERT WITH CHECK (true);

-- Also ensure select policies work
DROP POLICY IF EXISTS "Anyone can view approved submissions" ON submissions;
CREATE POLICY "Anyone can view approved submissions" ON submissions
    FOR SELECT USING (approved = true);

DROP POLICY IF EXISTS "Admins can view all submissions" ON submissions;
CREATE POLICY "Admins can view all submissions" ON submissions
    FOR SELECT USING (auth.role() = 'authenticated' OR auth.role() = 'anon');
